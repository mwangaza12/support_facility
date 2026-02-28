import bcrypt from 'bcryptjs';
import { eq, and, gt } from 'drizzle-orm';
import axios from 'axios';
import db from '../db/db';
import { otpRequests } from '../db/schema';

export class OtpService {

    generateOtp(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async requestOtp(data: {
        patientNupi: string;
        patientPhone: string;
        requestingUser: string;
        targetFacility: string;
    }) {
        const otp = this.generateOtp();
        const otpHash = await bcrypt.hash(otp, 10);

        const [request] = await db
        .insert(otpRequests)
        .values({
            patientNupi: data.patientNupi,
            patientPhone: data.patientPhone,
            requestingUser: data.requestingUser,
            targetFacility: data.targetFacility,
            otp,
            otpHash,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        })
        .returning();

        // Send SMS
        await this.sendSms(data.patientPhone, otp, data.targetFacility);

        return { requestId: request.id, expiresAt: request.expiresAt };
    }

    async sendSms(phoneNumber: string, otp: string, facility: string) {
        const message = `${process.env.FACILITY_NAME} is requesting access to your records from ${facility}.\n\nYour OTP: ${otp}\n\nValid for 5 minutes.`;

        console.log(`SMS to ${phoneNumber}: ${message}`);

        // Africa's Talking SMS
        try {
            await axios.post(
                'https://api.africastalking.com/version1/messaging',
                new URLSearchParams({
                    username: process.env.AFRICASTALKING_USERNAME!,
                    to: phoneNumber,
                    message,
                }),
                {
                headers: {
                    apiKey: process.env.AFRICASTALKING_API_KEY!,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                }
            );
        } catch (error) {
            console.error('SMS send failed:', error);
        }
    }

    async verifyOtp(requestId: string, otp: string) {
        const request = await db.query.otpRequests.findFirst({
            where: and(
                eq(otpRequests.id, requestId),
                eq(otpRequests.status, 'pending'),
                gt(otpRequests.expiresAt, new Date())
            ),
        });

        if (!request) {
            return { success: false, error: 'Invalid or expired OTP request' };
        }

        const attempts = request.attempts ?? 0;

        if (attempts >= 3) {
            return { success: false, error: 'Too many failed attempts' };
        }

        const isValid = await bcrypt.compare(otp, request.otpHash);

        if (!isValid) {
            // Increment attempts
            await db
                .update(otpRequests)
                .set({ attempts: attempts + 1 })
                .where(eq(otpRequests.id, requestId));

            return { success: false, error: 'Invalid OTP' };
        }

        // Mark as verified
        await db
        .update(otpRequests)
        .set({
            status: 'verified',
            verifiedAt: new Date(),
        })
        .where(eq(otpRequests.id, requestId));

        return {
            success: true,
            data: {
                patientNupi: request.patientNupi,
                targetFacility: request.targetFacility,
            },
        };
    }
}

export const otpService = new OtpService();
