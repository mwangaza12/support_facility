/**
 * /fhir/*
 *
 * FHIR R4 endpoints called exclusively by the HIE Gateway FHIR proxy.
 */

import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import db from '../db/db';
import { patients, encounters } from '../db/schema';

const router = Router();

function requireGateway(req: Request, res: Response, next: Function) {
  const gatewayId = req.headers['x-gateway-id'];
  if (gatewayId !== 'HIE_GATEWAY') {
    return res.status(401).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'security', diagnostics: 'X-Gateway-ID: HIE_GATEWAY header required' }],
    });
  }
  next();
}

function toFhirPatient(p: any): object {
  const nameParts: string[] = [p.firstName];
  if (p.middleName) nameParts.push(p.middleName);
  const address: any = p.address || {};

  return {
    resourceType: 'Patient',
    id:           p.nupi,
    identifier: [
      { system: 'https://afyalink.health/nupi', value: p.nupi },
      ...(p.nationalId ? [{ system: 'https://registration.go.ke/national-id', value: p.nationalId }] : []),
    ],
    active: p.active ?? true,
    name: [{
      use:    'official',
      family: p.lastName,
      given:  nameParts,
      text:   `${p.firstName}${p.middleName ? ' ' + p.middleName : ''} ${p.lastName}`.trim(),
    }],
    gender:    p.gender || 'unknown',
    birthDate: p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().split('T')[0] : undefined,
    telecom:   p.phoneNumber ? [{ system: 'phone', value: p.phoneNumber, use: 'mobile' }] : [],
    address:   (address.county || address.subCounty) ? [{
      use:      'home',
      district: address.county    || undefined,
      city:     address.subCounty || undefined,
      line:     address.ward      ? [address.ward] : undefined,
      text:     [address.ward, address.subCounty, address.county].filter(Boolean).join(', ') || undefined,
      country:  'KE',
    }] : [],
    extension: p.bloodGroup ? [{
      url:         'https://afyalink.health/fhir/StructureDefinition/blood-group',
      valueString: p.bloodGroup,
    }] : [],
    meta: {
      source:      process.env.FACILITY_ID   || '',
      sourceName:  process.env.FACILITY_NAME || '',
      lastUpdated: (p.updatedAt || p.createdAt || new Date()).toISOString(),
    },
  };
}

// ── toFhirEncounter ───────────────────────────────────────────────
// Maps ALL database columns to FHIR R4 Encounter, including:
//   vitals, diagnoses, medications, notes, practitioner, disposition

function toFhirEncounter(e: any): object {
  // ── Parse JSON columns safely ──────────────────────────────────
  const parseJson = (val: any) => {
    if (!val) return null;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return null; }
  };

  const vitals      = parseJson(e.vitals);
  const diagnoses   = parseJson(e.diagnoses)   as any[] | null;
  const medications = parseJson(e.medications) as any[] | null;

  // ── Vitals → FHIR Observation components ──────────────────────
  const vitalComponents: any[] = [];
  if (vitals) {
    const vitalMap: Record<string, { display: string; unit: string; code: string }> = {
      bloodPressure:   { display: 'Blood Pressure',    unit: 'mmHg',  code: '55284-4' },
      heartRate:       { display: 'Heart Rate',        unit: '/min',  code: '8867-4'  },
      temperature:     { display: 'Body Temperature',  unit: '°C',    code: '8310-5'  },
      weight:          { display: 'Body Weight',       unit: 'kg',    code: '29463-7' },
      height:          { display: 'Body Height',       unit: 'cm',    code: '8302-2'  },
      oxygenSaturation:{ display: 'Oxygen Saturation', unit: '%',     code: '59408-5' },
      respiratoryRate: { display: 'Respiratory Rate',  unit: '/min',  code: '9279-1'  },
      bmi:             { display: 'BMI',               unit: 'kg/m2', code: '39156-5' },
      bloodGlucose:    { display: 'Blood Glucose',     unit: 'mmol/L',code: '15074-8' },
    };
    for (const [key, meta] of Object.entries(vitalMap)) {
      if (vitals[key] != null && vitals[key] !== '') {
        vitalComponents.push({
          code: {
            coding: [{ system: 'http://loinc.org', code: meta.code, display: meta.display }],
            text: meta.display,
          },
          valueString: String(vitals[key]),
          valueUnit:   meta.unit,
        });
      }
    }
  }

  // ── Diagnoses → FHIR diagnosis array ──────────────────────────
  const fhirDiagnoses = diagnoses?.map((d: any, i: number) => ({
    condition: { display: d.description || d.code || 'Unknown' },
    use: {
      coding: [{
        system:  'http://terminology.hl7.org/CodeSystem/diagnosis-role',
        code:    i === 0 ? 'primary' : 'secondary',
        display: i === 0 ? 'Primary Diagnosis' : 'Secondary Diagnosis',
      }],
    },
    rank: i + 1,
    // Preserve original fields for downstream use
    _code:     d.code,
    _severity: d.severity,
  })) ?? [];

  // ── Medications → FHIR extension (no standard R4 slot in Encounter) ──
  const medicationExtensions = medications?.map((m: any) => ({
    url: 'https://afyalink.health/fhir/StructureDefinition/medication',
    extension: [
      { url: 'name',      valueString: m.name      || '' },
      { url: 'dosage',    valueString: m.dosage     || '' },
      { url: 'frequency', valueString: m.frequency  || '' },
      { url: 'duration',  valueString: String(m.duration || '') },
    ],
  })) ?? [];

  return {
    resourceType: 'Encounter',
    id:     e.id,
    status: e.status || 'finished',
    class: {
      system:  'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code:    e.encounterType?.toUpperCase() || 'AMB',
      display: e.encounterType || 'outpatient',
    },
    subject: { reference: `Patient/${e.patientNupi}` },
    period: {
      start: e.encounterDate  ? new Date(e.encounterDate).toISOString()  : undefined,
      end:   e.dischargeDate  ? new Date(e.dischargeDate).toISOString()  : undefined,
    },

    // Chief complaint
    reasonCode: e.chiefComplaint ? [{ text: e.chiefComplaint }] : [],

    // Diagnoses
    diagnosis: fhirDiagnoses,

    // Clinician
    participant: e.practitionerName ? [{
      individual: { display: e.practitionerName },
    }] : [],

    // Vitals as contained Observation
    ...(vitalComponents.length > 0 ? {
      contained: [{
        resourceType: 'Observation',
        id:           `vitals-${e.id}`,
        status:       'final',
        category: [{
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }],
        }],
        code: { text: 'Vital Signs' },
        subject: { reference: `Patient/${e.patientNupi}` },
        effectiveDateTime: e.encounterDate ? new Date(e.encounterDate).toISOString() : undefined,
        component: vitalComponents,
      }],
    } : {}),

    // Medications as extensions
    ...(medicationExtensions.length > 0 ? {
      extension: medicationExtensions,
    } : {}),

    // Clinical notes → hospitalization.specialArrangement text (best available slot)
    ...(e.notes ? {
      hospitalization: {
        specialArrangement: [{ text: e.notes }],
      },
    } : {}),

    // Disposition
    ...(e.disposition ? {
      hospitalization: {
        ...(e.notes ? { specialArrangement: [{ text: e.notes }] } : {}),
        dischargeDisposition: { text: e.disposition },
      },
    } : {}),

    serviceProvider: {
      reference: `Organization/${process.env.FACILITY_ID}`,
      display:   process.env.FACILITY_NAME || '',
    },
    meta: {
      source:      process.env.FACILITY_ID   || '',
      sourceName:  process.env.FACILITY_NAME || '',
      lastUpdated: (e.updatedAt || e.createdAt || new Date()).toISOString(),
    },
  };
}

