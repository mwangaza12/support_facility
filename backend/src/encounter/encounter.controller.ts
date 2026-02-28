import { Request, Response } from 'express';
import { encounterService } from './encounter.service';

export class EncounterController {
    async create(req: Request, res: Response) {
        try {
            const encounter = await encounterService.create(req.body);

            return res.status(201).json({
                success: true,
                data: encounter,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }
    }

    async getByPatient(req: Request, res: Response) {
        try {
            const { nupi } = req.params;
            const encounters = await encounterService.getByPatientNupi(String(nupi));

            return res.json({
                success: true,
                data: encounters,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async getById(req: Request, res: Response) {
        try {
            const encounter = await encounterService.getById(String(req.params.id));

            if (!encounter) {
                return res.status(404).json({
                success: false,
                error: 'Encounter not found',
                });
            }

            return res.json({
                success: true,
                data: encounter,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const encounter = await encounterService.update(String(req.params.id), req.body);

            return res.json({
                success: true,
                data: encounter,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }
    }
}

export const encounterController = new EncounterController();
