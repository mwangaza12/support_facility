import bcrypt from 'bcryptjs';
import { eq, and, gt } from 'drizzle-orm';
import db from '../db/db';
import { otpRequests } from '../db/schema';

// Initialize Africa's Talking with production credentials
const credentials = {
    apiKey: process.env.AFRICASTALKING_API_KEY!,
    username: process.env.AFRICASTALKING_USERNAME!, // Your production username
};

// Initialize the SDK
const AfricasTalking = require('africastalking')(credentials);
const sms = AfricasTalking.SMS;

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

        // Send SMS with the requesting user
        await this.sendSms(data.patientPhone, otp, data.targetFacility, data.requestingUser);

        return { requestId: request.id, expiresAt: request.expiresAt };
    }

    async sendSms(phoneNumber: string, otp: string, facility: string, requestingUser: string) {
        const message = `${requestingUser} is requesting access to your records from ${facility}.\n\nYour OTP: ${otp}\n\nValid for 5 minutes.`;

        console.log(`SMS to ${phoneNumber}: ${message}`);
        
        try {
            // IMPORTANT: No 'from' parameter - let AT assign default
            const options = {
                to: [phoneNumber],
                message: message,
                // No 'from' field - this is key!
            };

            console.log('Sending with options:', JSON.stringify(options, null, 2));

            const response = await sms.send(options);
            
            // Check response
            if (response.SMSMessageData.Recipients?.length > 0) {
                console.log('✅ SMS sent successfully to:', response.SMSMessageData.Recipients);
            } else {
                console.log('✅ SMS accepted:', response.SMSMessageData);
            }
            
            return response;
            
        } catch (error: any) {
            console.error('❌ SMS send failed:', {
                message: error.message,
                response: error.response?.data || error
            });
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
            await db
                .update(otpRequests)
                .set({ attempts: attempts + 1 })
                .where(eq(otpRequests.id, requestId));

            return { success: false, error: 'Invalid OTP' };
        }

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