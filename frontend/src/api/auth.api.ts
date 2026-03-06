import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';

// ── Base client ───────────────────────────────────────────────────
// Base URL comes from .env — VITE_API_URL for Vite projects
// or NEXT_PUBLIC_API_URL for Next.js

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
});

// ── Request interceptor — attach JWT on every request ─────────────
apiClient.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ── Response interceptor — auto logout on 401 ─────────────────────
apiClient.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            const url = err.config?.url || '';
            
            // Only logout if it's a staff auth failure, not a patient verification failure
            const isPatientVerify = url.includes('/verify/') || url.includes('/patients/verify');
            
            if (!isPatientVerify) {
                useAuthStore.getState().logout();
                window.location.href = '/login';
            }
        }
        return Promise.reject(err);
    }
);

// ── Auth API calls ────────────────────────────────────────────────

export const authApi = {
    login: async (email: string, password: string) => {
        const res = await apiClient.post('/auth/login', { email, password });
        // Response shape: { success, data: { token, user } }
        return res.data.data as { token: string; user: any };
    },

    register: async (data: {
        email:     string;
        password:  string;
        firstName: string;
        lastName:  string;
        role:      string;
    }) => {
        const res = await apiClient.post('/auth/register', data);
        return res.data;
    },
};