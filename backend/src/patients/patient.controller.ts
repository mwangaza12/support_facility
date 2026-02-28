import { Request, Response } from 'express';
import { patientService } from './patient.service';

export class PatientController {
    async getByNupi(req: Request, res: Response) {
        try {
            const { nupi } = req.params;
            const patient = await patientService.getByNupi(String(nupi));

            if (!patient) {
                return res.status(404).json({
                    success: false,
                    error: 'Patient not found',
                });
            }

            return res.json({
                success: true,
                data: patient,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async create(req: Request, res: Response) {
        try {
            const patient = await patientService.create(req.body);

            return res.status(201).json({
                success: true,
                data: patient,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }
    }

    async getById(req: Request, res: Response) {
        try {
        const patient = await patientService.getById(String(req.params.id));

        if (!patient) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found',
            });
        }

            return res.json({
                success: true,
                data: patient,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
}

export const patientController = new PatientController();
