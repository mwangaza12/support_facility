import { Router } from 'express';
import { patientController } from './patient.controller';

const router = Router();

// ── Static / specific routes FIRST (before any /:nupi wildcards) ──

// List all local patients
router.get('/', patientController.getAll.bind(patientController));

// Registration
router.post('/', patientController.create.bind(patientController));

// Lookup by local DB ID
router.get('/id/:id', patientController.getById.bind(patientController));

// Search
router.get('/search/nupi', patientController.searchNUPI.bind(patientController));

// Identity verification
router.get('/verify/question', patientController.getSecurityQuestion.bind(patientController));
router.post('/verify/answer',  patientController.verifyAnswer.bind(patientController));
router.post('/verify/pin',     patientController.verifyPin.bind(patientController));

// NUPI lookup (static prefix keeps it above /:nupi)
router.get('/nupi/:nupi', patientController.getByNupi.bind(patientController));

// ── Wildcard /:nupi routes AFTER all static routes ────────────────

// Check-in
router.post('/:nupi/checkin',  patientController.checkIn.bind(patientController));

// Encounters
router.get('/:nupi/encounters', patientController.getLocalEncounters.bind(patientController));
router.get('/:nupi/encounters/facility/:facilityId', patientController.getEncountersFromFacility.bind(patientController));

// Federated chart
router.get('/:nupi/federated', patientController.getFederatedData.bind(patientController));

// Blockchain data
router.get('/:nupi/facilities', patientController.getFacilities.bind(patientController));
router.get('/:nupi/history',    patientController.getHistory.bind(patientController));

// Visit recording
router.post('/:nupi/visit', patientController.registerVisit.bind(patientController));

export default router;