function fhirBundle(type: string, resources: object[]): object {
  return {
    resourceType: 'Bundle',
    type,
    total:  resources.length,
    entry:  resources.map(r => ({ resource: r })),
  };
}

function notFound(msg: string) {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'not-found', diagnostics: msg }],
  };
}

// ── GET /fhir/Patient/:nupi ───────────────────────────────────────
router.get('/Patient/:nupi', requireGateway, async (req: Request, res: Response) => {
  try {
    const nupi = String(req.params.nupi);
    const rows = await db.select().from(patients).where(eq(patients.nupi, nupi)).limit(1);
    const patient = rows[0];

    if (!patient) {
      return res.status(404).set('Content-Type', 'application/fhir+json').json(notFound(`Patient ${nupi} not registered at this facility`));
    }
    res.set('Content-Type', 'application/fhir+json').json(toFhirPatient(patient));
  } catch (err: any) {
    res.status(500).set('Content-Type', 'application/fhir+json').json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', diagnostics: err.message }],
    });
  }
});

// ── GET /fhir/Patient/:nupi/$everything ───────────────────────────
router.get('/Patient/:nupi/\\$everything', requireGateway, async (req: Request, res: Response) => {
  try {
    const nupi = String(req.params.nupi);
    const rows = await db.select().from(patients).where(eq(patients.nupi, nupi)).limit(1);
    const patient = rows[0];

    if (!patient) {
      return res.status(404).set('Content-Type', 'application/fhir+json').json(notFound(`Patient ${nupi} not registered at this facility`));
    }

    const localEncounters = await db
      .select()
      .from(encounters)
      .where(eq(encounters.patientNupi, nupi))
      .orderBy(encounters.encounterDate);

    const resources: object[] = [toFhirPatient(patient), ...localEncounters.map(toFhirEncounter)];
    res.set('Content-Type', 'application/fhir+json').json(fhirBundle('collection', resources));
  } catch (err: any) {
    res.status(500).set('Content-Type', 'application/fhir+json').json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', diagnostics: err.message }],
    });
  }
});

// ── GET /fhir/Encounter ───────────────────────────────────────────
// Encounters bundle — used by gateway /Patient/:nupi/Encounter proxy.
router.get('/Encounter', requireGateway, async (req: Request, res: Response) => {
  try {
    const nupi = req.query.patient as string;
    if (!nupi) {
      return res.status(400).set('Content-Type', 'application/fhir+json').json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'required', diagnostics: '?patient=NUPI required' }],
      });
    }
    const localEncounters = await db
      .select()
      .from(encounters)
      .where(eq(encounters.patientNupi, nupi))
      .orderBy(encounters.encounterDate);

    res.set('Content-Type', 'application/fhir+json').json(fhirBundle('searchset', localEncounters.map(toFhirEncounter)));
  } catch (err: any) {
    res.status(500).set('Content-Type', 'application/fhir+json').json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', diagnostics: err.message }],
    });
  }
});

// ── GET /fhir/Encounter/:id ───────────────────────────────────────
// Single encounter by ID — called by gateway /api/fhir/Encounter/:id proxy.
router.get('/Encounter/:id', requireGateway, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const rows = await db.select().from(encounters).where(eq(encounters.id, id)).limit(1);
    const encounter = rows[0];

    if (!encounter) {
      return res.status(404).set('Content-Type', 'application/fhir+json').json(notFound(`Encounter ${id} not found`));
    }
    res.set('Content-Type', 'application/fhir+json').json(toFhirEncounter(encounter));
  } catch (err: any) {
    res.status(500).set('Content-Type', 'application/fhir+json').json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', diagnostics: err.message }],
    });
  }
});

export default router;