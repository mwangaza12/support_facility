import { eq } from 'drizzle-orm';
import axios from 'axios';
import db from '../db/db';
import { patients, encounters } from '../db/schema';

export class PatientService {
    checkIn(nupi: string | string[], body: any) {
        throw new Error('Method not implemented.');
    }
    searchNUPI(arg0: string) {
        throw new Error('Method not implemented.');
    }
    getPatientFacilities(arg0: string) {
        throw new Error('Method not implemented.');
    }
    registerVisit(arg0: string, body: any) {
        throw new Error('Method not implemented.');
    }
    private hieGatewayUrl = process.env.HIE_GATEWAY_URL || 'http://localhost:3001/api/hie';
    private facilityId = process.env.FACILITY_ID || 'RENDER_HOSPITAL';

    async getByNupi(nupi: string, otpToken?: string) {
        // Check local database first
        let patient = await db.query.patients.findFirst({
            where: eq(patients.nupi, nupi),
        });

        // If not found locally, query HIE Gateway
        if (!patient) {
            const hieData = await this.queryHieGateway(nupi, otpToken);
            if (hieData) {
                // Create federated record
                [patient] = await db
                    .insert(patients)
                    .values({
                        nupi: hieData.nupi,
                        firstName: hieData.demographics.firstName,
                        lastName: hieData.demographics.lastName,
                        middleName: hieData.demographics.middleName,
                        dateOfBirth: new Date(hieData.demographics.dateOfBirth),
                        gender: hieData.demographics.gender,
                        nationalId: hieData.demographics.nationalId,
                        phoneNumber: hieData.demographics.phoneNumber,
                        email: hieData.demographics.email,
                        address: hieData.demographics.address,
                        isFederatedRecord: true,
                    })
                    .returning();
            }
        }

        return patient;
    }

    // Query HIE Gateway for patient info
    async queryHieGateway(nupi: string, otpToken?: string) {
        try {
            console.log(`🔐 Querying HIE Gateway for: ${nupi}`);
            
            const response = await axios.get(
                `${this.hieGatewayUrl}/patients/${nupi}`,
                {
                headers: {
                    'X-Facility-Id': this.facilityId,
                    'X-User-Id': 'system', // In production, use actual user ID
                    ...(otpToken && { 'X-OTP-Token': otpToken })
                },
                timeout: 5000,
                }
            );
        
            if (response.data.success) {
                console.log(`✅ Patient found in HIE Gateway`);
                return response.data.data;
            }
            
            return null;
        } catch (error: any) {
            if (error.response?.status === 404) {
                console.log(`ℹ️  Patient not found in HIE Gateway`);
                return null;
            }
            console.error('HIE Gateway error:', error.message);
            return null;
        }
    }

    // ⭐ NEW: Get federated patient data (requires OTP token)
    async getFederatedPatientData(nupi: string, otpToken: string) {
        // Validate OTP token
        if (!otpToken) {
            throw new Error('OTP token required for federated data access');
        }

        // Get patient info
        const patient = await this.getByNupi(nupi, otpToken);
        
        if (!patient) {
            throw new Error('Patient not found');
        }

        // Get local encounters (Render Hospital PostgreSQL)
        const localEncounters = await db.query.encounters.findMany({
            where: eq(encounters.patientNupi, nupi),
        });

        console.log(`📊 Render Hospital has ${localEncounters.length} encounters`);

        // ⭐ Fetch encounters from ClinicConnect via HIE Gateway (with OTP)
        const clinicConnectEncounters = await this.fetchViaHieGateway(nupi, otpToken);

        console.log(`📊 ClinicConnect has ${clinicConnectEncounters.length} encounters`);

        // Combine all encounters
        const allEncounters = [
        // Render Hospital encounters
        ...localEncounters.map((e: any) => ({
            id: e.id,
            patientNupi: e.patientNupi,
            encounterDate: e.encounterDate,
            encounterType: e.encounterType,
            chiefComplaint: e.chiefComplaint,
            vitalSigns: e.vitalSigns,
            diagnoses: e.diagnoses,
            medications: e.medications,
            notes: e.notes,
            practitionerName: e.practitionerName,
            facilityId: e.facilityId,
            facilityName: process.env.FACILITY_NAME || 'Render Hospital',
            source: 'Render Hospital',
            systemType: 'postgres',
            status: e.status,
            createdAt: e.createdAt,
        })),
        // ClinicConnect encounters (via gateway)
        ...clinicConnectEncounters
        ]
        // Sort by date (newest first)
        .sort((a, b) => 
        new Date(b.encounterDate).getTime() - new Date(a.encounterDate).getTime()
        );

        console.log(`📊 Total combined encounters: ${allEncounters.length}`);

        return {
            patient,
            encounters: allEncounters,
            facilities: [
                {
                    facilityId: 'CLINIC_CONNECT',
                    facilityName: 'ClinicConnect Clinic',
                    systemType: 'firebase',
                    encounterCount: clinicConnectEncounters.length,
                    hasData: clinicConnectEncounters.length > 0
                },
                {
                    facilityId: this.facilityId,
                    facilityName: process.env.FACILITY_NAME || 'Render Hospital',
                    systemType: 'postgres',
                    encounterCount: localEncounters.length,
                    hasData: localEncounters.length > 0
                }
            ],
            facilitiesCount: 2,
            totalEncounters: allEncounters.length,
            consentVerified: true
        };
    }

    // ⭐ Fetch from ClinicConnect via HIE Gateway (OTP REQUIRED)
    async fetchViaHieGateway(nupi: string, otpToken: string) {
        try {
            console.log(`🔐 Fetching from HIE Gateway with OTP verification`);
            console.log(`🔗 Gateway URL: ${this.hieGatewayUrl}/patients/${nupi}/encounters`);

            const response = await axios.get(
                `${this.hieGatewayUrl}/patients/${nupi}/encounters`,
                {
                headers: {
                    'X-OTP-Token': otpToken, // ⭐ OTP token is REQUIRED
                    'X-Facility-Id': this.facilityId,
                    'X-User-Id': 'system' // In production, use actual logged-in user
                },
                timeout: 10000,
                }
            );

            if (response.data.success && response.data.consentVerified) {
                console.log(`✅ Consent verified! Fetched ${response.data.count} encounters`);
                return response.data.data;
            }

            console.log(`⚠️  No encounters or consent not verified`);
            return [];
        
        } catch (error: any) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.error(`❌ OTP consent verification failed`);
                throw new Error('OTP consent verification failed. Please request new OTP.');
            }
        
            if (error.response?.status === 404) {
                console.log(`ℹ️  No encounters found for ${nupi}`);
                return [];
            }
        
            console.error(`❌ HIE Gateway error:`, error.message);
            throw new Error('Failed to fetch from HIE Gateway');
        }
    }

    async create(data: any) {
        const [patient] = await db.insert(patients).values(data).returning();
        return patient;
    }

    async getById(id: string) {
        return await db.query.patients.findFirst({
            where: eq(patients.id, id),
        });
    }
}

export const patientService = new PatientService();
