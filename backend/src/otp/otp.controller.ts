// src/controllers/otpController.ts
import { Request, Response } from 'express';
import { otpService } from './otp.service';
export class OtpController {
  async request(req: Request, res: Response) {
    try {
      const { patientNupi, patientPhone, targetFacility } = req.body;
      const user = (req as any).user;

      if (!patientNupi || !patientPhone || !targetFacility) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
        });
      }

      const result = await otpService.requestOtp({
        patientNupi,
        patientPhone,
        requestingUser: user?.email || 'system',
        targetFacility,
      });

      return res.json({
        success: true,
        data: result,
        message: 'OTP sent to patient phone',
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async verify(req: Request, res: Response) {
    try {
      const { requestId, otp } = req.body;

      if (!requestId || !otp) {
        return res.status(400).json({
          success: false,
          error: 'Request ID and OTP required',
        });
      }

      const result = await otpService.verifyOtp(requestId, otp);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export const otpController = new OtpController();
