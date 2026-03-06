import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import db from '../db/db';
import { users,UserRole } from '../db/schema';
import axios from 'axios';

const GW = process.env.HIE_GATEWAY_URL

export class AuthService {
    async login(email: string, password: string) {
        const user = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        if (!user) {
            throw new Error('Invalid credentials');
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            throw new Error('Invalid credentials');
        }

        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role,
                facilityId: user.facilityId,
            },
            process.env.JWT_SECRET || 'default',
            { expiresIn: '24h' }
        );

        return {
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                facilityId: user.facilityId,
            },
        };
    }

    async register(data: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role: UserRole;
    }) {
        const passwordHash = await bcrypt.hash(data.password, 10);

        const [user] = await db
        .insert(users)
        .values({
            email: data.email,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            role: data.role,
            facilityId: process.env.FACILITY_ID!,
        })
        .returning();

        return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
        };
    }
    async addStaff(data: {
        firstName: string;
        lastName:  string;
        email:     string;
        password:  string;
        role:      UserRole;
        department?: string;
        createdBy: string;
    }) {
        // Step 1 — hash password
        const passwordHash = await bcrypt.hash(data.password, 10);

        // Step 2 — save to Neon
        const [staff] = await db.insert(users).values({
            email:      data.email,
            passwordHash,
            firstName:  data.firstName,
            lastName:   data.lastName,
            role:       data.role,
            facilityId: process.env.FACILITY_ID!,
        }).returning();

        // Step 3 — credential on blockchain (best-effort)
        try {
            await axios.post(`${GW}/api/moh/staff/credential`, {
                staffId:    staff.id,
                facilityId: process.env.FACILITY_ID,
                name:       `${data.firstName} ${data.lastName}`,
                role:       data.role,
            });
        } catch {
            // chain log is best-effort — don't fail the request
        }

        return staff;
    }
}

export const authService = new AuthService();
