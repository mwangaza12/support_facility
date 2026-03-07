import { Request, Response } from 'express';
import { referralService, ReferralStatus } from './referral.service';

class ReferralController {

  // POST /api/referrals
  async create(req: Request, res: Response) {
    try {
      const { nupi, toFacility, reason, urgency, issuedBy, notes } = req.body;
      if (!nupi || !toFacility || !reason)
        return res.status(400).json({ success: false, error: 'nupi, toFacility and reason required' });

      const result = await referralService.create({ nupi, toFacility, reason, urgency, issuedBy, notes });
      return res.status(201).json({ success: true, data: result });
    } catch (error: any) {
      console.error('create referral error:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/referrals/outgoing
  async getOutgoing(req: Request, res: Response) {
    try {
      const data = await referralService.getOutgoing();
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/referrals/incoming
  async getIncoming(req: Request, res: Response) {
    try {
      const data = await referralService.getIncoming();
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/referrals/patient/:nupi
  async getForPatient(req: Request, res: Response) {
    try {
      const data = await referralService.getForPatient(String(req.params.nupi));
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/referrals/:id
  async getById(req: Request, res: Response) {
    try {
      const referral = await referralService.getById(String(req.params.id));
      if (!referral) return res.status(404).json({ success: false, error: 'Referral not found' });
      return res.json({ success: true, data: referral });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // PATCH /api/referrals/:id/status
  async updateStatus(req: Request, res: Response) {
    try {
      const { status, notes } = req.body;
      const validStatuses: ReferralStatus[] = ['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED'];

      if (!status || !validStatuses.includes(status.toUpperCase()))
        return res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });

      const updated = await referralService.updateStatus(
        String(req.params.id),
        status.toUpperCase() as ReferralStatus,
        notes,
      );
      return res.json({ success: true, data: updated });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404
        : error.message.includes('Only') || error.message.includes('Cannot') ? 403
        : 500;
      return res.status(status).json({ success: false, error: error.message });
    }
  }
}

export const referralController = new ReferralController();