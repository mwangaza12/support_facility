import { create } from 'zustand';
import { referralApi } from '../api/referral.api';

export interface Referral {
  id:              string;
  patientNupi:     string;
  patientName?:    string;
  fromFacilityId:  string;
  fromFacilityName?:string;
  toFacilityId:    string;
  toFacilityName?: string;
  reason:          string;
  urgency:         'ROUTINE' | 'URGENT' | 'EMERGENCY';
  status:          'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
  issuedBy?:       string;
  notes?:          string;
  createdAt:       string;
  updatedAt?:      string;
  blockIndex?:     number;
}

interface ReferralState {
  outgoing:       Referral[];
  incoming:       Referral[];
  selected:       Referral | null;
  isLoading:      boolean;
  isSubmitting:   boolean;
  facilities:     any[];
  error:          string | null;

  loadOutgoing:   () => Promise<void>;
  loadIncoming:   () => Promise<void>;
  loadFacilities: () => Promise<void>;
  selectReferral: (r: Referral | null) => void;
  createReferral: (data: any) => Promise<any>;
  updateStatus:   (id: string, status: Referral['status'], notes?: string) => Promise<void>;
  clearError:     () => void;
}

export const useReferralStore = create<ReferralState>((set, get) => ({
  outgoing:     [],
  incoming:     [],
  selected:     null,
  isLoading:    false,
  isSubmitting: false,
  facilities:   [],
  error:        null,

  loadOutgoing: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await referralApi.getOutgoing();
      set({ outgoing: res.data || [], isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
    }
  },

  loadIncoming: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await referralApi.getIncoming();
      set({ incoming: res.data || [], isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
    }
  },

  loadFacilities: async () => {
    try {
      const res = await referralApi.getFacilities();
      set({ facilities: res.facilities || [] });
    } catch {}
  },

  selectReferral: (r) => set({ selected: r }),

  createReferral: async (data) => {
    set({ isSubmitting: true, error: null });
    try {
      const res = await referralApi.create(data);
      // Reload outgoing after creation
      await get().loadOutgoing();
      set({ isSubmitting: false });
      return res;
    } catch (err: any) {
      set({ isSubmitting: false, error: err.response?.data?.error || err.message });
      throw err;
    }
  },

  updateStatus: async (id, status, notes) => {
    set({ isSubmitting: true, error: null });
    try {
      await referralApi.updateStatus(id, status, notes);
      // Update locally
      const update = (list: Referral[]) =>
        list.map(r => r.id === id ? { ...r, status, notes: notes || r.notes } : r);
      set(s => ({
        outgoing:     update(s.outgoing),
        incoming:     update(s.incoming),
        selected:     s.selected?.id === id ? { ...s.selected, status } : s.selected,
        isSubmitting: false,
      }));
    } catch (err: any) {
      set({ isSubmitting: false, error: err.response?.data?.error || err.message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));