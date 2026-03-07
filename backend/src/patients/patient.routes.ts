import { Router } from 'express';
import { patientController } from './patient.controller';

const router = Router();

/**
 * AfyaLink Patient Routes
 * ═══════════════════════
 *
 * TWO AUTH MECHANISMS — understand which each route needs:
 *
 *  1. Facility credentials (set in .env — applied by gateway client automatically)
 *       FACILITY_ID + FACILITY_API_KEY
 *       These are on every outbound call to the gateway.
 *       The gateway uses them to confirm this is a registered facility.
 *
 *  2. Patient access token (obtained per-patient after identity verification)
 *       Authorization: Bearer <token>
 *       Obtained from: POST /patients/verify/answer
 *       Required for any route that reads cross-facility data.
 *
 * TYPICAL WORKFLOW FOR A RETURNING PATIENT
 * ─────────────────────────────────────────
 *  1. GET  /patients/verify/question?nationalId=X&dob=Y   → get their security question
 *  2. POST /patients/verify/answer  { nationalId, dob, answer }
 *          → returns { token, nupi, facilitiesVisited, encounterIndex }
 *          → doctor already sees which hospitals the patient has been to
 *  3. GET  /patients/:nupi/federated  (Authorization: Bearer <token>)
 *          → full chart from all facilities merged
 *  4. POST /patients/:nupi/visit  (Authorization: Bearer <token>)
 *          → save this visit to Neon + mint block on chain
 *
 * REGISTERING A NEW PATIENT
 * ─────────────────────────
 *  POST /patients  { nationalId, firstName, ..., securityQuestion, securityAnswer, pin }
 *  → saves to Neon + mints PATIENT_REGISTERED block
 */

// ── Patient registration & lookup ─────────────────────────────────

// Register new patient (Neon DB + blockchain)
router.post('/', patientController.create.bind(patientController));

// Get by local DB row ID
router.get('/id/:id', patientController.getById.bind(patientController));

// Search local DB by NUPI / name / national ID
// GET /patients/search/nupi?query=NUPI-7A3F  or  ?query=Mary
router.get('/search/nupi', patientController.searchNUPI.bind(patientController));

// ── Identity verification ─────────────────────────────────────────
// These routes produce the access token needed for all cross-facility calls

// Step 1 — get the patient's security question
// GET /patients/verify/question?nationalId=28473910&dob=1979-03-15
router.get('/verify/question', patientController.getSecurityQuestion.bind(patientController));

// Step 2a — verify by security question answer → access token
// POST /patients/verify/answer  { nationalId, dob, answer }
router.post('/verify/answer', patientController.verifyAnswer.bind(patientController));

// Step 2b — verify by PIN → access token (alternative to answer)
// POST /patients/verify/pin  { nationalId, dob, pin }
router.post('/verify/pin', patientController.verifyPin.bind(patientController));

// ── NUPI-based routes ─────────────────────────────────────────────

// Get patient by NUPI — local DB first, then gateway fallback
// GET /patients/nupi/NUPI-7A3F...
// Headers: Authorization: Bearer <token>  (only needed if not in local DB)
router.get('/nupi/:nupi', patientController.getByNupi.bind(patientController));

// Check in patient at this facility (records encounter in Neon + chain)
// POST /patients/nupi/NUPI-7A3F.../checkin
// Headers: Authorization: Bearer <token>
// Body: { practitionerName?, chiefComplaint? }
router.post('/:nupi/checkin', patientController.checkIn.bind(patientController));

// ── Encounters ────────────────────────────────────────────────────

// This facility's encounters only (local Neon DB)
// GET /patients/NUPI-7A3F.../encounters
router.get('/:nupi/encounters', patientController.getLocalEncounters.bind(patientController));

// Encounters from a specific OTHER facility (gateway → that facility's FHIR server)
// GET /patients/NUPI-7A3F.../encounters/facility/NBI-001
// Headers: Authorization: Bearer <token>
router.get('/:nupi/encounters/facility/:facilityId', patientController.getEncountersFromFacility.bind(patientController));

// Full federated chart — local Neon + ALL facilities merged
// GET /patients/NUPI-7A3F.../federated
// Headers: Authorization: Bearer <token>
router.get('/:nupi/federated', patientController.getFederatedData.bind(patientController));

// ── Blockchain data ───────────────────────────────────────────────

// Which facilities this patient has visited (from blockchain index)
// GET /patients/NUPI-7A3F.../facilities
router.get('/:nupi/facilities', patientController.getFacilities.bind(patientController));

// Full blockchain audit trail for this patient
// GET /patients/NUPI-7A3F.../history
router.get('/:nupi/history', patientController.getHistory.bind(patientController));

// ── Visit / encounter recording ───────────────────────────────────

// Record a clinical visit (Neon DB + blockchain)
// POST /patients/NUPI-7A3F.../visit
// Headers: Authorization: Bearer <token>
// Body: { encounterType?, chiefComplaint?, vitalSigns?, diagnoses?, medications?, notes? }
router.post('/:nupi/visit', patientController.registerVisit.bind(patientController));

export default router;