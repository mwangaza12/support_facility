import { Request, Response } from 'express';
import { patientService } from './patient.service';
import { PatientResponse } from './patient.types';

export class PatientController {
  // GET /patients/nupi/:nupi
    async getByNupi(req: Request, res: Response): Promise<Response<PatientResponse>> {
        try {
            const { nupi } = req.params;
            const patient = await patientService.getByNupi(String(nupi));

            if (!patient) {
                return res.status(404).json({
                    success: false,
                    error: 'Patient not found',
                });
            }

            return res.json({ success: true, data: patient });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // POST /patients/nupi/:nupi/checkin
    async checkIn(req: Request, res: Response): Promise<Response<PatientResponse>> {
        try {
            const { nupi } = req.params;
            const patient = await patientService.checkInPatient(String(nupi));

            if (!patient) {
                return res.status(404).json({
                    success: false,
                    error: 'Patient not found in NUPI Registry',
                });
            }

            return res.json({ 
                success: true, 
                data: patient,
                message: 'Patient checked in successfully'
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // GET /patients/search/nupi
    async searchNUPI(req: Request, res: Response): Promise<Response<PatientResponse>> {
        try {
            const { lastName, nationalId } = req.query;
            const patients = await patientService.searchNUPI({
                lastName: lastName as string,
                nationalId: nationalId as string
            });

            return res.json({ success: true, data: patients });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

  // GET /patients/:nupi/facilities
    async getFacilities(req: Request, res: Response): Promise<Response<PatientResponse>> {
        try {
            const { nupi } = req.params;
            const facilities = await patientService.getFacilityHistory(String(nupi));
            return res.json({ success: true, data: facilities });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // POST /patients/:nupi/visit
    async registerVisit(req: Request, res: Response): Promise<Response<PatientResponse>> {
        try {
            const { nupi } = req.params;
            const { facilityId, facilityName, encounterId } = req.body;

            if (!facilityId || !facilityName || !encounterId) {
                return res.status(400).json({
                success: false,
                error: 'Missing required fields'
                });
            }

            await patientService.registerVisit(String(nupi), { facilityId, facilityName, encounterId });
            return res.json({ success: true, message: 'Visit registered' });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // POST /patients
    async create(req: Request, res: Response): Promise<Response<PatientResponse>> {
        try {
            const patient = await patientService.create(req.body);
            return res.status(201).json({ success: true, data: patient });
        } catch (error: any) {
            return res.status(400).json({ success: false, error: error.message });
        }
    }

    // GET /patients/:id
    async getById(req: Request, res: Response): Promise<Response<PatientResponse>> {
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
}

export const patientController = new PatientController();