import { create } from 'zustand';
import { patientApi } from '../api/patient.api';

const TOKEN_KEY = 'afyalink_patient_token';

export interface Patient {
  id:          string;
  nupi:        string;
  nationalId:  string;
  firstName:   string;
  lastName:    string;
  middleName:  string | null;
  dateOfBirth: string;
  gender:      string;
  phoneNumber: string | null;
  email:       string | null;
  address:     { county?: string; subCounty?: string; ward?: string; village?: string } | null;
  bloodGroup:  string | null;
  allergies:   any[] | null;
  active:      boolean;
  isFederatedRecord: boolean;
  // Fields populated after cross-facility verification
  name?:               string;
  registeredFacility?: string;
  facilityCounty?:     string;
}

export interface Encounter {
  id:               string;
  patientNupi:      string;
  encounterDate:    string;
  encounterType:    string;
  chiefComplaint:   string | null;
  practitionerName: string;
  vitalSigns:       any | null;
  diagnoses:        any[];
  medications:      any[] | null;
  notes:            string | null;
  facilityId:       string;
  facilityName?:    string;
  source:           'local' | 'gateway' | 'remote';
  status:           string;
}

interface PatientState {
  // Search
  searchResults: Patient[];
  searchQuery:   string;
  isSearching:   boolean;

  // Current patient
  currentPatient:    Patient | null;
  encounters:        Encounter[];
  accessToken:       string | null;
  facilitiesVisited: any[];
  isLoadingPatient:  boolean;

  // UI
  error: string | null;

  // Actions
  search:       (query: string) => Promise<void>;
  verifyPatient:(nationalId: string, dob: string, answer: string) => Promise<any>;
  verifyByPin:  (nationalId: string, dob: string, pin: string) => Promise<any>;
  loadPatient:  (nupi: string) => Promise<void>;
  clearPatient: () => void;
  clearError:   () => void;

  /**
   * Merge FHIR-sourced demographics into currentPatient after verification.
   * Replaces only the keys present in `patch`, leaving the rest intact.
   * This clears the "ghost record" state so the demographics card renders
   * instead of the "Demographics unavailable" banner.
   */
  setPatientDemographics: (nupi: string, patch: Record<string, any>) => void;

  /**
   * Replace the encounters list wholesale.
   * Called after fetching cross-facility encounters from the FHIR gateway.
   */
  setEncounters: (encounters: Encounter[]) => void;
}

// ── Helpers ───────────────────────────────────────────────────────

function saveToken(token: string) {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch {}
}

function loadToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

// ─────────────────────────────────────────────────────────────────

export const usePatientStore = create<PatientState>((set, get) => ({
  searchResults:     [],
  searchQuery:       '',
  isSearching:       false,
  currentPatient:    null,
  encounters:        [],
  accessToken:       loadToken(),   // hydrate from sessionStorage on init
  facilitiesVisited: [],
  isLoadingPatient:  false,
  error:             null,

  search: async (query) => {
    if (!query.trim()) return set({ searchResults: [], searchQuery: '' });
    set({ isSearching: true, searchQuery: query });
    try {
      const res = await patientApi.search(query);
      set({ searchResults: res.data || [], isSearching: false });
    } catch (err: any) {
      set({ isSearching: false, error: err.message });
    }
  },

  verifyPatient: async (nationalId, dob, answer) => {
    const res  = await patientApi.verifyAnswer({ nationalId, dob, answer });
    const data = res.data || res;
    saveToken(data.token);
    set({
      accessToken:       data.token,
      facilitiesVisited: data.facilitiesVisited || [],
      currentPatient:    data.patient || null,
    });
    return data;
  },

  verifyByPin: async (nationalId, dob, pin) => {
    const res  = await patientApi.verifyPin({ nationalId, dob, pin });
    const data = res.data || res;
    saveToken(data.token);
    set({
      accessToken:       data.token,
      facilitiesVisited: data.facilitiesVisited || [],
      currentPatient:    data.patient || null,
    });
    return data;
  },

  loadPatient: async (nupi) => {
    // Hydrate token from sessionStorage if store lost it (e.g. hot reload)
    const storedToken = loadToken();
    const accessToken = get().accessToken || storedToken || '';
    if (storedToken && !get().accessToken) set({ accessToken: storedToken });

    // If a token exists the patient was verified via VerifyPanel which already
    // fetched full FHIR demographics via setPatientDemographics. getFederatedData
    // returns a thin blockchain record with all nulls — running it here would
    // overwrite the real demographics. Skip the network call entirely.
    if (accessToken) {
      set({ isLoadingPatient: false });
      return;
    }

    set({ isLoadingPatient: true, error: null });
    try {
      const res  = await patientApi.getFederatedData(nupi, '');
      const data = res.data;

      set({
        currentPatient:    data?.patient ?? get().currentPatient ?? null,
        encounters:        data?.encounters || data?.localEncounters || [],
        facilitiesVisited: data?.facilitiesVisited || get().facilitiesVisited,
        isLoadingPatient:  false,
      });
    } catch (err: any) {
      set({ isLoadingPatient: false, error: err.message });
    }
  },

  // ── Merge FHIR demographics into currentPatient ───────────────────
  // After this runs, isGhostRecord in PatientDetail evaluates to false
  // because dateOfBirth / nationalId / phoneNumber will be populated.
  setPatientDemographics: (nupi, patch) =>
    set((state) => {
      if (!state.currentPatient) {
        // No currentPatient yet — build a minimal object from the patch
        return {
          currentPatient: {
            id:          nupi,
            nupi,
            nationalId:  patch.nationalId  ?? '',
            firstName:   '',
            lastName:    '',
            middleName:  null,
            dateOfBirth: patch.dateOfBirth ?? '',
            gender:      patch.gender      ?? '',
            phoneNumber: patch.phoneNumber ?? null,
            email:       null,
            address:     patch.address     ?? null,
            bloodGroup:  patch.bloodGroup  ?? null,
            allergies:   null,
            active:      true,
            isFederatedRecord: true,
            ...patch,
          } as Patient,
        };
      }
      // Guard: only patch if this is still the same patient
      if (state.currentPatient.nupi !== nupi) return {};
      return { currentPatient: { ...state.currentPatient, ...patch } as Patient };
    }),

  // ── Replace encounters list ───────────────────────────────────────
  setEncounters: (encounters) => set({ encounters }),

  clearPatient: () => {
    clearToken();
    set({
      currentPatient:    null,
      encounters:        [],
      accessToken:       null,
      facilitiesVisited: [],
    });
  },

  clearError: () => set({ error: null }),
}));