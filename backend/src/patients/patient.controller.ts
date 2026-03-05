import { Request, Response } from 'express';
import { patientService } from './patient.service';

export class PatientController {

  // ══════════════════════════════════════════════════════════════
  //  POST /patients
  //  Register a new patient → saves to Neon DB + mints block
  //
  //  Body: {
  //    nationalId, firstName, lastName, middleName?,
  //    dateOfBirth, gender, phoneNumber?, email?, address?,
  //    securityQuestion, securityAnswer, pin
  //  }
  // ══════════════════════════════════════════════════════════════

  async create(req: Request, res: Response) {
    try {
      const b = req.body;

      // ── Validate facility is configured ───────────────────────
      // If FACILITY_ID or FACILITY_API_KEY are missing from .env
      // the gateway will reject with 401. Catch it early with a
      // clear message instead of a raw axios 401.
      if (!process.env.FACILITY_ID || !process.env.FACILITY_API_KEY) {
        return res.status(500).json({
          success: false,
          error:   'Facility not configured. Set FACILITY_ID and FACILITY_API_KEY in .env. ' +
                   'These are issued by MoH when your facility is registered on AfyaLink.',
        });
      }

      // ── Map frontend body → service fields ────────────────────
      // Accepts either naming convention:
      //   givenName / familyName  (FHIR-style, what the frontend sends)
      //   firstName / lastName    (internal style)
      const mapped = {
        nationalId:       b.nationalId,
        firstName:        b.firstName   || b.givenName,
        lastName:         b.lastName    || b.familyName,
        middleName:       b.middleName  || b.middleNames || undefined,
        dateOfBirth:      b.dateOfBirth || b.dob,
        gender:           b.gender,
        phoneNumber:      b.phoneNumber || b.phone       || undefined,
        email:            b.email                        || undefined,
        address:          b.address ?? (
          // Build address object from flat fields if present
          b.county ? {
            county:    b.county,
            subCounty: b.subCounty  || undefined,
            ward:      b.ward       || undefined,
            village:   b.village    || undefined,
          } : undefined
        ),
        // These MUST come from the registration form — no defaults
        securityQuestion: b.securityQuestion,
        securityAnswer:   b.securityAnswer,
        pin:              b.pin,
      };

      // ── Validate required fields ───────────────────────────────
      const missing = ['nationalId','firstName','lastName','dateOfBirth','gender','securityQuestion','securityAnswer','pin']
        .filter(f => !mapped[f as keyof typeof mapped]);
      if (missing.length) {
        return res.status(400).json({
          success: false,
          error:   `Missing required fields: ${missing.join(', ')}`,
          note:    'firstName can also be sent as givenName, lastName as familyName, dateOfBirth as dob',
        });
      }

      const result = await patientService.create(mapped);

      return res.status(result.alreadyExists ? 200 : 201).json({
        success:       true,
        data:          result.patient,
        nupi:          result.nupi,
        blockIndex:    result.blockIndex ?? null,
        alreadyExists: result.alreadyExists,
        message:       result.alreadyExists
          ? 'Patient already registered on AfyaNet'
          : 'Patient registered — block minted on AfyaChain',
      });
    } catch (error: any) {
      // Surface the real gateway error instead of a generic 400
      const status  = error.response?.status;
      const message = error.response?.data?.error || error.message;

      if (status === 401) {
        return res.status(401).json({
          success: false,
          error:   'Gateway rejected this facility\'s credentials.',
          detail:  message,
          fix:     'Check that FACILITY_ID and FACILITY_API_KEY in .env match what MoH issued. ' +
                   'If your facility is not yet registered, ask MoH to run POST /api/moh/facilities/register.',
        });
      }

      return res.status(status || 400).json({ success: false, error: message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  GET /patients/:id
  //  Get patient by local Neon DB row ID
  // ══════════════════════════════════════════════════════════════

  async getById(req: Request, res: Response) {
    try {
      const patient = await patientService.getById(String(req.params.id));
      if (!patient) {
        return res.status(404).json({ success: false, error: 'Patient not found' });
      }
      return res.json({ success: true, data: patient });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  GET /patients/nupi/:nupi
  //  Get patient by NUPI — checks local DB first, then gateway.
  //
  //  Headers (when querying gateway):
  //    Authorization: Bearer <accessToken>   ← from /verify/answer
  // ══════════════════════════════════════════════════════════════

  async getByNupi(req: Request, res: Response) {
    try {
      const { nupi }      = req.params;
      const accessToken   = req.headers['authorization']?.replace('Bearer ', '') as string | undefined;

      const result = await patientService.getByNupi(String(nupi), accessToken);
      if (!result) {
        return res.status(404).json({ success: false, error: 'Patient not found' });
      }

      return res.json({
        success: true,
        data:    result.patient,
        source:  result.source,   // 'local' | 'gateway'
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  GET /patients/search/nupi?query=
  //  Search local DB by NUPI prefix, name or national ID
  // ══════════════════════════════════════════════════════════════

  async searchNUPI(req: Request, res: Response) {
    try {
      const query = req.query.query as string;
      if (!query || query.trim().length < 2) {
        return res.status(400).json({ success: false, error: 'query param must be at least 2 characters' });
      }
      const results = await patientService.searchNUPI(query.trim());
      return res.json({ success: true, data: results, count: results.length });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  IDENTITY VERIFICATION FLOW
  //
  //  Step 1 — GET /patients/verify/question
  //    Query: { nationalId, dob }
  //    Returns the patient's security question
  //
  //  Step 2 — POST /patients/verify/answer
  //    Body: { nationalId, dob, answer }
  //    Returns: { token, nupi, patient, facilitiesVisited, encounterIndex }
  //    The token is what you pass as Authorization header on all
  //    subsequent requests to fetch federated data
  //
  //  Alternative step 2 — POST /patients/verify/pin
  //    Body: { nationalId, dob, pin }
  // ══════════════════════════════════════════════════════════════

  async getSecurityQuestion(req: Request, res: Response) {
    try {
      const { nationalId, dob } = req.query as { nationalId: string; dob: string };
      if (!nationalId || !dob) {
        return res.status(400).json({ success: false, error: 'nationalId and dob query params required' });
      }
      const result = await patientService.getSecurityQuestion(nationalId, dob);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      const status = error.response?.status || 500;
      return res.status(status).json({ success: false, error: error.response?.data?.error || error.message });
    }
  }

  async verifyAnswer(req: Request, res: Response) {
    try {
      const { nationalId, dob, answer } = req.body;
      if (!nationalId || !dob || !answer) {
        return res.status(400).json({ success: false, error: 'nationalId, dob and answer required' });
      }
      const result = await patientService.verifyIdentity({ nationalId, dob, answer });

      return res.json({
        success:           true,
        token:             result.token,       // use this as Authorization Bearer on all future calls
        nupi:              result.nupi,
        patient:           result.patient,
        facilitiesVisited: result.facilitiesVisited,  // shows doctor which hospitals patient has been to
        encounterIndex:    result.encounterIndex,
        consentId:         result.consentId,
        blockIndex:        result.blockIndex,
        expiresIn:         result.expiresIn,
        message:           'Identity verified — access token issued',
      });
    } catch (error: any) {
      const status = error.response?.status === 401 ? 401 : 500;
      return res.status(status).json({ success: false, error: error.response?.data?.error || error.message });
    }
  }

  async verifyPin(req: Request, res: Response) {
    try {
      const { nationalId, dob, pin } = req.body;
      if (!nationalId || !dob || !pin) {
        return res.status(400).json({ success: false, error: 'nationalId, dob and pin required' });
      }
      const result = await patientService.verifyByPin({ nationalId, dob, pin });
      return res.json({
        success:           true,
        token:             result.token,
        nupi:              result.nupi,
        patient:           result.patient,
        facilitiesVisited: result.facilitiesVisited,
        encounterIndex:    result.encounterIndex,
        expiresIn:         result.expiresIn,
      });
    } catch (error: any) {
      const status = error.response?.status === 401 ? 401 : 500;
      return res.status(status).json({ success: false, error: error.response?.data?.error || error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  POST /patients/nupi/:nupi/checkin
  //  Check in a patient at this facility.
  //  Pulls patient from gateway if not in local DB, then records
  //  a check-in encounter in Neon + mints a block.
  //
  //  Headers: Authorization: Bearer <accessToken>
  //  Body: { practitionerName?, chiefComplaint? }
  // ══════════════════════════════════════════════════════════════

  async checkIn(req: Request, res: Response) {
    try {
      const { nupi }    = req.params;
      const accessToken = req.headers['authorization']?.replace('Bearer ', '');

      if (!accessToken) {
        return res.status(401).json({
          success: false,
          error:   'Authorization header required. Verify patient identity first via POST /patients/verify/answer',
        });
      }

      const result = await patientService.checkIn(String(nupi), {
        accessToken,
        practitionerName: req.body.practitionerName,
        chiefComplaint:   req.body.chiefComplaint,
      });

      return res.status(201).json({
        success:     true,
        data:        result.encounter,
        blockIndex:  result.blockIndex,
        message:     'Patient checked in — encounter recorded on AfyaChain',
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  POST /patients/:nupi/visit
  //  Record a full clinical encounter for a patient.
  //  Saves complete clinical data to Neon + notifies blockchain.
  //
  //  Headers: Authorization: Bearer <accessToken>
  //  Body: {
  //    encounterType?, chiefComplaint?, practitionerName?,
  //    vitalSigns?, diagnoses?, medications?, notes?
  //  }
  // ══════════════════════════════════════════════════════════════

  async registerVisit(req: Request, res: Response) {
    try {
      const { nupi }    = req.params;
      const accessToken = req.headers['authorization']?.replace('Bearer ', '');

      if (!accessToken) {
        return res.status(401).json({
          success: false,
          error:   'Authorization header required. Verify patient identity first via POST /patients/verify/answer',
        });
      }

      const result = await patientService.registerVisit(String(nupi), {
        accessToken,
        ...req.body,
      });

      return res.status(201).json({
        success:    true,
        data:       result.encounter,
        blockIndex: result.blockIndex,
        chainError: result.chainError ?? null,
        message:    result.blockIndex
          ? `Visit recorded — block #${result.blockIndex} minted on AfyaChain`
          : 'Visit saved locally (chain notification failed — will retry)',
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  GET /patients/:nupi/facilities
  //  Returns every facility the patient has ever visited,
  //  sourced from the immutable blockchain record.
  //
  //  Headers: Authorization: Bearer <accessToken>
  // ══════════════════════════════════════════════════════════════

  async getFacilities(req: Request, res: Response) {
    try {
      const { nupi } = req.params;
      const facilities = await patientService.getPatientFacilities(String(nupi));
      return res.json({ success: true, data: facilities, count: facilities.length });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  GET /patients/:nupi/encounters
  //  Get this facility's encounters for a patient (local Neon DB only)
  // ══════════════════════════════════════════════════════════════

  async getLocalEncounters(req: Request, res: Response) {
    try {
      const { nupi }     = req.params;
      const encounterList = await patientService.getLocalEncounters(String(nupi));
      return res.json({ success: true, data: encounterList, count: encounterList.length, source: 'local' });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  GET /patients/:nupi/encounters/facility/:facilityId
  //  Get encounters from a SPECIFIC facility via gateway.
  //  The gateway fetches from that facility's FHIR server and returns it.
  //
  //  Headers: Authorization: Bearer <accessToken>
  // ══════════════════════════════════════════════════════════════

  async getEncountersFromFacility(req: Request, res: Response) {
    try {
      const { nupi, facilityId } = req.params;
      const accessToken = req.headers['authorization']?.replace('Bearer ', '');

      if (!accessToken) {
        return res.status(401).json({ success: false, error: 'Authorization header required' });
      }

      const bundle = await patientService.getEncountersFromFacility(String(nupi), String(facilityId), accessToken);
      return res.json({ success: true, data: bundle, source: 'gateway', facilityId });
    } catch (error: any) {
      const status = error.response?.status || 500;
      return res.status(status).json({ success: false, error: error.response?.data || error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  GET /patients/:nupi/federated
  //  Full picture — local Neon data + ALL facilities via gateway,
  //  merged and sorted by date. This is the full patient chart view.
  //
  //  Headers: Authorization: Bearer <accessToken>
  // ══════════════════════════════════════════════════════════════

  async getFederatedData(req: Request, res: Response) {
    try {
      const { nupi }    = req.params;
      const accessToken = req.headers['authorization']?.replace('Bearer ', '');

      if (!accessToken) {
        return res.status(401).json({
          success:         false,
          error:           'Authorization header required',
          howToGetToken:   'POST /patients/verify/answer with { nationalId, dob, answer }',
        });
      }

      const data = await patientService.getFederatedPatientData(String(nupi), accessToken);

      return res.json({
        success:           true,
        data,
        totalEncounters:   data.totalEncounters,
        facilitiesVisited: data.facilitiesVisited.length,
        message:           `Found ${data.totalEncounters} encounters across ${data.facilitiesVisited.length} facilities`,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  GET /patients/:nupi/history
  //  Blockchain audit trail — visits, identity verifications,
  //  consent grants, record accesses — all immutable.
  // ══════════════════════════════════════════════════════════════

  async getHistory(req: Request, res: Response) {
    try {
      const history = await patientService.getPatientHistory(String(req.params.nupi));
      return res.json({ success: true, data: history });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export const patientController = new PatientController();