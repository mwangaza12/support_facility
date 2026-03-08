import { apiClient } from './auth.api';

// NOTE: apiClient.baseURL = VITE_API_URL = https://…/api
// Paths here must NOT include /api prefix — patient.api.ts is the reference.

export const referralApi = {

  // POST /api/referrals
  create: async (data: {
    nupi:        string;
    toFacility:  string;
    reason:      string;
    urgency?:    'ROUTINE' | 'URGENT' | 'EMERGENCY';
    issuedBy?:   string;
    notes?:      string;
  }) => {
    const res = await apiClient.post('/referrals', data);   // FIX: was '/api/referrals'
    return res.data;
  },

  // GET /api/referrals/outgoing
  getOutgoing: async () => {
    const res = await apiClient.get('/referrals/outgoing'); // FIX: was '/api/referrals/outgoing'
    return res.data;
  },

  // GET /api/referrals/incoming
  getIncoming: async () => {
    const res = await apiClient.get('/referrals/incoming'); // FIX: was '/api/referrals/incoming'
    return res.data;
  },

  // GET /api/referrals/:id
  getById: async (id: string) => {
    const res = await apiClient.get(`/referrals/${id}`);    // FIX: was '/api/referrals/:id'
    return res.data;
  },

  // PATCH /api/referrals/:id/status
  updateStatus: async (
    id: string,
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED',
    notes?: string,
  ) => {
    const res = await apiClient.patch(`/referrals/${id}/status`, { status, notes }); // FIX
    return res.data;
  },

  // GET /api/referrals/patient/:nupi
  getForPatient: async (nupi: string) => {
    const res = await apiClient.get(`/referrals/patient/${nupi}`); // FIX
    return res.data;
  },

  // GET /api/facilities  (proxied by SupportFacility backend → gateway)
  getFacilities: async () => {
    const res = await apiClient.get('/facilities');         // FIX: was '/api/facilities'
    return res.data;
  },
};