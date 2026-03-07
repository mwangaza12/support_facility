import { apiClient } from './auth.api';

export const referralApi = {

  // Create a referral (gateway blockchain)
  create: async (data: {
    nupi:        string;
    toFacility:  string;
    reason:      string;
    urgency?:    'ROUTINE' | 'URGENT' | 'EMERGENCY';
    issuedBy?:   string;
    notes?:      string;
  }) => {
    const res = await apiClient.post('/api/referrals', data);
    return res.data;
  },

  // Get outgoing referrals from this facility (local DB)
  getOutgoing: async () => {
    const res = await apiClient.get('/api/referrals/outgoing');
    return res.data;
  },

  // Get incoming referrals to this facility (local DB)
  getIncoming: async () => {
    const res = await apiClient.get('/api/referrals/incoming');
    return res.data;
  },

  // Get referral by ID
  getById: async (id: string) => {
    const res = await apiClient.get(`/api/referrals/${id}`);
    return res.data;
  },

  // Update referral status
  updateStatus: async (id: string, status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED', notes?: string) => {
    const res = await apiClient.patch(`/api/referrals/${id}/status`, { status, notes });
    return res.data;
  },

  // Get referrals for a specific patient
  getForPatient: async (nupi: string) => {
    const res = await apiClient.get(`/api/referrals/patient/${nupi}`);
    return res.data;
  },

  // Get all registered facilities from gateway
  getFacilities: async () => {
    const res = await apiClient.get('/api/facilities');
    return res.data;
  },
};