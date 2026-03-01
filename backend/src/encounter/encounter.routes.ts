import { Router } from 'express';
import { encounterController } from './encounter.controller';

const router = Router();

router.post('/', encounterController.create.bind(encounterController));
router.get('/patient/:nupi', encounterController.getByPatient.bind(encounterController));
router.get('/:id', encounterController.getById.bind(encounterController));
router.put('/:id', encounterController.update.bind(encounterController));

export default router;
