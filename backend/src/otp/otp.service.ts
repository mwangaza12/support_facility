import { eq, and, lt } from 'drizzle-orm';
import db from '../db/db';
import { otpRequests, auditLog } from '../db/schema';
import axios from 'axios';

// HIE Gateway configuration
const HIE_GATEWAY_URL = process.env.HIE_GATEWAY_URL || 'https://hie-gateway.onrender.com';
const FACILITY_ID = process.env.FACILITY_ID || 'facility-001';

export class OtpService {

    async requestOtp(data: {
        patientNupi: string;
        patientPhone: string;
        requestingUser: string;
        targetFacility: string;
    }) {
        try {
            // Forward OTP request to HIE Gateway
            const response = await axios.post(`${HIE_GATEWAY_URL}/api/otp/request`, {
                patientNupi: data.patientNupi,
                patientPhone: data.patientPhone,
                facilityId: FACILITY_ID,
                requestingUser: data.requestingUser,
                targetFacility: data.targetFacility
            });

            const { requestId, expiresAt } = response.data;

            // Store in local database with placeholder values for required fields
            const [localRequest] = await db
                .insert(otpRequests)
                .values({
                    id: requestId,
                    patientNupi: data.patientNupi,
                    patientPhone: data.patientPhone,
                    requestingUser: data.requestingUser,
                    targetFacility: data.targetFacility,
                    status: 'pending',
                    expiresAt: new Date(expiresAt),
                    otp: 'HIE_MANAGED', // Placeholder since HIE Gateway manages OTP
                    otpHash: 'HIE_MANAGED', // Placeholder since HIE Gateway manages OTP
                    attempts: 0,
                    verifiedAt: null
                })
                .returning();

            // Log to audit trail
            await db.insert(auditLog).values({
                patientNupi: data.patientNupi,
                userId: data.requestingUser,
                userName: data.requestingUser, // You might want to fetch actual name
                action: 'otp_request',
                resource: 'otp_consent',
                consentMethod: 'otp',
                ipAddress: null // Add IP if available from request
            });

            return { 
                requestId: localRequest.id, 
                expiresAt: localRequest.expiresAt 
            };
            
        } catch (error: any) {
            console.error('HIE Gateway OTP request failed:', {
                message: error.message,
                response: error.response?.data || error
            });
            throw new Error(`Failed to request OTP: ${error.response?.data?.error || error.message}`);
        }
    }

    async verifyOtp(requestId: string, otp: string, requestingUser?: string) {
        try {
            // Check if request exists in local database
            const existingRequest = await db.query.otpRequests.findFirst({
                where: eq(otpRequests.id, requestId)
            });

            if (!existingRequest) {
                return { success: false, error: 'OTP request not found' };
            }

            // Check if expired - compare dates properly
            const now = new Date();
            const expiresAt = new Date(existingRequest.expiresAt);
            
            if (now > expiresAt) {
                await db
                    .update(otpRequests)
                    .set({ status: 'expired' })
                    .where(eq(otpRequests.id, requestId));
                
                return { success: false, error: 'OTP has expired' };
            }

            // Check if already verified
            if (existingRequest.status === 'verified') {
                return { 
                    success: false, 
                    error: 'OTP has already been verified',
                    data: {
                        patientNupi: existingRequest.patientNupi,
                        targetFacility: existingRequest.targetFacility
                    }
                };
            }

            // Check attempt count
            const attempts = existingRequest.attempts ?? 0;
            if (attempts >= 3) {
                await db
                    .update(otpRequests)
                    .set({ status: 'expired' })
                    .where(eq(otpRequests.id, requestId));
                
                return { success: false, error: 'Too many failed attempts. Request expired.' };
            }

            // Forward verification to HIE Gateway
            const response = await axios.post(`${HIE_GATEWAY_URL}/api/otp/verify`, {
                requestId,
                otp,
                facilityId: FACILITY_ID
            });

            const { success, data, error } = response.data;

            if (!success) {
                // Track failed attempt locally
                await db
                    .update(otpRequests)
                    .set({ attempts: attempts + 1 })
                    .where(eq(otpRequests.id, requestId));

                return { 
                    success: false, 
                    error: error || 'Invalid OTP',
                    attemptsRemaining: 2 - attempts
                };
            }

            // Update local database on successful verification
            await db
                .update(otpRequests)
                .set({
                    status: 'verified',
                    verifiedAt: new Date(),
                })
                .where(eq(otpRequests.id, requestId));

            // Log successful verification to audit trail
            await db.insert(auditLog).values({
                patientNupi: existingRequest.patientNupi,
                userId: requestingUser || existingRequest.requestingUser,
                userName: requestingUser || existingRequest.requestingUser,
                action: 'otp_verify',
                resource: 'otp_consent',
                resourceId: requestId,
                consentMethod: 'otp'
            });

            return {
                success: true,
                data: {
                    patientNupi: data.patientNupi || existingRequest.patientNupi,
                    targetFacility: data.targetFacility || existingRequest.targetFacility,
                    ...data
                },
                message: 'OTP verified successfully'
            };
            
        } catch (error: any) {
            console.error('HIE Gateway OTP verification failed:', {
                message: error.message,
                response: error.response?.data || error
            });
            
            // Handle specific error cases
            if (error.response?.status === 400) {
                // Try to update attempt count
                try {
                    const existingRequest = await db.query.otpRequests.findFirst({
                        where: eq(otpRequests.id, requestId)
                    });
                    
                    if (existingRequest) {
                        const attempts = (existingRequest.attempts ?? 0) + 1;
                        await db
                            .update(otpRequests)
                            .set({ attempts })
                            .where(eq(otpRequests.id, requestId));
                    }
                } catch (updateError) {
                    console.error('Failed to update attempt count:', updateError);
                }
                
                return { 
                    success: false, 
                    error: error.response.data.error || 'Invalid OTP' 
                };
            }
            
            return { 
                success: false, 
                error: 'Failed to verify OTP with HIE Gateway. Please try again.' 
            };
        }
    }

