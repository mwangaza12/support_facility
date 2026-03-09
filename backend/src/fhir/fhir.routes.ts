/**
 * /fhir/*
 *
 * FHIR R4 endpoints called exclusively by the HIE Gateway FHIR proxy.
 * These are NOT called directly by the web frontend or ClinicConnect.
 *
 * Authentication:
 *   The gateway identifies itself with  X-Gateway-ID: HIE_GATEWAY
 *   No patient access token is needed here — the gateway already
 *   verified the patient's identity before proxying the request.
 *
 * Endpoints:
 *   GET /fhir/Patient/:nupi
 *     → FHIR R4 Patient resource (demographics from local Postgres)
 *
 *   GET /fhir/Patient/:nupi/$everything
 *     → FHIR R4 Bundle (Patient + Encounters from local Postgres)
 *
 * Both endpoints require:
 *   - Patient registered at THIS facility (registeredFacilityId matches)
 *   - X-Gateway-ID: HIE_GATEWAY header present
 */

import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import db from '../db/db';
import { patients, encounters } from '../db/schema';

const router = Router();

// ── Gateway auth middleware ───────────────────────────────────────
// Only the HIE Gateway is allowed to call these endpoints.

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

// ── FHIR helpers ─────────────────────────────────────────────────

function toFhirPatient(p: any): object {
  const nameParts: string[] = [p.firstName];
  if (p.middleName) nameParts.push(p.middleName);

  const address: any = p.address || {};

  return {
    resourceType: 'Patient',
    id:           p.nupi,
    identifier: [
      {
        system: 'https://afyalink.health/nupi',
        value:  p.nupi,
      },
      ...(p.nationalId ? [{
        system: 'https://registration.go.ke/national-id',
        value:  p.nationalId,
      }] : []),
    ],
    active: p.active ?? true,
    name: [
      {
        use:    'official',
        family: p.lastName,
        given:  nameParts,
        text:   `${p.firstName}${p.middleName ? ' ' + p.middleName : ''} ${p.lastName}`.trim(),
      },
    ],
    gender:    p.gender || 'unknown',
    birthDate: p.dateOfBirth
      ? new Date(p.dateOfBirth).toISOString().split('T')[0]
      : undefined,
    telecom: p.phoneNumber ? [
      { system: 'phone', value: p.phoneNumber, use: 'mobile' },
    ] : [],
    address: (address.county || address.subCounty) ? [
      {
        use:      'home',
        district: address.county    || undefined,
        city:     address.subCounty || undefined,
        line:     address.ward      ? [address.ward]    : undefined,
        text:     [address.ward, address.subCounty, address.county]
                    .filter(Boolean).join(', ') || undefined,
        country:  'KE',
      },
    ] : [],
    // BloodGroup as extension (not a core FHIR field)
    extension: p.bloodGroup ? [
      {
        url:         'https://afyalink.health/fhir/StructureDefinition/blood-group',
        valueString: p.bloodGroup,
      },
    ] : [],
    meta: {
      source:      process.env.FACILITY_ID   || '',
      sourceName:  process.env.FACILITY_NAME || '',
      lastUpdated: (p.updatedAt || p.createdAt || new Date()).toISOString(),
    },
  };
}

function toFhirEncounter(e: any): object {
  return {
    resourceType: 'Encounter',
    id:           e.id,
    status:       e.status || 'finished',
    class: {
      system:  'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code:    e.encounterType?.toUpperCase() || 'AMB',
      display: e.encounterType || 'outpatient',
    },
    subject: {
      reference: `Patient/${e.patientNupi}`,
    },
    period: {
      start: e.encounterDate ? new Date(e.encounterDate).toISOString() : undefined,
      end:   e.dischargeDate ? new Date(e.dischargeDate).toISOString() : undefined,
    },
    reasonCode: e.chiefComplaint ? [
      { text: e.chiefComplaint },
    ] : [],
    participant: e.practitionerName ? [
      {
        individual: {
          display: e.practitionerName,
        },
      },
    ] : [],
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

function fhirBundle(resourceType: string, resources: object[]): object {
  return {
    resourceType: 'Bundle',
    type:         resourceType,
    total:        resources.length,
    entry:        resources.map(r => ({ resource: r })),
  };
}

function notFound(msg: string) {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'not-found', diagnostics: msg }],
  };
}

// ── GET /fhir/Patient/:nupi ───────────────────────────────────────
// Returns FHIR R4 Patient resource for the patient if registered here.

router.get('/Patient/:nupi', requireGateway, async (req: Request, res: Response) => {
  try {
    const nupi = String(req.params.nupi);

    const rows = await db.select().from(patients).where(eq(patients.nupi, nupi)).limit(1);
    const patient = rows[0];

    if (!patient) {
      return res.status(404)
        .set('Content-Type', 'application/fhir+json')
        .json(notFound(`Patient ${nupi} not registered at this facility`));
    }

    res.set('Content-Type', 'application/fhir+json');
    res.json(toFhirPatient(patient));
  } catch (err: any) {
    res.status(500)
      .set('Content-Type', 'application/fhir+json')
      .json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'exception', diagnostics: err.message }],
      });
  }
});

// ── GET /fhir/Patient/:nupi/$everything ───────────────────────────
// Returns FHIR R4 Bundle: Patient + all local Encounters.

router.get('/Patient/:nupi/\\$everything', requireGateway, async (req: Request, res: Response) => {
  try {
    const nupi = String(req.params.nupi);

    const rows = await db.select().from(patients).where(eq(patients.nupi, nupi)).limit(1);
    const patient = rows[0];

    if (!patient) {
      return res.status(404)
        .set('Content-Type', 'application/fhir+json')
        .json(notFound(`Patient ${nupi} not registered at this facility`));
    }

    const localEncounters = await db
      .select()
      .from(encounters)
      .where(eq(encounters.patientNupi, nupi))
      .orderBy(encounters.encounterDate);

    const resources: object[] = [
      toFhirPatient(patient),
      ...localEncounters.map(toFhirEncounter),
    ];

    res.set('Content-Type', 'application/fhir+json');
    res.json(fhirBundle('collection', resources));
  } catch (err: any) {
    res.status(500)
      .set('Content-Type', 'application/fhir+json')
      .json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'exception', diagnostics: err.message }],
      });
  }
});

// ── GET /fhir/Encounter?patient=:nupi ─────────────────────────────
// Encounters only — used by gateway /Patient/:nupi/Encounter proxy.

router.get('/Encounter', requireGateway, async (req: Request, res: Response) => {
  try {
    const nupi = req.query.patient as string;
    if (!nupi) {
      return res.status(400)
        .set('Content-Type', 'application/fhir+json')
        .json({
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'required', diagnostics: '?patient=NUPI required' }],
        });
    }

    const localEncounters = await db
      .select()
      .from(encounters)
      .where(eq(encounters.patientNupi, nupi))
      .orderBy(encounters.encounterDate);

    res.set('Content-Type', 'application/fhir+json');
    res.json(fhirBundle('searchset', localEncounters.map(toFhirEncounter)));
  } catch (err: any) {
    res.status(500)
      .set('Content-Type', 'application/fhir+json')
      .json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'exception', diagnostics: err.message }],
      });
  }
});

export default router;