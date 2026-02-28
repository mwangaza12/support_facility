import { Router } from 'express';
import { patientController } from './patient.controller';

const router = Router();

router.get('/nupi/:nupi', patientController.getByNupi.bind(patientController));
router.get('/:id', patientController.getById.bind(patientController));
router.post('/', patientController.create.bind(patientController));

export default router;