    async getOtpStatus(requestId: string) {
        try {
            // Get local request info
            const localRequest = await db.query.otpRequests.findFirst({
                where: eq(otpRequests.id, requestId)
            });

            if (!localRequest) {
                return {
                    success: false,
                    error: 'OTP request not found'
                };
            }

            // Check if expired
            const now = new Date();
            const expiresAt = new Date(localRequest.expiresAt);
            const isExpired = now > expiresAt;

            // Try to get status from HIE Gateway
            try {
                const response = await axios.get(`${HIE_GATEWAY_URL}/api/otp/status/${requestId}`, {
                    params: { facilityId: FACILITY_ID }
                });
                
                return {
                    success: true,
                    data: {
                        ...response.data,
                        localStatus: isExpired ? 'expired' : localRequest.status,
                        attempts: localRequest.attempts,
                        expiresAt: localRequest.expiresAt,
                        verifiedAt: localRequest.verifiedAt,
                        patientNupi: localRequest.patientNupi,
                        targetFacility: localRequest.targetFacility
                    }
                };
            } catch (hieError) {
                // Fallback to local status only
                return {
                    success: true,
                    data: {
                        status: isExpired ? 'expired' : localRequest.status,
                        attempts: localRequest.attempts,
                        expiresAt: localRequest.expiresAt,
                        verifiedAt: localRequest.verifiedAt,
                        patientNupi: localRequest.patientNupi,
                        targetFacility: localRequest.targetFacility,
                        isExpired
                    },
                    message: 'Local status only (HIE Gateway unavailable)'
                };
            }
        } catch (error: any) {
            console.error('Failed to get OTP status:', error.message);
            return {
                success: false,
                error: 'Failed to retrieve OTP status'
            };
        }
    }

    async resendOtp(requestId: string, requestingUser?: string) {
        try {
            // Check if request exists and is still pending
            const existingRequest = await db.query.otpRequests.findFirst({
                where: and(
                    eq(otpRequests.id, requestId),
                    eq(otpRequests.status, 'pending')
                )
            });

            if (!existingRequest) {
                return {
                    success: false,
                    error: 'Active OTP request not found'
                };
            }

            // Check if expired
            const now = new Date();
            const expiresAt = new Date(existingRequest.expiresAt);
            
            if (now > expiresAt) {
                await db
                    .update(otpRequests)
                    .set({ status: 'expired' })
                    .where(eq(otpRequests.id, requestId));
                
                return { success: false, error: 'OTP request has expired' };
            }

            // Request new OTP from HIE Gateway
            const response = await axios.post(`${HIE_GATEWAY_URL}/api/otp/resend`, {
                requestId,
                facilityId: FACILITY_ID
            });

            const { expiresAt: newExpiresAt } = response.data;

            // Update local record with new expiry and reset attempts
            await db
                .update(otpRequests)
                .set({
                    expiresAt: new Date(newExpiresAt),
                    attempts: 0, // Reset attempts for new OTP
                    status: 'pending'
                })
                .where(eq(otpRequests.id, requestId));

            // Log resend to audit trail
            await db.insert(auditLog).values({
                patientNupi: existingRequest.patientNupi,
                userId: requestingUser || existingRequest.requestingUser,
                userName: requestingUser || existingRequest.requestingUser,
                action: 'otp_resend',
                resource: 'otp_consent',
                resourceId: requestId,
                consentMethod: 'otp'
            });

            return {
                success: true,
                data: {
                    requestId,
                    expiresAt: newExpiresAt
                },
                message: 'OTP resent successfully'
            };

        } catch (error: any) {
            console.error('Failed to resend OTP:', error.message);
            return {
                success: false,
                error: error.response?.data?.error || 'Failed to resend OTP'
            };
        }
    }

