import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientStore } from '@/stores/patient.store';
import { patientApi } from '@/api/patient.api';
import {
  Search, UserPlus, ChevronRight, Loader2, AlertCircle,
  PlusCircle, CheckCircle2, Users, FileText, RotateCcw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

let searchTimeout: ReturnType<typeof setTimeout>;

export const Patients = () => {
  const navigate = useNavigate();
  const { searchResults, isSearching, search, error, verifyPatient } = usePatientStore();

  // Local patients list
  const [allPatients,   setAllPatients]   = useState<any[]>([]);
  const [loadingList,   setLoadingList]   = useState(true);
  const [searchQuery,   setSearchQuery]   = useState('');

  // Verify flow
  const [verifyStep,    setVerifyStep]    = useState<'idle' | 'question' | 'verified'>('idle');
  const [nationalId,    setNationalId]    = useState('');
  const [dob,           setDob]           = useState('');
  const [question,      setQuestion]      = useState('');
  const [answer,        setAnswer]        = useState('');
  const [verifiedData,  setVerifiedData]  = useState<any>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError,   setVerifyError]   = useState('');

  // Load local patients on mount
  useEffect(() => {
    patientApi.getAll()
      .then(res => setAllPatients(res.data || []))
      .catch(() => setAllPatients([]))
      .finally(() => setLoadingList(false));
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    clearTimeout(searchTimeout);
    if (!q.trim()) return;
    searchTimeout = setTimeout(() => search(q), 400);
  }, [search]);

  const displayPatients = searchQuery.trim()
    ? searchResults
    : allPatients;

  // Step 1 — get security question
  const handleGetQuestion = async () => {
    if (!nationalId || !dob) return;
    setVerifyLoading(true); setVerifyError('');
    try {
      const res = await patientApi.getSecurityQuestion(nationalId, dob);
      setQuestion(res.data?.question || res.question);
      setVerifyStep('question');
    } catch (err: any) {
      setVerifyError(err.response?.data?.error || err.message);
    } finally { setVerifyLoading(false); }
  };

  // Step 2 — verify answer
  const handleVerify = async () => {
    setVerifyLoading(true); setVerifyError('');
    try {
      const data = await verifyPatient(nationalId, dob, answer);
      setVerifiedData(data);
      setVerifyStep('verified');
    } catch (err: any) {
      setVerifyError(err.response?.data?.error || err.message);
    } finally { setVerifyLoading(false); }
  };

  const resetVerify = () => {
    setVerifyStep('idle'); setVerifyError('');
    setNationalId(''); setDob(''); setAnswer('');
    setQuestion(''); setVerifiedData(null);
  };

  // Verified patient display name
  const verifiedName = verifiedData?.patient?.name
    || `${verifiedData?.patient?.firstName || ''} ${verifiedData?.patient?.lastName || ''}`.trim()
    || verifiedData?.nupi;

  const verifiedFacility = verifiedData?.facilitiesVisited?.[0]?.name
    || verifiedData?.patient?.facilityId
    || '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Patients</h1>
        <Button
          onClick={() => navigate('/patients/register')}
          className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
          <UserPlus size={16} /> Register New Patient
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">

        {/* ── Left: Patient list ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Users size={15} className="text-teal-500" />
            <h2 className="font-semibold text-slate-700 text-sm flex-1">Registered Patients</h2>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
              {allPatients.length}
            </span>
          </div>

          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9 text-sm"
                placeholder="Search by name, NUPI or National ID…"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
            {(loadingList || isSearching) ? (
              <div className="flex justify-center py-10">
                <Loader2 size={20} className="animate-spin text-teal-500" />
              </div>
            ) : displayPatients.length === 0 ? (
              <div className="py-10 text-center space-y-1">
                <Users size={28} className="mx-auto text-slate-200" />
                <p className="text-slate-400 text-sm">
                  {searchQuery ? 'No patients match your search.' : 'No patients registered yet.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {displayPatients.map((p: any) => (
                  <li key={p.id || p.nupi}>
                    <button
                      onClick={() => navigate(`/patients/${p.nupi}`)}
                      className="w-full flex items-center justify-between py-3 px-5 hover:bg-slate-50 transition-colors text-left group">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {p.firstName} {p.lastName}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono">{p.nupi}</p>
                      </div>
                      <ChevronRight size={15} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <div className="px-5 py-3 border-t border-slate-100">
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={13} /> {error}
              </p>
            </div>
          )}
        </div>

        {/* ── Right: Verify returning patient ───────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700 text-sm">Cross-Facility Lookup</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Verify a returning patient's identity to create an encounter.
            </p>
          </div>

          <div className="p-5 space-y-4">

            {/* Step: idle */}
            {verifyStep === 'idle' && (
              <div className="space-y-3">
                <Input
                  placeholder="National ID"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                />
                <Input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleGetQuestion}
                  disabled={verifyLoading || !nationalId || !dob}>
                  {verifyLoading
                    ? <><Loader2 size={14} className="animate-spin mr-2" /> Searching…</>
                    : 'Get Security Question'}
                </Button>
              </div>
            )}

            {/* Step: security question */}
            {verifyStep === 'question' && (
              <div className="space-y-3">
                <div className="bg-teal-50 border border-teal-100 rounded-lg px-4 py-3">
                  <p className="text-xs text-teal-600 font-medium mb-1">Security Question</p>
                  <p className="text-sm text-slate-800">{question}</p>
                </div>
                <Input
                  placeholder="Your answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !verifyLoading && answer && handleVerify()}
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={resetVerify}>
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
                    onClick={handleVerify}
                    disabled={verifyLoading || !answer}>
                    {verifyLoading
                      ? <><Loader2 size={14} className="animate-spin mr-2" /> Verifying…</>
                      : 'Verify Identity'}
                  </Button>
                </div>
              </div>
            )}

            {/* Step: verified */}
            {verifyStep === 'verified' && verifiedData && (
              <div className="space-y-4">
                {/* Identity confirmed badge */}
                <div className="flex items-center gap-2 text-teal-600">
                  <CheckCircle2 size={16} />
                  <span className="text-sm font-semibold">Identity Confirmed</span>
                </div>

                {/* Patient summary card */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-1.5">
                  <p className="text-base font-bold text-slate-800">{verifiedName}</p>
                  <p className="text-xs font-mono text-slate-400">{verifiedData.nupi}</p>
                  <p className="text-xs text-slate-500">
                    Registered at:{' '}
                    <span className="font-medium text-slate-700">{verifiedFacility}</span>
                  </p>
                  {verifiedData.facilitiesVisited?.length > 1 && (
                    <p className="text-xs text-slate-400">
                      {verifiedData.facilitiesVisited.length} facilities visited
                    </p>
                  )}
                </div>

                {/* Primary action: Create Encounter */}
                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2 h-11"
                  onClick={() => navigate(`/patients/${verifiedData.nupi}/encounter`)}>
                  <PlusCircle size={16} />
                  Create Encounter
                </Button>

                {/* Secondary action: View chart */}
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => navigate(`/patients/${verifiedData.nupi}`)}>
                  <FileText size={15} />
                  View Patient Chart
                </Button>

                {/* Reset */}
                <button
                  onClick={resetVerify}
                  className="w-full text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1.5 py-1 transition-colors">
                  <RotateCcw size={11} />
                  Look up another patient
                </button>
              </div>
            )}

            {verifyError && (
              <p className="text-xs text-red-500 flex items-center gap-1.5">
                <AlertCircle size={13} /> {verifyError}
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};