import { eq, desc, sql } from 'drizzle-orm';
import axios, { AxiosInstance } from 'axios';
import db from '../db/db';
import { referrals, patients } from '../db/schema';

function createGatewayClient(): AxiosInstance {
  return axios.create({
    baseURL: process.env.HIE_GATEWAY_URL || 'http://localhost:5000',
    timeout: 60000,
    headers: {
      'X-Facility-Id': process.env.FACILITY_ID     || '',
      'X-Api-Key':     process.env.FACILITY_API_KEY || '',
      'Content-Type':  'application/json',
    },
  });
}

const gateway = createGatewayClient();

export type ReferralStatus  = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
export type ReferralUrgency = 'ROUTINE' | 'URGENT' | 'EMERGENCY';

export class ReferralService {

  // ══════════════════════════════════════════════════════════════
  //  SYNC FROM GATEWAY
  //  Pulls referrals from blockchain and upserts into local DB.
  //  Called on startup + before every list query so both
  //  facilities always see up-to-date data.
  // ══════════════════════════════════════════════════════════════

  async syncFromGateway() {
    const facilityId = process.env.FACILITY_ID || '';
    try {
      // Fetch both directions in parallel
      const [inRes, outRes] = await Promise.all([
        gateway.get(`/api/referrals/incoming/${facilityId}`),
        gateway.get(`/api/referrals/outgoing/${facilityId}`),
      ]);

      const chainReferrals = [
        ...( inRes.data?.referrals || []),
        ...(outRes.data?.referrals || []),
      ];

      if (!chainReferrals.length) return;

      // Upsert each — insert if not exists, skip if already local
      for (const r of chainReferrals) {
        const existing = await db.query.referrals.findFirst({
          where: eq(referrals.referralId, r.referralId),
        });

        if (!existing) {
          await db.insert(referrals).values({
            referralId:     r.referralId,
            patientNupi:    r.patientNupi,
            fromFacilityId: r.fromFacilityId,
            toFacilityId:   r.toFacilityId,
            reason:         r.reason,
            urgency:        r.urgency   || 'ROUTINE',
            status:         'PENDING',             // new from chain = always PENDING
            issuedBy:       r.issuedBy  || null,
            blockIndex:     r.blockIndex ?? null,
            createdAt:      r.createdAt ? new Date(r.createdAt) : new Date(),
          });
          console.log(`📋 Synced referral from chain: ${r.referralId}`);
        }
      }
    } catch (err: any) {
      // Don't crash if gateway is unreachable — local data still works
      console.warn('⚠️  Referral sync from gateway failed:', err.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  CREATE REFERRAL
  //  1. Logs on blockchain via gateway
  //  2. Saves to local Neon DB
  // ══════════════════════════════════════════════════════════════

  async create(data: {
    nupi:       string;
    toFacility: string;
    reason:     string;
    urgency?:   ReferralUrgency;
    issuedBy?:  string;
    notes?:     string;
  }) {
    const facilityId = process.env.FACILITY_ID || '';

    // ── Log on blockchain ──────────────────────────────────────
    const chainRes = await gateway.post('/api/referrals', {
      nupi:       data.nupi,
      toFacility: data.toFacility,
      reason:     data.reason,
      urgency:    data.urgency   || 'ROUTINE',
      issuedBy:   data.issuedBy || 'Unknown',
    });

    const { referralId, block } = chainRes.data;

    // ── Save to local DB ───────────────────────────────────────
    const [referral] = await db.insert(referrals).values({
      referralId,
      patientNupi:    data.nupi,
      fromFacilityId: facilityId,
      toFacilityId:   data.toFacility,
      reason:         data.reason,
      urgency:        data.urgency  || 'ROUTINE',
      status:         'PENDING',
      issuedBy:       data.issuedBy || null,
      notes:          data.notes    || null,
      blockIndex:     block?.index  ?? null,
    }).returning();

    console.log(`📋 Referral created: ${referralId} → ${data.toFacility} | Block #${block?.index}`);
    return { referral, referralId, blockIndex: block?.index };
  }

  // ══════════════════════════════════════════════════════════════
  //  GET OUTGOING — sync first, then query local DB
  // ══════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════
  //  ENRICH WITH PATIENT NAMES
  //  Joins local patients table. Falls back to NUPI for unknown patients
  //  (cross-facility incoming where patient not registered locally yet).
  // ══════════════════════════════════════════════════════════════

  private async enrichWithPatientNames(rows: any[]): Promise<any[]> {
    if (!rows.length) return rows;
    // Collect unique NUPIs
    const nupis = [...new Set(rows.map(r => r.patientNupi).filter(Boolean))];
    // Fetch matching local patients in one query
    const localPatients = nupis.length
      ? await db.query.patients.findMany({
          where: (p, { inArray }) => inArray(p.nupi, nupis),
          columns: { nupi: true, firstName: true, lastName: true },
        })
      : [];
    const nameMap = new Map(localPatients.map(p => [p.nupi, `${p.firstName} ${p.lastName}`.trim()]));
    return rows.map(r => ({
      ...r,
      patientName: nameMap.get(r.patientNupi) || null, // null = not registered locally
    }));
  }

  async getOutgoing() {
    await this.syncFromGateway();
    const facilityId = process.env.FACILITY_ID || '';
    const rows = await db.query.referrals.findMany({
      where:   eq(referrals.fromFacilityId, facilityId),
      orderBy: [desc(referrals.createdAt)],
    });
    return this.enrichWithPatientNames(rows);
  }

  // ══════════════════════════════════════════════════════════════
  //  GET INCOMING — sync first, then query local DB
  // ══════════════════════════════════════════════════════════════

  async getIncoming() {
    await this.syncFromGateway();
    const facilityId = process.env.FACILITY_ID || '';
    const rows = await db.query.referrals.findMany({
      where:   eq(referrals.toFacilityId, facilityId),
      orderBy: [desc(referrals.createdAt)],
    });
    return this.enrichWithPatientNames(rows);
  }

  // ══════════════════════════════════════════════════════════════
  //  GET BY ID
  // ══════════════════════════════════════════════════════════════

  async getById(id: string) {
    return db.query.referrals.findFirst({
      where: eq(referrals.id, id),
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  GET FOR PATIENT
  // ══════════════════════════════════════════════════════════════

  async getForPatient(nupi: string) {
    await this.syncFromGateway();
    return db.query.referrals.findMany({
      where:   eq(referrals.patientNupi, nupi),
      orderBy: [desc(referrals.createdAt)],
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  UPDATE STATUS
  //  Only the receiving facility can accept/reject/complete.
  //  Only the sending facility can cancel.
  // ══════════════════════════════════════════════════════════════

  async updateStatus(id: string, status: ReferralStatus, notes?: string) {
    const existing = await db.query.referrals.findFirst({
      where: eq(referrals.id, id),
    });
    if (!existing) throw new Error('Referral not found');

    const facilityId = process.env.FACILITY_ID || '';
    const isReceiver = existing.toFacilityId   === facilityId;
    const isSender   = existing.fromFacilityId === facilityId;

    if (['ACCEPTED', 'REJECTED', 'COMPLETED'].includes(status) && !isReceiver)
      throw new Error('Only the receiving facility can accept, reject or complete a referral');
    if (status === 'CANCELLED' && !isSender)
      throw new Error('Only the sending facility can cancel a referral');

    const allowed: Record<string, ReferralStatus[]> = {
      PENDING:   ['ACCEPTED', 'REJECTED', 'CANCELLED'],
      ACCEPTED:  ['COMPLETED', 'CANCELLED'],
      REJECTED:  [],
      COMPLETED: [],
      CANCELLED: [],
    };

    const current = (existing.status || 'PENDING').toUpperCase() as ReferralStatus;
    if (!allowed[current]?.includes(status))
      throw new Error(`Cannot transition referral from ${current} to ${status}`);

    const [updated] = await db.update(referrals)
      .set({ status, notes: notes || existing.notes, updatedAt: new Date() })
      .where(eq(referrals.id, id))
      .returning();

    console.log(`📋 Referral ${id} → ${status}`);
    return updated;
  }
}

export const referralService = new ReferralService();

// ── Startup sync ──────────────────────────────────────────────────
// Call this once in your server.ts / index.ts after app starts:
//   import { referralService } from './routes/referral.service';
//   referralService.syncFromGateway();

export async function startReferralSync() {
  console.log('📋 Starting referral sync from gateway...');
  await referralService.syncFromGateway();

  // Re-sync every 5 minutes to pick up new referrals from other facilities
  setInterval(() => {
    referralService.syncFromGateway();
  }, 5 * 60 * 1000);

  console.log('📋 Referral sync active (every 5 min)');
}