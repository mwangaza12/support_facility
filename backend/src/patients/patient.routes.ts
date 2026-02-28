import { Router } from 'express';
import { patientController } from './patient.controller';

const router = Router();

// Local patient operations
router.get('/:id', patientController.getById.bind(patientController));
router.post('/', patientController.create.bind(patientController));

// NUPI registry operations
router.get('/nupi/:nupi', patientController.getByNupi.bind(patientController));
router.post('/nupi/:nupi/checkin', patientController.checkIn.bind(patientController));
router.get('/search/nupi', patientController.searchNUPI.bind(patientController));
router.get('/:nupi/facilities', patientController.getFacilities.bind(patientController));
router.post('/:nupi/visit', patientController.registerVisit.bind(patientController));

export default router;