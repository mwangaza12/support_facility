import { patients } from '../db/schema';

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;

// Add this export
export interface PatientResponse {
    success: boolean;
    data?: any;
    error?: string;
}

export interface NUPIPatient {
    id: string;
    nupi: string;
    full_name?: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    gender?: string;
    date_of_birth?: {
        _seconds: number;
        _nanoseconds: number;
    };
    dateOfBirth?: string;
    nationalId?: string;
    national_id?: string;
    phoneNumber?: string;
    phone_number?: string;
    email?: string;
    address?: any;
    facility_id?: string;
    facility_name?: string;
    [key: string]: any;
}

export interface NUPIFacilityRecord {
    id: string;
    nupi: string;
    facilityId: string;
    facilityName: string;
    firstVisit: string;
    lastVisit: string;
    encounterCount: number;
    encounters?: Array<{
        encounterId: string;
        encounterDate: string;
        facilityId: string;
    }>;
}