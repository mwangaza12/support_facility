import { eq } from 'drizzle-orm';
import axios from 'axios';
import db from '../db/db';
import { patients } from '../db/schema';

export class PatientService {
    async getByNupi(nupi: string) {
        // Check local database first
        let patient = await db.query.patients.findFirst({
        where: eq(patients.nupi, nupi),
        });

        // If not found, query NUPI registry
        if (!patient) {
        const nupiData = await this.queryNupiRegistry(nupi);
            if (nupiData) {
                // Create federated record
                [patient] = await db
                .insert(patients)
                .values({
                    nupi: nupiData.nupi,
                    firstName: nupiData.demographics.firstName,
                    lastName: nupiData.demographics.lastName,
                    middleName: nupiData.demographics.middleName,
                    dateOfBirth: new Date(nupiData.demographics.dateOfBirth),
                    gender: nupiData.demographics.gender,
                    nationalId: nupiData.demographics.nationalId,
                    phoneNumber: nupiData.demographics.phoneNumber,
                    email: nupiData.demographics.email,
                    address: nupiData.demographics.address,
                    isFederatedRecord: true,
                })
                .returning();
            }
        }

        return patient;
    }

    async queryNupiRegistry(nupi: string) {
        try {
            const response = await axios.get(
            `${process.env.NUPI_REGISTRY_URL}/patients/${nupi}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.NUPI_API_KEY}`,
                },
                timeout: 5000,
            }
            );
            return response.data;
        } catch (error: any) {
            if (error.response?.status === 404) {
                return null;
            }
            console.error('NUPI registry error:', error.message);
            return null;
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
