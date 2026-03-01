import { eq } from 'drizzle-orm';
import db from '../db/db';
import { patients } from '../db/schema';
import { nupiDb } from '../config/firebase-nupi';
import { Patient, NUPIPatient, NewPatient } from './patient.types';

export class PatientService {
    // Get patient by NUPI - checks local, then NUPI registry
    async getByNupi(nupi: string): Promise<Patient | any | null> {
        // Check local first
        const localPatient = await db.query.patients.findFirst({
            where: eq(patients.nupi, nupi),
        });

        if (localPatient) return localPatient;

        // Check NUPI registry
        console.log(`Patient ${nupi} not found locally, querying NUPI Registry...`);
        const nupiData = await nupiDb.getPatientByNUPI(nupi);
        
        if (!nupiData) return null;

        // Transform NUPI data to expected format
        return this.transformNUPIData(nupiData);
    }

    // Check-in patient (creates local record)
    async checkInPatient(nupi: string): Promise<Patient | null> {
        // Check if exists locally
        let patient = await db.query.patients.findFirst({
            where: eq(patients.nupi, nupi),
        });

        if (patient) return patient;

        // Get from NUPI and create local
        const nupiData = await nupiDb.getPatientByNUPI(nupi);
        if (!nupiData) return null;

        const transformed = this.transformNUPIData(nupiData);
    
        // Use the SCHEMA PROPERTY NAMES (camelCase) not column names
        const [newPatient] = await db.insert(patients).values({
            nupi: transformed.nupi,
            firstName: transformed.firstName || '', 
            lastName: transformed.lastName || '',    
            middleName: transformed.middleName,     
            dateOfBirth: transformed.dateOfBirth || new Date(), 
            gender: transformed.gender || '',        
            nationalId: transformed.nationalId,
            phoneNumber: transformed.phoneNumber,
            email: transformed.email,
            address: transformed.address,
            isFederatedRecord: true,                  // Boolean, not text
        }).returning();

        return newPatient;
    }

    // Transform NUPI data to our format
    private transformNUPIData(data: NUPIPatient) {
        let firstName = '', lastName = '', middleName = '';
        
        if (data.full_name) {
            const parts = data.full_name.split(' ');
            firstName = parts[0] || '';
            if (parts.length > 2) {
                middleName = parts[1] || '';
                lastName = parts.slice(2).join(' ') || '';
            } else {
                lastName = parts.slice(1).join(' ') || '';
            }
        }

        // Parse date of birth from Firebase timestamp
        let dateOfBirth = null;
        if (data.date_of_birth?._seconds) {
            dateOfBirth = new Date(data.date_of_birth._seconds * 1000);
        }

        return {
            nupi: data.nupi,
            firstName: firstName || data.firstName || '',
            lastName: lastName || data.lastName || '',
            middleName: middleName || data.middleName || null,
            gender: data.gender || '',
            dateOfBirth: dateOfBirth,
            nationalId: data.nationalId || data.national_id,
            phoneNumber: data.phoneNumber || data.phone_number,
            email: data.email,
            address: data.address || null,
            facilityId: data.facility_id,
            facilityName: data.facility_name,
        };
    }

    // Search NUPI registry
    async searchNUPI(criteria: { lastName?: string; nationalId?: string }) {
        return await nupiDb.searchPatients(criteria);
    }

    // Get facility history from NUPI
    async getFacilityHistory(nupi: string) {
        return await nupiDb.getPatientFacilities(nupi);
    }

    // Register visit in NUPI
    async registerVisit(nupi: string, data: { facilityId: string; facilityName: string; encounterId: string }) {
        return await nupiDb.registerFacilityVisit({
            nupi,
            ...data,
            encounterDate: new Date().toISOString()
        });
    }

    // Local CRUD operations
    async create(data: NewPatient) {
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