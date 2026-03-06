/**
 * PatientService
 * ══════════════
 * Handles all patient operations for this facility.
 *
 * Every write that touches the blockchain goes through the HIE Gateway.
 * Local Neon (PostgreSQL) is the source of truth for this facility's
 * clinical data. The gateway is the source of truth for cross-facility
 * data and the blockchain.
 *
 * Gateway headers required on every call:
 *   X-Facility-Id: <FACILITY_ID from .env>
 *   X-Api-Key:     <API_KEY from .env>   ← issued once by MoH on registration
 *
 * Patient access token (from /api/verify/answer) goes in:
 *   Authorization: Bearer <token>
 */

import { eq, or, ilike } from 'drizzle-orm';
import axios, { AxiosInstance } from 'axios';
import db from '../db/db';
import { patients, encounters } from '../db/schema';

// ── Gateway client ────────────────────────────────────────────────
// Single axios instance with facility credentials pre-attached.
// Every request this facility makes to the gateway uses these headers
// so the gateway can verify it's a legitimate registered facility.

function createGatewayClient(): AxiosInstance {
  const client = axios.create({
    baseURL: process.env.HIE_GATEWAY_URL || 'http://localhost:5000',
    timeout: 60000, // 60s — allows for Render free tier cold start (~30-50s)
    headers: {
      'X-Facility-Id': process.env.FACILITY_ID    || '',
      'X-Api-Key':     process.env.FACILITY_API_KEY || '',
      'Content-Type':  'application/json',
    },
  });

  // Log every gateway call in development
  if (process.env.NODE_ENV === 'development') {
    client.interceptors.request.use(req => {
      console.log(`→ Gateway: ${req.method?.toUpperCase()} ${req.url}`);
      return req;
    });
  }

  return client;
}

const gateway = createGatewayClient();

// ─────────────────────────────────────────────────────────────────

export class PatientService {

  // ══════════════════════════════════════════════════════════════
  //  PATIENT REGISTRATION
  //  Saves to local Neon DB + registers on blockchain via gateway
  // ══════════════════════════════════════════════════════════════

  async create(data: {
    nationalId:       string;
    firstName:        string;
    lastName:         string;
    middleName?:      string;
    dateOfBirth:      string;   // YYYY-MM-DD
    gender:           'male' | 'female' | 'other' | 'unknown';
    phoneNumber?:     string;
    email?:           string;
    address?:         object;
    securityQuestion: string;
    securityAnswer:   string;
    pin:              string;   // exactly 4 digits
  }) {
    // ── Step 1: Derive NUPI from gateway (deterministic hash) ──
    const nupiRes = await gateway.post('/api/patients/nupi', {
      nationalId: data.nationalId,
      dob:        data.dateOfBirth,
    });
    const nupi: string = nupiRes.data.nupi;

    // ── Step 2: Check if patient already exists locally ────────
    const existing = await db.query.patients.findFirst({
      where: eq(patients.nupi, nupi),
    });
    if (existing) {
      return { patient: existing, alreadyExists: true, nupi };
    }

    // ── Step 3: Register on blockchain via gateway ─────────────
    // This mints a PATIENT_REGISTERED block and auto-grants
    // network consent so all facilities can see this patient.
    const chainRes = await gateway.post('/api/patients/register', {
      nationalId:       data.nationalId,
      dob:              data.dateOfBirth,
      name:             `${data.firstName} ${data.lastName}`,
      securityQuestion: data.securityQuestion,
      securityAnswer:   data.securityAnswer,
      pin:              data.pin,
    });

    const { blockIndex } = chainRes.data;

    // ── Step 4: Save to local Neon DB ──────────────────────────
    // We do NOT store the security answer or PIN locally —
    // those live only on the gateway/blockchain (hashed).
    const [patient] = await db.insert(patients).values({
      nupi,
      nationalId:  data.nationalId,
      firstName:   data.firstName,
      lastName:    data.lastName,
      middleName:  data.middleName  ?? null,
      dateOfBirth: new Date(data.dateOfBirth),
      gender:      (data.gender ?? 'unknown') as 'male' | 'female' | 'other' | 'unknown',
      phoneNumber: data.phoneNumber ?? null,
      email:       data.email       ?? null,
      address:     data.address     ?? null,
      registeredFacilityId: process.env.FACILITY_ID || null,   // ← add this
    }).returning();

    console.log(`✅ Patient registered: ${nupi} | Block #${blockIndex}`);
    return { patient, alreadyExists: false, nupi, blockIndex };
  }

  // ══════════════════════════════════════════════════════════════
  //  GET PATIENT BY LOCAL DB ID
  // ══════════════════════════════════════════════════════════════

