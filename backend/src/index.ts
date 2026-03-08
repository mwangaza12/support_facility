import express from 'express';
import cors    from 'cors';
import helmet  from 'helmet';
import dotenv  from 'dotenv';
import axios   from 'axios';

import authRoutes      from './auth/auth.routes';
import encounterRoutes from './encounter/encounter.routes';
import patientRoutes   from './patients/patient.routes';
import referralRoutes  from './referrals/referral.routes';

// FIX: import the sync starter that was exported but never called
import { startReferralSync } from './referrals/referral.service';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    facility:  process.env.FACILITY_NAME,
  });
});

// ── API routes ────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/patients',   patientRoutes);
app.use('/api/encounters', encounterRoutes);

// FIX: referral routes were missing — frontend calls /api/referrals/*
app.use('/api/referrals', referralRoutes);

// FIX: proxy /api/facilities to the gateway so the referral creation
//      form can populate its facility picker without the frontend
//      needing direct gateway access.
app.get('/api/facilities', async (_req, res) => {
  try {
    const gatewayUrl = process.env.HIE_GATEWAY_URL || 'http://localhost:5000';
    const response   = await axios.get(`${gatewayUrl}/api/facilities`, { timeout: 15000 });
    console.log(response);
    res.json(response.data);
  } catch (err: any) {
    console.warn('⚠️  Could not fetch facilities from gateway:', err.message);
    // Return empty list gracefully — UI shows "no facilities" rather than crashing
    res.json({ success: true, facilities: [], count: 0 });
  }
});

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Error handler ─────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────
const start = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`\n SupportFacility Backend`);
      console.log(`   http://localhost:${PORT}`);
      console.log(`   Facility: ${process.env.FACILITY_NAME} (${process.env.FACILITY_ID})\n`);
    });

    // FIX: start referral sync after server is up so incoming referrals
    //      from other facilities are picked up on startup and every 5 min
    await startReferralSync();

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();