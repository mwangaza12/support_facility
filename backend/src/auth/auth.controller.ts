// src/controllers/authController.ts
import { Request, Response } from 'express';
import { authService } from './auth.service';
import { UserRole } from '../db/schema';

export class AuthController {
    async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Email and password required',
                });
            }

            const result = await authService.login(email, password);

            return res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            return res.status(401).json({
                success: false,
                error: error.message,
            });
        }
    }

    async register(req: Request, res: Response) {
        try {
            const { email, password, firstName, lastName, role } = req.body;

            if (!email || !password || !firstName || !lastName) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                });
            }

            const user = await authService.register({
                email,
                password,
                firstName,
                lastName,
                role: role || 'doctor',
            });

            return res.status(201).json({
                success: true,
                data: user,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }
    }

    async addStaff(req: Request, res: Response) {
        try {
            const { firstName, lastName, email, password, role, department } = req.body;
            if (!firstName || !lastName || !email || !password || !role)
            return res.status(400).json({ error: 'firstName, lastName, email, password and role are required' });

            const staff = await authService.addStaff({
                firstName, lastName, email, password,
                role: role as UserRole,
                department,
                createdBy: String(req.params.id)
            });

            return res.status(201).json({ success: true, data: staff, message: 'Staff added and credentialed on AfyaChain' });
        } catch (error: any) {
            if (error.code === '23505')
            return res.status(409).json({ error: 'Email already exists' });
            return res.status(500).json({ error: error.message });
        }
    }
}

export const authController = new AuthController();
