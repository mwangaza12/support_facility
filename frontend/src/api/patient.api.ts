import { apiClient } from './auth.api';

// ── Patient API ───────────────────────────────────────────────────

export const patientApi = {
  search: async (query: string) => {
    const res = await apiClient.get('/patients/search/nupi', { params: { query } });
    return res.data;
  },

  getByNupi: async (nupi: string, token?: string) => {
    const res = await apiClient.get(`/patients/nupi/${nupi}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.data;
  },

  getById: async (id: string) => {
    const res = await apiClient.get(`/patients/id/${id}`);
    return res.data;
  },

  create: async (data: Record<string, any>) => {
    const res = await apiClient.post('/patients', data);
    return res.data;
  },

  getSecurityQuestion: async (nationalId: string, dob: string) => {
    const res = await apiClient.get('/patients/verify/question', { params: { nationalId, dob } });
    return res.data;
  },

  verifyAnswer: async (data: { nationalId: string; dob: string; answer: string }) => {
    const res = await apiClient.post('/patients/verify/answer', data);
    return res.data;
  },

  verifyPin: async (data: { nationalId: string; dob: string; pin: string }) => {
    const res = await apiClient.post('/patients/verify/pin', data);
    return res.data;
  },

  getFederatedData: async (nupi: string, accessToken: string) => {
    const res = await apiClient.get(`/patients/${nupi}/federated`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.data;
  },

  getLocalEncounters: async (nupi: string) => {
    const res = await apiClient.get(`/patients/${nupi}/encounters`);
    return res.data;
  },

  recordVisit: async (nupi: string, accessToken: string, data: Record<string, any>) => {
    const res = await apiClient.post(`/patients/${nupi}/visit`, data, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.data;
  },

  getFacilities: async (nupi: string) => {
    const res = await apiClient.get(`/patients/${nupi}/facilities`);
    return res.data;
  },

  // Silent check-in — caches patient in local DB from gateway
  checkIn: async (nupi: string, accessToken: string) => {
    const res = await apiClient.post(`/patients/${nupi}/checkin`, {}, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.data;
  },
};

// ── Staff API ─────────────────────────────────────────────────────

export const staffApi = {
  addStaff: async (data: {
    firstName:   string;
    lastName:    string;
    email:       string;
    password:    string;
    role:        string;
    department?: string;
  }) => {
    const res = await apiClient.post('/auth/staff', data);
    return res.data;
  },
};