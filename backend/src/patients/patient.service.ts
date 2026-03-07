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

function createGatewayClient(): AxiosInstance {
  const client = axios.create({
    baseURL: process.env.HIE_GATEWAY_URL || 'http://localhost:5000',
    timeout: 60000,
    headers: {
      'X-Facility-Id': process.env.FACILITY_ID     || '',
      'X-Api-Key':     process.env.FACILITY_API_KEY || '',
      'Content-Type':  'application/json',
    },
  });

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
  // ══════════════════════════════════════════════════════════════

  async create(data: {
    nationalId:       string;
    firstName:        string;
    lastName:         string;
    middleName?:      string;
    dateOfBirth:      string;
    gender:           'male' | 'female' | 'other' | 'unknown';
    phoneNumber?:     string;
    email?:           string;
    address?:         object;
    securityQuestion: string;
    securityAnswer:   string;
    pin:              string;
  }) {
    const nupiRes = await gateway.post('/api/patients/nupi', {
      nationalId: data.nationalId,
      dob:        data.dateOfBirth,
    });
    const nupi: string = nupiRes.data.nupi;

    const existing = await db.query.patients.findFirst({
      where: eq(patients.nupi, nupi),
    });
    if (existing) {
      return { patient: existing, alreadyExists: true, nupi };
    }

    const chainRes = await gateway.post('/api/patients/register', {
      nationalId:       data.nationalId,
      dob:              data.dateOfBirth,
      name:             `${data.firstName} ${data.lastName}`,
      securityQuestion: data.securityQuestion,
      securityAnswer:   data.securityAnswer,
      pin:              data.pin,
    });

    const { blockIndex } = chainRes.data;

    const [patient] = await db.insert(patients).values({
      nupi,
      nationalId:           data.nationalId,
      firstName:            data.firstName,
      lastName:             data.lastName,
      middleName:           data.middleName  ?? null,
      dateOfBirth:          new Date(data.dateOfBirth),
      gender:               (data.gender ?? 'unknown') as 'male' | 'female' | 'other' | 'unknown',
      phoneNumber:          data.phoneNumber ?? null,
      email:                data.email       ?? null,
      address:              data.address     ?? null,
      registeredFacilityId: process.env.FACILITY_ID || null,
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
  //  Local DB first, then gateway fallback + local cache
  // ══════════════════════════════════════════════════════════════

  async getByNupi(nupi: string, accessToken?: string) {
    const local = await db.query.patients.findFirst({
      where: eq(patients.nupi, nupi),
    });
    if (local) return { patient: local, source: 'local' };

    if (!accessToken) return null;

    try {
      const res = await gateway.get(`/api/fhir/Patient/${nupi}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const fhir = res.data;
      if (!fhir || fhir.resourceType !== 'Patient') return null;

      const name    = fhir.name?.[0];
      const telecom = fhir.telecom || [];
      const addr    = fhir.address?.[0];

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
      console.error('getByNupi gateway error:', err.response?.status, err.response?.data);
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  SEARCH
  // ══════════════════════════════════════════════════════════════

  async searchNUPI(query: string) {
    return db.query.patients.findMany({
      where: or(
        ilike(patients.nupi,       `%${query}%`),
        ilike(patients.firstName,  `%${query}%`),
        ilike(patients.lastName,   `%${query}%`),
        ilike(patients.nationalId, `%${query}%`),
      ),
      limit: 20,
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  VERIFY PATIENT IDENTITY
  // ══════════════════════════════════════════════════════════════

  async getSecurityQuestion(nationalId: string, dob: string) {
    const res = await gateway.post('/api/verify/question', { nationalId, dob });
    return res.data;
  }

  async verifyIdentity(data: { nationalId: string; dob: string; answer: string }) {
    const res = await gateway.post('/api/verify/answer', {
      nationalId: data.nationalId,
      dob:        data.dob,
      answer:     data.answer,
    }, {
      headers: { 'X-Api-Key': process.env.FACILITY_API_KEY || '' },
    });
    return res.data;
  }

  async verifyByPin(data: { nationalId: string; dob: string; pin: string }) {
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
  // ══════════════════════════════════════════════════════════════

  async getPatientHistory(nupi: string) {
    const res = await gateway.get(`/api/patients/${nupi}/history`);
    return res.data;
  }

  async getPatientFacilities(nupi: string) {
    const history = await this.getPatientHistory(nupi);
    return history.facilitiesVisited || [];
  }

  // ══════════════════════════════════════════════════════════════
  //  ENCOUNTERS
  // ══════════════════════════════════════════════════════════════

  async getLocalEncounters(nupi: string) {
    return db.query.encounters.findMany({
      where: eq(encounters.patientNupi, nupi),
      orderBy: (enc, { desc }) => [desc(enc.encounterDate)],
    });
  }

  async getEncountersFromFacility(nupi: string, facilityId: string, accessToken: string) {
    const res = await gateway.get(`/api/fhir/Patient/${nupi}/Encounter`, {
      params:  { facility: facilityId },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.data;
  }

  async getFederatedEncounters(nupi: string, accessToken: string) {
    const res = await gateway.get(`/api/fhir/Patient/${nupi}/$everything`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const bundle = res.data;
    const encounters = bundle.entry
      ?.map((e: any) => e.resource)
      .filter((r: any) => r?.resourceType === 'Encounter') || [];
    return { bundle, encounters };
  }

  // ══════════════════════════════════════════════════════════════
  //  FULL FEDERATED PATIENT DATA
  // ══════════════════════════════════════════════════════════════

  async getFederatedPatientData(nupi: string, accessToken: string) {
    const [localPatient, localEncounters, federatedBundle, chainHistory] = await Promise.all([
      db.query.patients.findFirst({ where: eq(patients.nupi, nupi) }),
      this.getLocalEncounters(nupi),
      this.getFederatedEncounters(nupi, accessToken).catch(() => ({ bundle: null, encounters: [] })),
      this.getPatientHistory(nupi).catch(() => null),
    ]);

    let patient = localPatient ?? undefined;
    if (!patient) {
      try {
        const result = await this.getByNupi(nupi, accessToken);
        patient = result?.patient ?? undefined;
      } catch {
        // patient stays undefined — still return encounter/facility data
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
      patient,
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
  //  Auto-fetches patient from gateway if not in local DB
  // ══════════════════════════════════════════════════════════════

  async recordEncounter(data: {
    nupi:              string;
    accessToken?:      string;   // required if patient not in local DB
    encounterId?:      string;
    encounterType:     'outpatient' | 'inpatient' | 'emergency' | 'check-in' | 'referral' | 'virtual';
    encounterDate?:    string;
    chiefComplaint?:   string;
    practitionerName?: string;
    vitalSigns?:       object;
    diagnoses?:        any[];
    medications?:      any[];
    notes?:            string;
  }) {
    // ── Ensure patient is in local DB ──────────────────────────
    let localPatient = await db.query.patients.findFirst({
      where: eq(patients.nupi, data.nupi),
    });

    if (!localPatient) {
      if (!data.accessToken) {
        throw new Error(`Patient ${data.nupi} not in local DB — verify patient identity first`);
      }
      console.log(`⬇️  Patient not local — fetching from gateway: ${data.nupi}`);
      const result = await this.getByNupi(data.nupi, data.accessToken);
      if (!result) throw new Error(`Patient ${data.nupi} not found on AfyaNet`);
      localPatient = result.patient;
      console.log(`✅ Patient cached locally: ${data.nupi}`);
    }

    // ── Save encounter to local Neon DB ────────────────────────
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

    // ── Notify blockchain via gateway ──────────────────────────
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
      console.error('⚠️  Chain notification failed (encounter saved locally):', err.message);
      return { encounter, blockIndex: null, chainError: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  CHECK-IN
  //  Pulls patient from gateway into local DB then records visit
  // ══════════════════════════════════════════════════════════════

  async checkIn(nupi: string, data: {
    accessToken:       string;
    practitionerName?: string;
    chiefComplaint?:   string;
  }) {
    let local = await db.query.patients.findFirst({ where: eq(patients.nupi, nupi) });

    if (!local) {
      const result = await this.getByNupi(nupi, data.accessToken);
      if (!result) throw new Error('Patient not found on AfyaNet');
      local = result.patient;
    }

    return this.recordEncounter({
      nupi,
      accessToken:      data.accessToken,
      encounterType:    'check-in',
      chiefComplaint:   data.chiefComplaint   || undefined,
      practitionerName: data.practitionerName || undefined,
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  REGISTER VISIT
  // ══════════════════════════════════════════════════════════════

  async registerVisit(nupi: string, data: {
    accessToken?:      string;
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
      accessToken:      data.accessToken      || undefined,
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

export function startGatewayKeepAlive() {
  if (process.env.NODE_ENV !== 'production') return;

  const INTERVAL = 10 * 60 * 1000;

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