import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientStore } from '@/stores/patient.store';
import { patientApi } from '@/api/patient.api';
import {
  Search, UserPlus, ChevronRight, Loader2, AlertCircle,
  PlusCircle, CheckCircle2, RotateCcw, FileText,
  Calendar, Phone, User2, X, ScanFace,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

let searchTimeout: ReturnType<typeof setTimeout>;

// ── Verify Slide-in Panel ─────────────────────────────────────────
const VerifyPanel = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const { verifyPatient } = usePatientStore();

  const [step,         setStep]         = useState<'idle' | 'question' | 'verified'>('idle');
  const [nationalId,   setNationalId]   = useState('');
  const [dob,          setDob]          = useState('');
  const [question,     setQuestion]     = useState('');
  const [answer,       setAnswer]       = useState('');
  const [verifiedData, setVerifiedData] = useState<any>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  const handleGetQuestion = async () => {
    if (!nationalId || !dob) return;
    setLoading(true); setError('');
    try {
      const res = await patientApi.getSecurityQuestion(nationalId, dob);
      setQuestion(res.data?.question || res.question);
      setStep('question');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally { setLoading(false); }
  };

  const handleVerify = async () => {
    setLoading(true); setError('');
    try {
      const data = await verifyPatient(nationalId, dob, answer);
      setVerifiedData(data);
      setStep('verified');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally { setLoading(false); }
  };

  const reset = () => {
    setStep('idle'); setError('');
    setNationalId(''); setDob(''); setAnswer('');
    setQuestion(''); setVerifiedData(null);
  };

  const patientName = verifiedData?.patient?.name
    || `${verifiedData?.patient?.firstName || ''} ${verifiedData?.patient?.lastName || ''}`.trim()
    || verifiedData?.nupi;

  const facility = verifiedData?.facilitiesVisited?.[0]?.name
    || verifiedData?.patient?.facilityId || '—';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-sm bg-white shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ScanFace size={18} className="text-teal-500" />
            <h2 className="font-semibold text-slate-800">Cross-Facility Lookup</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-xs text-slate-400">
            Verify a returning patient's identity to access their cross-facility records and create an encounter.
          </p>

          {/* Step: idle */}
          {step === 'idle' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">National ID</label>
                <Input placeholder="e.g. 12345678" value={nationalId}
                  onChange={e => setNationalId(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Date of Birth</label>
                <Input type="date" value={dob} onChange={e => setDob(e.target.value)} />
              </div>
              <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white mt-1"
                onClick={handleGetQuestion} disabled={loading || !nationalId || !dob}>
                {loading ? <><Loader2 size={14} className="animate-spin mr-2" />Searching…</> : 'Get Security Question'}
              </Button>
            </div>
          )}

          {/* Step: question */}
          {step === 'question' && (
            <div className="space-y-3">
              <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3">
                <p className="text-xs font-medium text-teal-600 mb-1">Security Question</p>
                <p className="text-sm text-slate-800">{question}</p>
              </div>
              <Input placeholder="Your answer" value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && answer && handleVerify()} />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={reset}>Back</Button>
                <Button className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleVerify} disabled={loading || !answer}>
                  {loading ? <><Loader2 size={14} className="animate-spin mr-2" />Verifying…</> : 'Verify'}
                </Button>
              </div>
            </div>
          )}

          {/* Step: verified */}
          {step === 'verified' && verifiedData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-teal-600">
                <CheckCircle2 size={16} />
                <span className="text-sm font-semibold">Identity Confirmed</span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <p className="font-bold text-slate-800">{patientName}</p>
                <p className="text-xs font-mono text-slate-400">{verifiedData.nupi}</p>
                <p className="text-xs text-slate-500">
                  Registered at: <span className="font-medium text-slate-700">{facility}</span>
                </p>
              </div>

              <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2 h-11"
                onClick={() => navigate(`/patients/${verifiedData.nupi}/encounter`)}>
                <PlusCircle size={15} /> Create Encounter
              </Button>

              <Button variant="outline" className="w-full gap-2"
                onClick={() => navigate(`/patients/${verifiedData.nupi}`)}>
                <FileText size={15} /> View Patient Chart
              </Button>

              <button onClick={reset}
                className="w-full text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1.5 py-1">
                <RotateCcw size={11} /> Look up another patient
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1.5 mt-1">
              <AlertCircle size={13} /> {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────
export const Patients = () => {
  const navigate = useNavigate();
  const { searchResults, isSearching, search, error } = usePatientStore();

  const [allPatients,  setAllPatients]  = useState<any[]>([]);
  const [loadingList,  setLoadingList]  = useState(true);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [showVerify,   setShowVerify]   = useState(false);

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

  const displayList = searchQuery.trim() ? searchResults : allPatients;

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Patients</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {loadingList ? 'Loading…' : `${allPatients.length} patient${allPatients.length !== 1 ? 's' : ''} registered at this facility`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 text-teal-700 border-teal-200 hover:bg-teal-50"
            onClick={() => setShowVerify(true)}>
            <ScanFace size={15} /> Cross-Facility Lookup
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
            onClick={() => navigate('/patients/register')}>
            <UserPlus size={15} /> Register Patient
          </Button>
        </div>
      </div>

      {/* ── Search bar ──────────────────────────────────────────── */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-11 h-11 text-sm bg-white border-slate-200"
          placeholder="Search by name, NUPI or National ID…"
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
        />
        {isSearching && (
          <Loader2 size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-teal-500 animate-spin" />
        )}
      </div>

      {/* ── Patient table ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Table header */}
        <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <div className="col-span-4">Patient</div>
          <div className="col-span-3">NUPI</div>
          <div className="col-span-2">Date of Birth</div>
          <div className="col-span-2">Contact</div>
          <div className="col-span-1"></div>
        </div>

        {/* Rows */}
        {loadingList ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-teal-500" />
          </div>
        ) : displayList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <User2 size={36} className="opacity-30" />
            <p className="text-sm">
              {searchQuery ? 'No patients match your search.' : 'No patients registered yet.'}
            </p>
            {!searchQuery && (
              <Button variant="outline" className="text-xs mt-1" onClick={() => navigate('/patients/register')}>
                <UserPlus size={13} className="mr-1.5" /> Register first patient
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {displayList.map((p: any) => (
              <li key={p.id || p.nupi}>
                <button
                  onClick={() => navigate(`/patients/${p.nupi}`)}
                  className="w-full grid grid-cols-12 px-5 py-4 hover:bg-slate-50 transition-colors text-left group items-center">

                  {/* Name + gender badge */}
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-teal-700">
                        {(p.firstName?.[0] || '?')}{(p.lastName?.[0] || '')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {p.firstName} {p.lastName}
                      </p>
                      {p.gender && (
                        <span className="text-xs text-slate-400 capitalize">{p.gender}</span>
                      )}
                    </div>
                  </div>

                  {/* NUPI */}
                  <div className="col-span-3">
                    <p className="text-xs font-mono text-slate-500 truncate">{p.nupi}</p>
                  </div>

                  {/* DOB */}
                  <div className="col-span-2 flex items-center gap-1.5 text-xs text-slate-500">
                    {p.dateOfBirth ? (
                      <>
                        <Calendar size={12} className="text-slate-300 shrink-0" />
                        {new Date(p.dateOfBirth).toLocaleDateString('en-KE', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </>
                    ) : '—'}
                  </div>

                  {/* Phone */}
                  <div className="col-span-2 flex items-center gap-1.5 text-xs text-slate-500">
                    {p.phoneNumber ? (
                      <>
                        <Phone size={12} className="text-slate-300 shrink-0" />
                        {p.phoneNumber}
                      </>
                    ) : '—'}
                  </div>

                  {/* Arrow */}
                  <div className="col-span-1 flex justify-end">
                    <ChevronRight size={15} className="text-slate-300 group-hover:text-teal-500 transition-colors" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1.5">
          <AlertCircle size={13} /> {error}
        </p>
      )}

      {/* Cross-facility verify slide-in */}
      {showVerify && <VerifyPanel onClose={() => setShowVerify(false)} />}
    </div>
  );
};