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
 *   X-Api-Key:     <FACILITY_API_KEY from .env>
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
      'X-Facility-Id': process.env.FACILITY_ID      || '',
      'X-Api-Key':     process.env.FACILITY_API_KEY  || '',
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
    // FIX: was POST /api/patients/nupi with a body — gateway changed this
    //      to GET /api/patients/nupi?nationalId=X&dob=Y (no side effects)
    const nupiRes = await gateway.get('/api/patients/nupi', {
      params: { nationalId: data.nationalId, dob: data.dateOfBirth },
    });

    console.log(nupiRes)
    
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
    // 1. Check local DB first
    const local = await db.query.patients.findFirst({ where: eq(patients.nupi, nupi) });
    if (local) return { patient: local, source: 'local' };

    // 2. Try FHIR $everything via gateway — returns real demographics from source facility
    if (accessToken) {
      try {
        const fhirRes    = await gateway.get(`/api/fhir/Patient/${nupi}/$everything`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10000,
        });
        const bundle     = fhirRes.data;
        const fhirPt     = bundle?.entry?.map((e: any) => e.resource).find((r: any) => r?.resourceType === 'Patient');

        if (fhirPt) {
          const name       = fhirPt.name?.[0];
          const firstName  = name?.given?.join(' ') || (fhirPt.name?.[0]?.text?.split(' ')?.[0] ?? 'Unknown');
          const lastName   = name?.family           || (fhirPt.name?.[0]?.text?.split(' ')?.slice(1).join(' ') ?? '');
          const dob        = fhirPt.birthDate ? new Date(fhirPt.birthDate) : null;
          const phone      = fhirPt.telecom?.find((t: any) => t.system === 'phone')?.value || null;
          const county     = fhirPt.address?.[0]?.district || fhirPt.address?.[0]?.state || null;
          const subCounty  = fhirPt.address?.[0]?.city || null;
          const gender     = (['male','female','other','unknown'].includes(fhirPt.gender) ? fhirPt.gender : 'unknown') as any;

          // Only persist if we have meaningful data (real DOB, not placeholder)
          if (dob && dob.getFullYear() > 1900) {
            const [patient] = await db.insert(patients).values({
              nupi,
              nationalId:        fhirPt.identifier?.find((id: any) => id.system?.includes('national'))?.value || null,
              firstName, lastName,
              dateOfBirth:       dob,
              gender,
              phoneNumber:       phone,
              address:           county ? { county, subCounty } : null,
              isFederatedRecord: true,
            }).returning();
            console.log(`✅ Patient cached from FHIR: ${nupi}`);
            return { patient, source: 'fhir' };
          }

          // FHIR returned data but no valid DOB — return display-only without persisting
          return {
            patient: {
              id: nupi, nupi, firstName, lastName,
              dateOfBirth: dob, gender, phoneNumber: phone,
              nationalId: null, email: null, address: county ? { county, subCounty } : null,
              bloodGroup: null, allergies: null, active: true, isFederatedRecord: true,
              middleName: null, createdAt: new Date(), updatedAt: new Date(),
            } as any,
            source: 'fhir-display-only',
          };
        }
      } catch (fhirErr: any) {
        console.warn(`FHIR fetch failed for ${nupi}:`, fhirErr.message);
      }
    }

    // 3. Fall back to chain history — display-only, DO NOT persist garbage dates
    try {
      const historyRes   = await gateway.get(`/api/patients/${nupi}/history`);
      const chainPatient = historyRes.data?.patient || {};
      const nameParts    = (chainPatient.name || '').trim().split(' ');

      // Return display object without writing to DB — no fake 1900 dates
      return {
        patient: {
          id: nupi, nupi,
          firstName:         nameParts[0]                 || 'Unknown',
          lastName:          nameParts.slice(1).join(' ') || '',
          dateOfBirth:       null,
          gender:            'unknown',
          phoneNumber:       null,
          nationalId:        null,
          email:             null,
          address:           null,
          bloodGroup:        null,
          allergies:         null,
          active:            true,
          isFederatedRecord: true,
          middleName:        null,
          createdAt:         new Date(),
          updatedAt:         new Date(),
        } as any,
        source: 'chain-display-only',
      };
    } catch (err: any) {
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
  //
  //  FIX: all three methods now call /api/verify/* on the gateway,
  //       not /api/patients/verify/*.  The gateway mounts verify
  //       routes at /api/verify — there is no /api/patients/verify.
  // ══════════════════════════════════════════════════════════════

  async getSecurityQuestion(nationalId: string, dob: string) {
    // FIX: was POST /api/patients/verify/question — correct path is
    //      GET /api/verify/question (or POST, both are now accepted)
    const res = await gateway.get('/api/verify/question', {
      params: { nationalId, dob },
    });
    return res.data;
  }

  async verifyIdentity(data: { nationalId: string; dob: string; answer: string }) {
    // FIX: was POST /api/patients/verify/answer — correct path is
    //      POST /api/verify/answer
    const res = await gateway.post('/api/verify/answer', {
      nationalId: data.nationalId,
      dob:        data.dob,
      answer:     data.answer,
    });
    return res.data;
  }

  async verifyByPin(data: { nationalId: string; dob: string; pin: string }) {
    // FIX: was POST /api/patients/verify/pin — correct path is
    //      POST /api/verify/pin
    const res = await gateway.post('/api/verify/pin', {
      nationalId:         data.nationalId,
      dob:                data.dob,
      pin:                data.pin,
      requestingFacility: process.env.FACILITY_ID,
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
  //  LOCAL ENCOUNTERS
  // ══════════════════════════════════════════════════════════════

  async getLocalEncounters(nupi: string) {
    return db.query.encounters.findMany({
      where:   eq(encounters.patientNupi, nupi),
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
    const encounterList = bundle.entry
      ?.map((e: any) => e.resource)
      .filter((r: any) => r?.resourceType === 'Encounter') || [];
    return { bundle, encounters: encounterList };
  }

  // ══════════════════════════════════════════════════════════════
  //  PLAIN CHAIN LOOKUP — no access token, returns name + facility
  //  Does NOT write anything to the local DB
  // ══════════════════════════════════════════════════════════════

  async chainLookup(nupi: string) {
    const res = await gateway.get(`/api/patients/${nupi}`);
    return res.data; // { nupi, patient: { name, registeredAtFacility, ... } }
  }

  // ══════════════════════════════════════════════════════════════
  //  LIST ALL LOCAL PATIENTS
  // ══════════════════════════════════════════════════════════════

  async getAll() {
    return db.query.patients.findMany({
      orderBy: (patients, { desc }) => [desc(patients.createdAt)],
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  FULL FEDERATED PATIENT DATA
  // ══════════════════════════════════════════════════════════════

  async getFederatedPatientData(nupi: string, accessToken: string) {
    const [localPatient, localEncs, federatedBundle, chainHistory] = await Promise.all([
      db.query.patients.findFirst({ where: eq(patients.nupi, nupi) }),
      this.getLocalEncounters(nupi),
      this.getFederatedEncounters(nupi, accessToken).catch(() => ({ bundle: null, encounters: [] })),
      this.getPatientHistory(nupi).catch(() => null),
    ]);

    let patient: any = localPatient ?? undefined;

    // Detect garbage records inserted from thin blockchain data (1900 DOB = placeholder)
    const isGarbageRecord = patient?.isFederatedRecord &&
      patient?.dateOfBirth &&
      new Date(patient.dateOfBirth).getFullYear() <= 1900;

    if (!patient || isGarbageRecord) {
      try {
        const result = await this.getByNupi(nupi, accessToken);
        if (result?.patient) {
          patient = result.patient;
          // If we got real data and the old record was garbage, clean it up
          const garbageId = localPatient?.id;
          if (isGarbageRecord && garbageId && result.source !== 'chain-display-only') {
            await db.update(patients)
              .set({
                firstName:   patient.firstName,
                lastName:    patient.lastName,
                dateOfBirth: patient.dateOfBirth,
                gender:      patient.gender,
                phoneNumber: patient.phoneNumber,
                address:     patient.address,
                nationalId:  patient.nationalId,
                updatedAt:   new Date(),
              })
              .where(eq(patients.id, garbageId));
          }
        }
      } catch { /* keep existing patient if any */ }
    }

    const facilityId = process.env.FACILITY_ID || '';

    const localFormatted = localEncs.map((e: any) => ({
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
  // ══════════════════════════════════════════════════════════════

  async recordEncounter(data: {
    nupi:              string;
    accessToken?:      string;
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
    let localPatient = await db.query.patients.findFirst({
      where: eq(patients.nupi, data.nupi),
    });

    if (!localPatient) {
      if (!data.accessToken) {
        throw new Error(`Patient ${data.nupi} not in local DB — verify patient identity first`);
      }
      const result = await this.getByNupi(data.nupi, data.accessToken);
      if (!result) throw new Error(`Patient ${data.nupi} not found on AfyaNet`);
      localPatient = result.patient;
    }

    if (!localPatient) throw new Error(`Patient ${data.nupi} could not be resolved`);

    const [encounter] = await db.insert(encounters).values({
      patientId:        localPatient.id,
      patientNupi:      data.nupi,
      facilityId:       process.env.FACILITY_ID || '',
      encounterType:    (data.encounterType ?? 'outpatient') as any,
      encounterDate:    data.encounterDate ? new Date(data.encounterDate) : new Date(),
      chiefComplaint:   data.chiefComplaint    ?? null,
      practitionerName: data.practitionerName  ?? 'Unknown',
      vitalSigns:       data.vitalSigns        ?? null,
      diagnoses:        data.diagnoses         ?? [],
      medications:      data.medications       ?? null,
      notes:            data.notes             ?? null,
      status:           'finished',
    }).returning();

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

// ── Gateway keep-alive (Render free tier) ─────────────────────────

export function startGatewayKeepAlive() {
  if (process.env.NODE_ENV !== 'production') return;
  const INTERVAL   = 10 * 60 * 1000;
  const gatewayUrl = process.env.HIE_GATEWAY_URL || '';
  setInterval(async () => {
    try {
      await axios.get(`${gatewayUrl}/health`, { timeout: 10000 });
      console.log('🏓 Gateway keep-alive ping OK');
    } catch {
      console.warn('⚠️  Gateway keep-alive ping failed — may be cold starting');
    }
  }, INTERVAL);
  console.log('🏓 Gateway keep-alive started (every 10 min)');
}