import { Router } from 'express';
import { referralController } from './referral.controller';

const router = Router();

/**
 * AfyaLink Referral Routes
 * ════════════════════════
 *
 * All routes require facility credentials (set in .env).
 * The backend applies X-Facility-Id + X-Api-Key automatically
 * via the gateway client on outbound calls.
 *
 * STATUS TRANSITIONS:
 *   PENDING → ACCEPTED  (receiving facility)
 *   PENDING → REJECTED  (receiving facility)
 *   PENDING → CANCELLED (sending facility)
 *   ACCEPTED → COMPLETED (receiving facility)
 *   ACCEPTED → CANCELLED (sending facility)
 */

// ── Static routes first ───────────────────────────────────────────

// Create a new referral (doctors only — enforced at controller/middleware level)
router.post('/', referralController.create.bind(referralController));

// Outgoing referrals from this facility
router.get('/outgoing', referralController.getOutgoing.bind(referralController));

// Incoming referrals to this facility
router.get('/incoming', referralController.getIncoming.bind(referralController));

// All referrals for a specific patient
router.get('/patient/:nupi', referralController.getForPatient.bind(referralController));

// ── Wildcard /:id routes after static ────────────────────────────

// Get referral by ID
router.get('/:id', referralController.getById.bind(referralController));

// Update referral status
router.patch('/:id/status', referralController.updateStatus.bind(referralController));

export default router;