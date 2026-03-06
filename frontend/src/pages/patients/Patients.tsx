import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientStore } from '@/stores/patient.store';
import { patientApi } from '@/api/patient.api';
import { Search, UserPlus, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

let searchTimeout: ReturnType<typeof setTimeout>;

export const Patients = () => {
  const navigate = useNavigate();
  const { searchResults, isSearching, search, error, verifyPatient } = usePatientStore();

  // Verify flow
  const [verifyStep,    setVerifyStep]    = useState<'idle' | 'question' | 'answer'>('idle');
  const [nationalId,    setNationalId]    = useState('');
  const [dob,           setDob]           = useState('');
  const [question,      setQuestion]      = useState('');
  const [answer,        setAnswer]        = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError,   setVerifyError]   = useState('');

  // Debounced search
  const handleSearch = useCallback((q: string) => {
    clearTimeout(searchTimeout);
    if (!q.trim()) return;
    searchTimeout = setTimeout(() => search(q), 400);
  }, [search]);

  // Step 1 — get security question
  const handleGetQuestion = async () => {
    if (!nationalId || !dob) return;
    setVerifyLoading(true); setVerifyError('');
    try {
      const res = await patientApi.getSecurityQuestion(nationalId, dob);
      setQuestion(res.data?.question || res.question);
      setVerifyStep('answer');
    } catch (err: any) {
      setVerifyError(err.response?.data?.error || err.message);
    } finally { setVerifyLoading(false); }
  };

  // Step 2 — verify answer via store action (sets currentPatient + accessToken)
  const handleVerify = async () => {
    setVerifyLoading(true); setVerifyError('');
    try {
      // verifyPatient stores patient + token in the store
      // so PatientDetail will have currentPatient ready immediately
      const data = await verifyPatient(nationalId, dob, answer);
      navigate(`/patients/${data.nupi}`);
    } catch (err: any) {
      setVerifyError(err.response?.data?.error || err.message);
    } finally { setVerifyLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Patients</h1>
        <Button
          onClick={() => navigate('/patients/register')}
          className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
          <UserPlus size={16} /> Register Patient
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">

        {/* ── Search local patients ──────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-700 text-sm">Search Local Records</h2>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search by name, NUPI or National ID…"
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          {isSearching && (
            <div className="flex justify-center py-4">
              <Loader2 size={20} className="animate-spin text-teal-500" />
            </div>
          )}

          {searchResults.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {searchResults.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => navigate(`/patients/${p.nupi}`)}
                    className="w-full flex items-center justify-between py-3 px-1 hover:bg-slate-50 rounded-lg transition-colors text-left">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {p.firstName} {p.lastName}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{p.nupi}</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle size={13} /> {error}
            </p>
          )}
        </div>

        {/* ── Verify returning patient ───────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-700 text-sm">Verify Returning Patient</h2>
          <p className="text-xs text-slate-400">
            Enter the patient's National ID and date of birth to access their cross-facility records.
          </p>

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
                  ? <Loader2 size={15} className="animate-spin" />
                  : 'Get Security Question'}
              </Button>
            </div>
          )}

          {verifyStep === 'answer' && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <p className="text-xs text-slate-500 mb-1">Security Question</p>
                <p className="text-sm font-medium text-slate-800">{question}</p>
              </div>
              <Input
                placeholder="Your answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setVerifyStep('idle'); setVerifyError(''); }}>
                  Back
                </Button>
                <Button
                  className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleVerify}
                  disabled={verifyLoading || !answer}>
                  {verifyLoading
                    ? <Loader2 size={15} className="animate-spin" />
                    : 'Verify & Open Chart'}
                </Button>
              </div>
            </div>
          )}

          {verifyError && (
            <p className="text-xs text-red-500 flex items-center gap-1 mt-2">
              <AlertCircle size={13} /> {verifyError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};