    async cancelOtpRequest(requestId: string, requestingUser?: string) {
        try {
            // Get existing request
            const existingRequest = await db.query.otpRequests.findFirst({
                where: eq(otpRequests.id, requestId)
            });

            if (!existingRequest) {
                return {
                    success: false,
                    error: 'OTP request not found'
                };
            }

            // Update local status
            await db
                .update(otpRequests)
                .set({
                    status: 'expired'
                })
                .where(eq(otpRequests.id, requestId));

            // Log cancellation to audit trail
            await db.insert(auditLog).values({
                patientNupi: existingRequest.patientNupi,
                userId: requestingUser || existingRequest.requestingUser,
                userName: requestingUser || existingRequest.requestingUser,
                action: 'otp_cancel',
                resource: 'otp_consent',
                resourceId: requestId,
                consentMethod: 'otp'
            });

            // Notify HIE Gateway (optional - fire and forget)
            try {
                await axios.post(`${HIE_GATEWAY_URL}/api/otp/cancel`, {
                    requestId,
                    facilityId: FACILITY_ID
                });
            } catch (hieError) {
                console.warn('Failed to notify HIE Gateway of cancellation:', hieError);
            }

            return {
                success: true,
                message: 'OTP request cancelled successfully'
            };

        } catch (error: any) {
            console.error('Failed to cancel OTP request:', error.message);
            return {
                success: false,
                error: 'Failed to cancel OTP request'
            };
        }
    }

    async cleanupExpiredRequests() {
        try {
            // Find and update expired requests
            const result = await db
                .update(otpRequests)
                .set({ status: 'expired' })
                .where(
                    and(
                        eq(otpRequests.status, 'pending'),
                        lt(otpRequests.expiresAt, new Date())
                    )
                )
                .returning({ 
                    id: otpRequests.id, 
                    patientNupi: otpRequests.patientNupi,
                    requestingUser: otpRequests.requestingUser 
                });

            // Log expired requests to audit trail
            for (const request of result) {
                await db.insert(auditLog).values({
                    patientNupi: request.patientNupi,
                    userId: request.requestingUser,
                    userName: request.requestingUser,
                    action: 'otp_expire',
                    resource: 'otp_consent',
                    resourceId: request.id,
                    consentMethod: 'otp'
                });
            }

            return {
                success: true,
                data: {
                    expiredCount: result.length,
                    expiredIds: result.map(r => r.id)
                }
            };
        } catch (error: any) {
            console.error('Failed to cleanup expired requests:', error.message);
            return {
                success: false,
                error: 'Failed to cleanup expired requests'
            };
        }
    }

    async getPatientConsentHistory(patientNupi: string, limit: number = 50) {
        try {
            const history = await db.query.otpRequests.findMany({
                where: eq(otpRequests.patientNupi, patientNupi),
                orderBy: (requests, { desc }) => [desc(requests.createdAt)],
                limit
            });

            return {
                success: true,
                data: history
            };
        } catch (error: any) {
            console.error('Failed to get patient consent history:', error.message);
            return {
                success: false,
                error: 'Failed to retrieve consent history'
            };
        }
    }

    async getFacilityConsentRequests(facilityId: string, status?: string, limit: number = 50) {
        try {
            const conditions = [eq(otpRequests.targetFacility, facilityId)];
            
            if (status) {
                conditions.push(eq(otpRequests.status, status));
            }

            const requests = await db.query.otpRequests.findMany({
                where: and(...conditions),
                orderBy: (requests, { desc }) => [desc(requests.createdAt)],
                limit
            });

            return {
                success: true,
                data: requests
            };
        } catch (error: any) {
            console.error('Failed to get facility consent requests:', error.message);
            return {
                success: false,
                error: 'Failed to retrieve consent requests'
            };
        }
    }
}

export const otpService = new OtpService();