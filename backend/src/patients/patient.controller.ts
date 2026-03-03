import { Request, Response } from 'express';
import { patientService } from './patient.service';

export class PatientController {
    async checkIn(req: Request, res: Response) {
        try {
            const { nupi } = req.params;
            // Add your check-in logic here
            // For example:
            const result = patientService.checkIn(nupi, req.body);
            
            return res.json({
                success: true,
                data: result,
                message: 'Patient checked in successfully'
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async searchNUPI(req: Request, res: Response) {
        try {
            const { query } = req.query;
            const results = patientService.searchNUPI(String(query));
            
            return res.json({
                success: true,
                data: results,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async getFacilities(req: Request, res: Response) {
        try {
            const { nupi } = req.params;
            const facilities = patientService.getPatientFacilities(String(nupi));
            
            return res.json({
                success: true,
                data: facilities,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async registerVisit(req: Request, res: Response) {
        try {
            const { nupi } = req.params;
            const visit = patientService.registerVisit(String(nupi), req.body);
            
            return res.status(201).json({
                success: true,
                data: visit,
                message: 'Visit registered successfully'
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async getByNupi(req: Request, res: Response) {
        try {
            const { nupi } = req.params;
            const otpToken = req.headers['x-otp-token'] as string;
            
            const patient = await patientService.getByNupi(String(nupi), otpToken);

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

    async getFederatedData(req: Request, res: Response) {
        try {
            const { nupi } = req.params;
            const otpToken = req.headers['x-otp-token'] as string;
            
            console.log(`🌐 Federated request for: ${nupi}`);
            console.log(`🔐 OTP Token: ${otpToken ? 'Present' : 'Missing'}`);
            
            if (!otpToken) {
                return res.status(401).json({
                    success: false,
                    error: 'OTP token required for federated data access',
                    requiresConsent: true,
                    message: 'Please request OTP consent first'
                });
            }

            const federatedData = await patientService.getFederatedPatientData(String(nupi), otpToken);

            return res.json({
                success: true,
                data: federatedData,
                message: `Found records from ${federatedData.facilitiesCount} facilities`,
                securityNote: 'Data accessed with verified OTP consent'
            });
        
        } catch (error: any) {
            if (error.message.includes('OTP')) {
                return res.status(403).json({
                    success: false,
                    error: error.message,
                    requiresConsent: true
                });
            }
            
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