  async getById(id: string) {
    return db.query.patients.findFirst({
      where: eq(patients.id, id),
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  GET PATIENT BY NUPI
  //  Checks local DB first, then gateway if not found locally.
  //  accessToken — the bearer token from /api/verify/answer
  // ══════════════════════════════════════════════════════════════

  async getByNupi(nupi: string, accessToken?: string) {
    // ── Local first ────────────────────────────────────────────
    const local = await db.query.patients.findFirst({
      where: eq(patients.nupi, nupi),
    });
    if (local) return { patient: local, source: 'local' };

    // ── Not local — query gateway ──────────────────────────────
    if (!accessToken) {
      return null; // can't query gateway without a verified token
    }

    try {
      const res = await gateway.get(`/api/fhir/Patient/${nupi}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const fhir = res.data;
      if (!fhir || fhir.resourceType !== 'Patient') return null;

      // Cache the federated record locally so future lookups are fast
      const name   = fhir.name?.[0];
      const telecom = fhir.telecom || [];
      const addr   = fhir.address?.[0];

      const [patient] = await db.insert(patients).values({
        nupi,
        firstName:         name?.given?.[0]  || 'Unknown',
        lastName:          name?.family       || 'Unknown',
        middleName:        name?.given?.[1]   ?? null,
        dateOfBirth:       fhir.birthDate ? new Date(fhir.birthDate) : new Date('1900-01-01'),
        gender:            (fhir.gender || 'unknown') as 'male' | 'female' | 'other' | 'unknown',
        phoneNumber:       telecom.find((t: any) => t.system === 'phone')?.value ?? null,
        email:             telecom.find((t: any) => t.system === 'email')?.value ?? null,
        address:           addr ? { county: addr.state, subCounty: addr.district, ward: addr.city } : null,
        isFederatedRecord: true,
      }).returning();

      return { patient, source: 'gateway' };
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  SEARCH PATIENT BY NUPI PREFIX / NAME
  //  Local DB only — for the facility's own patient list
  // ══════════════════════════════════════════════════════════════

  async searchNUPI(query: string) {
    return db.query.patients.findMany({
      where: or(
        ilike(patients.nupi,      `%${query}%`),
        ilike(patients.firstName, `%${query}%`),
        ilike(patients.lastName,  `%${query}%`),
        ilike(patients.nationalId,`%${query}%`),
      ),
      limit: 20,
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  VERIFY PATIENT IDENTITY
  //  Step 1 — get security question from gateway
  //  Step 2 — submit answer → get access token
  //  The access token is what unlocks all cross-facility queries
  // ══════════════════════════════════════════════════════════════

  async getSecurityQuestion(nationalId: string, dob: string) {
    const res = await gateway.post('/api/verify/question', { nationalId, dob });
    return res.data; // { nupi, question }
  }

  async verifyIdentity(data: {
    nationalId: string;
    dob:        string;
    answer:     string;
  }) {
    // X-Facility-Id and X-Api-Key are already on the gateway client.
    // The gateway also needs them on /api/verify/answer to confirm
    // it's a registered facility requesting the token.
    const res = await gateway.post('/api/verify/answer', {
      nationalId:         data.nationalId,
      dob:                data.dob,
      answer:             data.answer,
    }, {
      // Pass facility API key in header for this endpoint too
      headers: { 'X-Api-Key': process.env.FACILITY_API_KEY || '' },
    });

    // res.data contains:
    // { token, nupi, patient, facilitiesVisited, encounterIndex, consentId, blockIndex }
    return res.data;
  }

  async verifyByPin(data: {
    nationalId: string;
    dob:        string;
    pin:        string;
  }) {
    const res = await gateway.post('/api/verify/pin', {
      nationalId:         data.nationalId,
      dob:                data.dob,
      pin:                data.pin,
      requestingFacility: process.env.FACILITY_ID,
    }, {
      headers: { 'X-Api-Key': process.env.FACILITY_API_KEY || '' },
    });
    return res.data;
  }

  // ══════════════════════════════════════════════════════════════
  //  PATIENT HISTORY FROM BLOCKCHAIN
  //  Returns which facilities the patient has visited + encounter
  //  index — all from the immutable blockchain record
  // ══════════════════════════════════════════════════════════════

  async getPatientHistory(nupi: string) {
    const res = await gateway.get(`/api/patients/${nupi}/history`);
    return res.data;
    // { patient, facilitiesVisited, encounterIndex, auditTrail }
  }

  async getPatientFacilities(nupi: string) {
    const history = await this.getPatientHistory(nupi);
    return history.facilitiesVisited || [];
  }

  // ══════════════════════════════════════════════════════════════
  //  ENCOUNTERS
  // ══════════════════════════════════════════════════════════════

  // Get this facility's encounters from local Neon DB
  async getLocalEncounters(nupi: string) {
    return db.query.encounters.findMany({
      where: eq(encounters.patientNupi, nupi),
      orderBy: (enc, { desc }) => [desc(enc.encounterDate)],
    });
  }

  // Get encounters from a specific facility via gateway
  // accessToken — bearer token from verifyIdentity()
  async getEncountersFromFacility(nupi: string, facilityId: string, accessToken: string) {
    const res = await gateway.get(`/api/fhir/Patient/${nupi}/Encounter`, {
      params:  { facility: facilityId },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.data; // FHIR Bundle
  }

  // Get ALL encounters from ALL facilities the patient has visited
  // This is the federated view — calls gateway $everything
  async getFederatedEncounters(nupi: string, accessToken: string) {
    const res = await gateway.get(`/api/fhir/Patient/${nupi}/$everything`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const bundle = res.data;

    // Extract just the Encounter resources from the bundle
    const encounters = bundle.entry
      ?.map((e: any) => e.resource)
      .filter((r: any) => r?.resourceType === 'Encounter') || [];

    return { bundle, encounters };
  }

  // ══════════════════════════════════════════════════════════════
  //  FULL FEDERATED PATIENT DATA
  //  Combines local Neon data + all gateway data into one response.
  //  This is what the doctor sees when they open a patient chart.
  // ══════════════════════════════════════════════════════════════

  async getFederatedPatientData(nupi: string, accessToken: string) {
    const [localPatient, localEncounters, federatedBundle, chainHistory] = await Promise.all([
      db.query.patients.findFirst({ where: eq(patients.nupi, nupi) }),
      this.getLocalEncounters(nupi),
      this.getFederatedEncounters(nupi, accessToken).catch(() => ({ bundle: null, encounters: [] })),
      this.getPatientHistory(nupi).catch(() => null),
    ]);

    // ── If patient isn't local, pull from gateway ──────────────
    let patient = localPatient ?? undefined;
    if (!patient) {
      try {
        const result = await this.getByNupi(nupi, accessToken);
        patient = result?.patient ?? undefined;
      } catch {
        // patient stays undefined
      }
    }

    const facilityId = process.env.FACILITY_ID || '';

    const localFormatted = localEncounters.map((e: any) => ({
      ...e,
      source:       'local',
      facilityName: process.env.FACILITY_NAME || 'This Facility',
    }));

    const remoteEncounters = federatedBundle.encounters
      .filter((e: any) => e.meta?.source !== facilityId)
      .map((e: any) => ({
        id:             e.id,
        patientNupi:    nupi,
        encounterDate:  e.period?.start,
        encounterType:  e.class?.display,
        chiefComplaint: e.reasonCode?.[0]?.text || null,
        practitioner:   e.participant?.[0]?.individual?.display || null,
        facilityId:     e.meta?.source,
        facilityName:   e.meta?.sourceName || e.serviceProvider?.display,
        source:         'gateway',
        status:         e.status,
      }));

    const allEncounters = [...localFormatted, ...remoteEncounters]
      .sort((a, b) => new Date(b.encounterDate).getTime() - new Date(a.encounterDate).getTime());

    return {
      patient,                                          // ← now populated from gateway if not local
      encounters:        allEncounters,
      localEncounters:   localFormatted,
      remoteEncounters,
      facilitiesVisited: chainHistory?.facilitiesVisited || [],
      encounterIndex:    chainHistory?.encounterIndex    || [],
      totalEncounters:   allEncounters.length,
      consentVerified:   true,
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  RECORD ENCOUNTER
  //  1. Save full clinical data to local Neon DB
  //  2. Notify gateway → mints ENCOUNTER_RECORDED block on chain
  //     so other facilities know this patient was seen here
  // ══════════════════════════════════════════════════════════════

  async recordEncounter(data: {
    nupi:             string;
    encounterId?:     string;
    encounterType:    'outpatient' | 'inpatient' | 'emergency' | 'check-in' | 'referral' | 'virtual';
    encounterDate?:   string;
    chiefComplaint?:  string;
    practitionerName?:string;
    vitalSigns?:      object;
    diagnoses?:       any[];
    medications?:     any[];
    notes?:           string;
  }) {
    // Look up the local patient row to get the UUID FK required by encounters.patientId
    const localPatient = await db.query.patients.findFirst({
      where: eq(patients.nupi, data.nupi),
    });
    if (!localPatient) throw new Error(`Patient ${data.nupi} not in local DB — register or check-in first`);

    // ── Step 1: Save to local Neon DB ──────────────────────────
    const [encounter] = await db.insert(encounters).values({
      patientId:        localPatient.id,
      patientNupi:      data.nupi,
      facilityId:       process.env.FACILITY_ID || '',
      encounterType:    (data.encounterType ?? 'outpatient') as 'outpatient' | 'inpatient' | 'emergency' | 'check-in' | 'referral' | 'virtual',
      encounterDate:    data.encounterDate ? new Date(data.encounterDate) : new Date(),
      chiefComplaint:   data.chiefComplaint    ?? null,
      practitionerName: data.practitionerName  ?? 'Unknown',
      vitalSigns:       data.vitalSigns        ?? null,
      diagnoses:        data.diagnoses         ?? [],
      medications:      data.medications       ?? null,
      notes:            data.notes             ?? null,
      status:           'finished',
    }).returning();

    // ── Step 2: Notify blockchain via gateway ──────────────────
    // This mints ENCOUNTER_RECORDED block so other facilities
    // know this patient was seen here.
    try {
      const chainRes = await gateway.post('/api/patients/encounter', {
        nupi:             data.nupi,
        encounterId:      encounter.id,
        encounterType:    data.encounterType,
        encounterDate:    encounter.encounterDate?.toISOString(),
        chiefComplaint:   data.chiefComplaint   ?? null,
        practitionerName: data.practitionerName ?? null,
      });

      console.log(`⛓  Encounter on chain: Block #${chainRes.data.blockIndex}`);
      return { encounter, blockIndex: chainRes.data.blockIndex };
    } catch (err: any) {
      // Don't fail the local save if the chain notification fails —
      // the clinical record is more important. Log and move on.
      console.error('⚠️  Chain notification failed (encounter saved locally):', err.message);
      return { encounter, blockIndex: null, chainError: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  CHECK-IN
  //  Registers the patient's visit at this facility.
  //  If the patient isn't in local DB, pull from gateway first.
  // ══════════════════════════════════════════════════════════════

  async checkIn(nupi: string, data: {
    accessToken:      string;  // from verifyIdentity()
    practitionerName?: string;
    chiefComplaint?:   string;
  }) {
    // Ensure patient is in local DB
    let local = await db.query.patients.findFirst({ where: eq(patients.nupi, nupi) });

    if (!local) {
      // Pull from gateway and cache locally
      const result = await this.getByNupi(nupi, data.accessToken);
      if (!result) throw new Error('Patient not found on AfyaNet');
      local = result.patient;
    }

    // Record a check-in encounter on chain
    return this.recordEncounter({
      nupi,
      encounterType:    'check-in',
      chiefComplaint:   data.chiefComplaint   || undefined,
      practitionerName: data.practitionerName || undefined,
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  REGISTER VISIT  (alias for recordEncounter with visit data)
  // ══════════════════════════════════════════════════════════════

  async registerVisit(nupi: string, data: {
    accessToken:       string;
    encounterType?:    'outpatient' | 'inpatient' | 'emergency' | 'check-in' | 'referral' | 'virtual';
    chiefComplaint?:   string;
    practitionerName?: string;
    vitalSigns?:       object;
    diagnoses?:        any[];
    medications?:      any[];
    notes?:            string;
  }) {
    return this.recordEncounter({
      nupi,
      encounterType:    data.encounterType    ?? 'outpatient',
      chiefComplaint:   data.chiefComplaint   || undefined,
      practitionerName: data.practitionerName || undefined,
      vitalSigns:       data.vitalSigns       || undefined,
      diagnoses:        data.diagnoses        || undefined,
      medications:      data.medications      || undefined,
      notes:            data.notes            || undefined,
    });
  }
}

export const patientService = new PatientService();


// ── Keep-alive ping ───────────────────────────────────────────────
// Render free tier spins down after 15 min inactivity.
// Ping the gateway every 10 minutes so it stays warm.
// Call startGatewayKeepAlive() once in your app entry point (server.ts / index.ts).

export function startGatewayKeepAlive() {
  if (process.env.NODE_ENV !== 'production') return;

  const INTERVAL = 10 * 60 * 1000; // 10 minutes

  setInterval(async () => {
    try {
      await gateway.get('/health');
      console.log('🏓 Gateway keep-alive ping OK');
    } catch {
      console.warn('⚠️  Gateway keep-alive ping failed — it may be cold starting');
    }
  }, INTERVAL);

  console.log('🏓 Gateway keep-alive started (every 10 min)');
}