import { Router } from 'express';
import { otpController } from './otp.controller';

const router = Router();

router.post('/request', otpController.request.bind(otpController));
router.post('/verify', otpController.verify.bind(otpController));

export default router;
