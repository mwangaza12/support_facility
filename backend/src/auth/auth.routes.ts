import { Router } from 'express';
import { authController } from './auth.controller';
import { requireAdmin } from '../middleware/auth';

const router = Router();

router.post('/login', authController.login.bind(authController));
router.post('/register', authController.register.bind(authController));
router.post('/staff', authController.addStaff.bind(authController));

export default router;
