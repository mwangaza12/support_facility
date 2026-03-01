import { eq, desc } from 'drizzle-orm';
import { encounters } from '../db/schema';
import db from '../db/db';

export class EncounterService {
    async create(data: any) {
        const [encounter] = await db
        .insert(encounters)
        .values({
            ...data,
            facilityId: process.env.FACILITY_ID,
            encounterDate: new Date(data.encounterDate),
        })
        .returning();

        return encounter;
    }

    async getByPatientNupi(nupi: string) {
        return await db.query.encounters.findMany({
            where: eq(encounters.patientNupi, nupi),
            orderBy: [desc(encounters.encounterDate)],
        });
    }

    async getById(id: string) {
        return await db.query.encounters.findFirst({
            where: eq(encounters.id, id),
        });
    }

    async update(id: string, data: any) {
        const [updated] = await db
        .update(encounters)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(encounters.id, id))
        .returning();

        return updated;
    }
}

export const encounterService = new EncounterService();
