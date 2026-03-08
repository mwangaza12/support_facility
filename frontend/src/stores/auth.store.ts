import { create } from 'zustand';
import { authApi } from '../api/auth.api';

export type UserRole = 'doctor' | 'nurse' | 'receptionist' | 'admin' | 'pharmacist' | 'lab_technician';

export interface AuthUser {
  id:         string;
  email:      string;
  firstName:  string;
  lastName:   string;
  role:       UserRole;
  facilityId: string;
  facilityName: string;
}

interface AuthState {
  user:      AuthUser | null;
  token:     string | null;
  isLoading: boolean;
  error:     string | null;

  login:      (email: string, password: string) => Promise<void>;
  logout:     () => void;
  clearError: () => void;
  hydrate:    () => void;          // call once in App.tsx on mount
}

const TOKEN_KEY = 'afyalink_token';
const USER_KEY  = 'afyalink_user';

// ── Use sessionStorage — safer than localStorage ──────────────────
// sessionStorage is cleared when the browser tab closes.
// The token never survives a full browser close, reducing the window
// of exposure if a device is left unattended.
// It is NOT accessible by other tabs / origins.

const session = {
  getToken: ()         => sessionStorage.getItem(TOKEN_KEY),
  getUser:  ()         => {
    try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  },
  save: (token: string, user: AuthUser) => {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  },
};

export const useAuthStore = create<AuthState>((set) => ({
  // Initialise directly from sessionStorage — no async hydration needed
  user:      session.getUser(),
  token:     session.getToken(),
  isLoading: false,
  error:     null,

  hydrate: () => {
    // Call in App.tsx on mount to re-sync if needed
    set({ token: session.getToken(), user: session.getUser() });
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await authApi.login(email, password);
      session.save(token, user);
      set({ token, user, isLoading: false });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.response?.data?.error || err.message || 'Login failed',
      });
      throw err;
    }
  },

  logout: () => {
    session.clear();
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));