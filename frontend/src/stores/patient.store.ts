import { create } from 'zustand';
import { patientApi } from '../api/patient.api';

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
}

export interface Encounter {
  id:              string;
  patientNupi:     string;
  encounterDate:   string;
  encounterType:   string;
  chiefComplaint:  string | null;
  practitionerName:string;
  vitalSigns:      any | null;
  diagnoses:       any[];
  medications:     any[] | null;
  notes:           string | null;
  facilityId:      string;
  facilityName?:   string;
  source:          'local' | 'gateway';
  status:          string;
}

interface PatientState {
  // Search
  searchResults:  Patient[];
  searchQuery:    string;
  isSearching:    boolean;

  // Current patient
  currentPatient:    Patient | null;
  encounters:        Encounter[];
  accessToken:       string | null;   // patient's verified token
  facilitiesVisited: any[];
  isLoadingPatient:  boolean;

  // UI
  error: string | null;

  // Actions
  search:         (query: string) => Promise<void>;
  verifyPatient:  (nationalId: string, dob: string, answer: string) => Promise<any>;
  verifyByPin:    (nationalId: string, dob: string, pin: string) => Promise<any>;
  loadPatient:    (nupi: string) => Promise<void>;
  clearPatient:   () => void;
  clearError:     () => void;
}

export const usePatientStore = create<PatientState>((set, get) => ({
  searchResults:     [],
  searchQuery:       '',
  isSearching:       false,
  currentPatient:    null,
  encounters:        [],
  accessToken:       null,
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
    const res = await patientApi.verifyAnswer({ nationalId, dob, answer });
    const data = res.data;
    set({ accessToken: data.token, facilitiesVisited: data.facilitiesVisited || [] });
    return data;
  },

  verifyByPin: async (nationalId, dob, pin) => {
    const res = await patientApi.verifyPin({ nationalId, dob, pin });
    const data = res.data;
    set({ accessToken: data.token, facilitiesVisited: data.facilitiesVisited || [] });
    return data;
  },

  loadPatient: async (nupi) => {
    const { accessToken } = get();
    set({ isLoadingPatient: true, error: null });
    try {
      const res = await patientApi.getFederatedData(nupi, accessToken || '');
      set({
        currentPatient:    res.data?.patient  || null,
        encounters:        res.data?.encounters || [],
        facilitiesVisited: res.data?.facilitiesVisited || [],
        isLoadingPatient:  false,
      });
    } catch (err: any) {
      set({ isLoadingPatient: false, error: err.message });
    }
  },

  clearPatient: () => set({
    currentPatient: null, encounters: [], accessToken: null, facilitiesVisited: [],
  }),

  clearError: () => set({ error: null }),
}));