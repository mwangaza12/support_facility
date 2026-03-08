import { Router } from 'express';
import { gte, count, eq, desc, and } from 'drizzle-orm';
import db from '../db/db';
import { patients, encounters, referrals } from '../db/schema';
import axios from 'axios';

const router = Router();

// GET /api/dashboard/stats
router.get('/stats', async (_req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const facilityId = process.env.FACILITY_ID || '';

    const [
      totalPatientsRes,
      todayEncountersRes,
      activeEncountersRes,
      recentPatients,
      recentEncounters,
      pendingReferralsRes,
    ] = await Promise.all([
      db.select({ value: count() }).from(patients),
      db.select({ value: count() }).from(encounters).where(gte(encounters.encounterDate, todayStart)),
      db.select({ value: count() }).from(encounters).where(eq(encounters.status, 'in-progress')),
      db.query.patients.findMany({
        orderBy: [desc(patients.createdAt)],
        limit: 5,
        columns: { id: true, nupi: true, firstName: true, lastName: true, createdAt: true, gender: true },
      }),
      db.query.encounters.findMany({
        orderBy: [desc(encounters.encounterDate)],
        limit: 5,
        columns: {
          id: true, patientNupi: true, encounterType: true,
          chiefComplaint: true, encounterDate: true, status: true,
          practitionerName: true,
        },
      }),
      db.select({ value: count() })
        .from(referrals)
        .where(and(eq(referrals.toFacilityId, facilityId), eq(referrals.status, 'PENDING'))),
    ]);

    // Chain block count — best effort from gateway
    let chainBlocks: number | null = null;
    try {
      const gatewayUrl = process.env.HIE_GATEWAY_URL || 'http://localhost:5000';
      const chainRes   = await axios.get(`${gatewayUrl}/api/chain/status`, {
        timeout: 5000,
        headers: {
          'X-Facility-Id': facilityId,
          'X-Api-Key':     process.env.FACILITY_API_KEY || '',
        },
      });
      chainBlocks = chainRes.data?.chainLength ?? chainRes.data?.blockCount ?? null;
    } catch { /* gateway unreachable */ }

    res.json({
      success: true,
      stats: {
        totalPatients:    totalPatientsRes[0]?.value    ?? 0,
        todayEncounters:  todayEncountersRes[0]?.value  ?? 0,
        activeEncounters: activeEncountersRes[0]?.value ?? 0,
        pendingReferrals: pendingReferralsRes[0]?.value ?? 0,
        chainBlocks,
      },
      recentPatients,
      recentEncounters,
    });
  } catch (err: any) {
    console.error('Dashboard stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;