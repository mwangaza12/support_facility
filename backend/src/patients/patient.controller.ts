import { Request, Response } from 'express';
import { patientService } from './patient.service';

class PatientController {

  // ── Registration ──────────────────────────────────────────────

  async create(req: Request, res: Response) {
    // Validate required fields before calling service, so the error message
    // is clear to the caller rather than surfacing as a gateway 400.
    const { nationalId, firstName, lastName, dateOfBirth, securityQuestion, securityAnswer, pin } = req.body;
    if (!nationalId || !firstName || !lastName || !dateOfBirth || !securityQuestion || !securityAnswer || !pin) {
      return res.status(400).json({
        success: false,
        error:   'nationalId, firstName, lastName, dateOfBirth, securityQuestion, securityAnswer and pin are required',
      });
    }

    try {
      const result = await patientService.create(req.body);
      return res.status(result.alreadyExists ? 200 : 201).json({
        success: true,
        data:    result,
        message: result.alreadyExists ? 'Patient already registered' : 'Patient registered successfully',
      });
    } catch (error: any) {
      console.error('create error:', error.message);

      // FIX: propagate the upstream gateway error body if present, so the caller
      // sees e.g. "PIN must be 4–6 digits" rather than the opaque axios message
      // "Request failed with status code 400".
      const upstreamError: string =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message;

      const status = error.response?.status === 400 ? 400 : 500;
      return res.status(status).json({ success: false, error: upstreamError });
    }
  }

  // ── Lookup ────────────────────────────────────────────────────

  // Plain chain lookup — no patient token, returns name + registered facility only
  async chainLookup(req: Request, res: Response) {
    try {
      const { nupi } = req.params;
      const res2 = await (patientService as any).chainLookup(nupi);
      if (!res2) return res.status(404).json({ success: false, error: 'Patient not found on AfyaNet' });
      return res.json({ success: true, ...res2 });
    } catch (error: any) {
      const upstreamError = error.response?.data?.error || error.message;
      return res.status(error.response?.status || 500).json({ success: false, error: upstreamError });
    }
  }

  async getAll(req: Request, res: Response) {
    try {
      const patients = await patientService.getAll();
      return res.json({ success: true, data: patients });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const patient = await patientService.getById(String(req.params.id));
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      return res.json({ success: true, data: patient });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async getByNupi(req: Request, res: Response) {
    try {
      const accessToken = req.headers.authorization?.replace('Bearer ', '');
      const result = await patientService.getByNupi(String(req.params.nupi), accessToken);
      if (!result) return res.status(404).json({ success: false, error: 'Patient not found' });
      return res.json({ success: true, data: result.patient, source: result.source });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async searchNUPI(req: Request, res: Response) {
    try {
      const query = req.query.query as string;
      if (!query) return res.status(400).json({ success: false, error: 'Query required' });
      const results = await patientService.searchNUPI(query);
      return res.json({ success: true, data: results });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Identity verification ─────────────────────────────────────

  async getSecurityQuestion(req: Request, res: Response) {
    try {
      const { nationalId, dob } = req.query as { nationalId: string; dob: string };
      if (!nationalId || !dob) {
        return res.status(400).json({ success: false, error: 'nationalId and dob required' });
      }
      const result = await patientService.getSecurityQuestion(nationalId, dob);
      return res.json({ success: true, ...result });
    } catch (error: any) {
      const upstreamError = error.response?.data?.error || error.message;
      return res.status(error.response?.status || 500).json({ success: false, error: upstreamError });
    }
  }

  async verifyAnswer(req: Request, res: Response) {
    try {
      const { nationalId, dob, answer } = req.body;
      if (!nationalId || !dob || !answer) {
        return res.status(400).json({ success: false, error: 'nationalId, dob and answer required' });
      }
      const result = await patientService.verifyIdentity({ nationalId, dob, answer });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      const upstreamError = error.response?.data?.error || error.message;
      return res.status(error.response?.status || 401).json({ success: false, error: upstreamError });
    }
  }

  async verifyPin(req: Request, res: Response) {
    try {
      const { nationalId, dob, pin } = req.body;
      if (!nationalId || !dob || !pin) {
        return res.status(400).json({ success: false, error: 'nationalId, dob and pin required' });
      }
      const result = await patientService.verifyByPin({ nationalId, dob, pin });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      const upstreamError = error.response?.data?.error || error.message;
      return res.status(error.response?.status || 401).json({ success: false, error: upstreamError });
    }
  }

  // ── Encounters ────────────────────────────────────────────────

  async getLocalEncounters(req: Request, res: Response) {
    try {
      const encounters = await patientService.getLocalEncounters(String(req.params.nupi));
      return res.json({ success: true, data: encounters });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async getEncountersFromFacility(req: Request, res: Response) {
    try {
      const { nupi, facilityId } = req.params;
      const accessToken = req.headers.authorization?.replace('Bearer ', '') || '';
      const result = await patientService.getEncountersFromFacility(String(nupi), String(facilityId), accessToken);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async getFederatedData(req: Request, res: Response) {
    try {
      const { nupi }    = req.params;
      const accessToken = req.headers.authorization?.replace('Bearer ', '') || '';
      const result      = await patientService.getFederatedPatientData(String(nupi), accessToken);
      return res.json({
        success:           true,
        data:              result,
        totalEncounters:   result.totalEncounters,
        facilitiesVisited: result.facilitiesVisited.length,
        message:           `Found ${result.totalEncounters} encounters across ${result.facilitiesVisited.length} facilities`,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Blockchain data ───────────────────────────────────────────

  async getFacilities(req: Request, res: Response) {
    try {
      const facilities = await patientService.getPatientFacilities(String(req.params.nupi));
      return res.json({ success: true, data: facilities });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async getHistory(req: Request, res: Response) {
    try {
      const history = await patientService.getPatientHistory(String(req.params.nupi));
      return res.json({ success: true, data: history });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Check-in ──────────────────────────────────────────────────

  async checkIn(req: Request, res: Response) {
    try {
      const { nupi }    = req.params;
      const accessToken = req.headers.authorization?.replace('Bearer ', '') || '';
      const result      = await patientService.checkIn(String(nupi), {
        accessToken,
        practitionerName: req.body.practitionerName,
        chiefComplaint:   req.body.chiefComplaint,
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Visit recording ───────────────────────────────────────────

  async registerVisit(req: Request, res: Response) {
    try {
      const { nupi }    = req.params;
      const accessToken = req.headers.authorization?.replace('Bearer ', '') || '';
      const result      = await patientService.registerVisit(String(nupi), {
        accessToken,
        ...req.body,
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      const upstreamError = error.response?.data?.error || error.message;
      return res.status(error.response?.status || 500).json({ success: false, error: upstreamError });
    }
  }
}

export const patientController = new PatientController();