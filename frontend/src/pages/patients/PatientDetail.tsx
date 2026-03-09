import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePatientStore } from '@/stores/patient.store';
import { useState } from 'react';
import { patientApi } from '@/api/patient.api';
import {
  ArrowLeft, MapPin, Phone, Calendar, Activity,
  ClipboardList, Building2, Loader2, PlusCircle, UserCircle,
  ShieldCheck, AlertCircle, Lock,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const badge = (label: string, color: string) => (
  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
);

export const PatientDetail = () => {
  const { nupi } = useParams<{ nupi: string }>();
  const navigate = useNavigate();
  const {
    currentPatient, encounters, facilitiesVisited,
    isLoadingPatient, loadPatient, accessToken, verifyPatient,
    setPatientDemographics, setEncounters, clearPatient,
  } = usePatientStore();

  const [verifyStep, setVerifyStep] = useState<'idle' | 'question' | 'done'>('idle');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifyNationalId, setVerifyNationalId] = useState('');
  const [verifyDob, setVerifyDob] = useState('');
  const [isLocalPatient, setIsLocalPatient] = useState(false);

  // FIX: Check if patient is local (has full demographics)
  const hasFullDemographics = currentPatient && (
    currentPatient.dateOfBirth ||
    currentPatient.phoneNumber ||
    currentPatient.nationalId
  );

  // FIX: Determine if this is a local patient (no token needed)
  const isGhostRecord = currentPatient?.isFederatedRecord && !hasFullDemographics;

  // FIX: Load patient data based on type
  useEffect(() => {
    if (!nupi) return;

    const loadPatientData = async () => {
      try {
        // First, try to get local patient (no token needed)
        const localPatient = await patientApi.getByNupi(nupi);
        
        if (localPatient && localPatient.id) {
          // This is a local patient! 🎉
          setIsLocalPatient(true);
          setPatientDemographics(nupi, localPatient);
          
          // Load local encounters
          const localEncounters = await patientApi.getLocalEncounters(nupi);
          if (localEncounters.length > 0) {
            setEncounters(localEncounters.map((enc: any) => ({
              ...enc,
              source: 'local',
            })));
          }
        } else {
          // Not a local patient, try federated (might need token)
          setIsLocalPatient(false);
          
          // Only call loadPatient if we don't have a current patient
          if (!currentPatient || currentPatient.nupi !== nupi) {
            await loadPatient(nupi);
          }
        }
      } catch (error) {
        console.error('Error loading patient:', error);
        // If local lookup fails, try federated as fallback
        if (!currentPatient || currentPatient.nupi !== nupi) {
          await loadPatient(nupi);
        }
      }
    };

    loadPatientData();

    // Cleanup when unmounting
    return () => {
      clearPatient();
    };
  }, [nupi]);

  const handleGetQuestion = async () => {
    if (!verifyNationalId || !verifyDob) return;
    setVerifyLoading(true); setVerifyError('');
    try {
      const res = await patientApi.getSecurityQuestion(verifyNationalId, verifyDob);
      setQuestion(res.data?.question || res.question);
      setVerifyStep('question');
    } catch (err: any) {
      setVerifyError(err.response?.data?.error || err.message);
    } finally { setVerifyLoading(false); }
  };

  const handleVerify = async () => {
    setVerifyLoading(true); setVerifyError('');
    try {
      const verifyResult = await verifyPatient(verifyNationalId, verifyDob, answer);
      
      const token = verifyResult.token || verifyResult.access_token;
      const meta = verifyResult.patient || {};
      const registeredFacilityId = meta?.registeredFacilityId;

      if (!token || !nupi) {
        setVerifyError('Verification succeeded but no access token returned');
        return;
      }

      // Fetch FHIR demographics
      const fhirRes = await patientApi.getFhirPatient(nupi, token, registeredFacilityId);

      if (fhirRes?.data) {
        const fhir = fhirRes.data;
        const demographics = {
          nupi: nupi,
          name: fhir.name?.[0]
            ? [fhir.name[0].given?.join(' '), fhir.name[0].family].filter(Boolean).join(' ')
            : meta?.name || '',
          firstName: fhir.name?.[0]?.given?.join(' ') || meta?.name?.split(' ')[0] || '',
          lastName: fhir.name?.[0]?.family || meta?.name?.split(' ').slice(-1)[0] || '',
          dateOfBirth: fhir.birthDate || '',
          gender: fhir.gender || '',
          nationalId: fhir.identifier?.find((id: any) =>
            id.system?.includes('national') || id.type?.text?.toLowerCase().includes('national')
          )?.value || fhir.identifier?.[0]?.value || '',
          phoneNumber: fhir.telecom?.find((t: any) => t.system === 'phone')?.value || '',
          address: {
            county: fhir.address?.[0]?.district || '',
            subCounty: fhir.address?.[0]?.city || '',
            village: fhir.address?.[0]?.line?.[0] || '',
          },
          bloodGroup: fhir.extension?.find((e: any) =>
            e.url?.includes('bloodGroup') || e.url?.includes('blood-group')
          )?.valueString || '',
          registeredFacility: meta?.registeredFacility || '',
          registeredFacilityId: meta?.registeredFacilityId || '',
          facilityCounty: meta?.facilityCounty || '',
          isCurrentFacility: meta?.isCurrentFacility || false,
          isFederatedRecord: true,
        };

        setPatientDemographics(nupi, demographics);
      }

      // Fetch encounters
      try {
        const encRes = await patientApi.getFhirEncounters(nupi, token, registeredFacilityId);
        
        if (encRes?.data) {
          const bundle = encRes.data;
          const entries = bundle.entry || [];
          
          const crossFacilityEncounters = entries
            .map((e: any) => e.resource)
            .filter((r: any) => r?.resourceType === 'Encounter')
            .map((enc: any) => ({
              id: enc.id,
              encounterId: enc.id,
              encounterType: enc.class?.display || enc.type?.[0]?.text || 'outpatient',
              encounterDate: enc.period?.start || enc.meta?.lastUpdated || '',
              chiefComplaint: enc.reasonCode?.[0]?.text || enc.reasonReference?.[0]?.display || '',
              practitionerName: enc.participant?.[0]?.individual?.display || '',
              status: enc.status || '',
              source: 'federated',
              facilityName: enc.meta?.sourceName || meta?.registeredFacility || '',
              facilityId: enc.meta?.source || registeredFacilityId || '',
            }));

          if (crossFacilityEncounters.length > 0) {
            setEncounters(crossFacilityEncounters);
          }
        }
      } catch (encErr) {
        console.warn('Could not fetch encounters:', encErr);
      }

      setVerifyStep('done');
      
      // Reload to refresh UI
      setTimeout(() => window.location.reload(), 500);

    } catch (err: any) {
      setVerifyError(err.response?.data?.error || err.message);
    } finally { setVerifyLoading(false); }
  };

  // Loading state
  if (isLoadingPatient && !currentPatient) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={28} className="animate-spin text-teal-500" />
    </div>
  );

  // No patient state
  if (!currentPatient) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
      <UserCircle size={48} className="opacity-30" />
      <p className="text-sm">Patient not found.</p>
      <Button variant="link" onClick={() => navigate('/patients')}>Go back</Button>
    </div>
  );

  const p = currentPatient as any;

  const fullName = p.firstName
    ? `${p.firstName} ${p.middleName ?? ''} ${p.lastName}`.trim()
    : p.name || p.nupi;

  const dob = p.dateOfBirth ? new Date(p.dateOfBirth) : null;
  const dobValid = dob && dob.getFullYear() > 1900;
  const age = dobValid ? Math.floor((Date.now() - dob!.getTime()) / 3.156e10) : null;
  const isActive = p.active !== false;

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/patients')}
          className="mt-1 p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-800">{fullName}</h1>
            {p.gender && badge(p.gender, 'bg-blue-50 text-blue-700')}
            {p.isFederatedRecord && badge('Federated', 'bg-violet-50 text-violet-700')}
            {!p.isFederatedRecord && badge('Local', 'bg-teal-50 text-teal-700')}
            {badge(
              isActive ? 'Active' : 'Inactive',
              isActive ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700'
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono">{p.nupi}</p>
        </div>

        {/* FIX: Only show verify button for ghost records */}
        {isGhostRecord ? (
          <Button
            className="bg-amber-500 hover:bg-amber-600 text-white gap-2 shrink-0"
            onClick={() => {
              setVerifyStep('idle');
              document.getElementById('verify-section')?.scrollIntoView({ behavior: 'smooth' });
            }}>
            <Lock size={14} /> Verify Identity
          </Button>
        ) : (
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white gap-2 shrink-0"
            onClick={() => navigate(`/patients/${nupi}/encounter`)}>
            <PlusCircle size={15} /> Create Encounter
          </Button>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">

        {/* Demographics */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Demographics
            </h2>

            {isGhostRecord ? (
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-700 space-y-1">
                <p className="font-medium">Demographics unavailable</p>
                <p className="text-amber-600 leading-relaxed">
                  This patient's full record is held at their registered facility.
                  Verify their identity to load demographics.
                </p>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <Row label="Age" value={age !== null ? `${age} years` : '—'} />
                <Row label="DOB" value={dobValid ? dob!.toLocaleDateString('en-KE') : '—'} />
                <Row label="National ID" value={p.nationalId || '—'} />
                <Row label="Blood Group" value={p.bloodGroup || '—'} />
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Contact
            </h2>
            <div className="space-y-2 text-sm">
              {p.phoneNumber ? (
                <div className="flex items-center gap-2 text-slate-700">
                  <Phone size={13} className="text-slate-400" />
                  {p.phoneNumber}
                </div>
              ) : (
                <p className="text-slate-400 text-xs">
                  {isGhostRecord ? 'Verify identity to view contact' : 'No contact info'}
                </p>
              )}
              {p.address?.county && (
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin size={13} className="text-slate-400" />
                  {[p.address.village, p.address.subCounty, p.address.county]
                    .filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* Facilities visited - only show for federated patients */}
          {facilitiesVisited.length > 0 && p.isFederatedRecord && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                <Building2 size={13} /> Facilities Visited
              </h2>
              <ul className="space-y-2">
                {facilitiesVisited.map((f: any, i: number) => (
                  <li key={i} className="text-xs text-slate-700 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                    {f.name || f.facilityId}
                    {f.county && <span className="text-slate-400">· {f.county}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Verify identity section - ONLY show for ghost records */}
        {isGhostRecord && (
          <div id="verify-section" className="md:col-span-2">
            <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-700">Verify Patient Identity</h2>
              </div>
              <p className="text-xs text-slate-500">
                This patient is registered at another facility. Verify their identity to access full records and create an encounter.
              </p>

              {verifyStep === 'idle' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">National ID</label>
                      <Input 
                        placeholder="National ID" 
                        value={verifyNationalId} 
                        onChange={e => setVerifyNationalId(e.target.value)} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">Date of Birth</label>
                      <Input 
                        type="date" 
                        value={verifyDob} 
                        onChange={e => setVerifyDob(e.target.value)} 
                      />
                    </div>
                  </div>
                  <Button 
                    className="bg-amber-500 hover:bg-amber-600 text-white w-full"
                    onClick={handleGetQuestion} 
                    disabled={verifyLoading || !verifyNationalId || !verifyDob}>
                    {verifyLoading && <Loader2 size={14} className="animate-spin mr-2" />}
                    Get Security Question
                  </Button>
                </div>
              )}

              {verifyStep === 'question' && (
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                    <p className="text-xs font-medium text-amber-600 mb-1">Security Question</p>
                    <p className="text-sm text-slate-800">{question}</p>
                  </div>
                  <Input 
                    placeholder="Answer" 
                    value={answer} 
                    onChange={e => setAnswer(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !verifyLoading && answer && handleVerify()} 
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1"
                      onClick={() => { setVerifyStep('idle'); setVerifyError(''); }}>
                      Back
                    </Button>
                    <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={handleVerify} disabled={verifyLoading || !answer}>
                      {verifyLoading && <Loader2 size={14} className="animate-spin mr-2" />}
                      Confirm Identity
                    </Button>
                  </div>
                </div>
              )}

              {verifyStep === 'done' && (
                <div className="bg-teal-50 border border-teal-100 rounded-lg px-4 py-3">
                  <p className="text-sm text-teal-700 flex items-center gap-2">
                    <ShieldCheck size={16} />
                    ✓ Identity verified! Demographics loaded successfully.
                  </p>
                </div>
              )}

              {verifyError && (
                <p className="text-xs text-red-500 flex items-center gap-1.5">
                  <AlertCircle size={12} /> {verifyError}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Encounters */}
        <div className={isGhostRecord ? 'md:col-span-3' : 'md:col-span-2'}>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                <ClipboardList size={15} className="text-teal-500" />
                Encounter History
                <span className="ml-1 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  {encounters.length}
                </span>
              </h2>
            </div>

            {encounters.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <ClipboardList size={32} className="mx-auto text-slate-200" />
                <p className="text-slate-400 text-sm">
                  {isGhostRecord
                    ? 'Verify patient identity to load encounter history.'
                    : 'No encounters recorded yet.'}
                </p>
                {!isGhostRecord && (
                  <button
                    onClick={() => navigate(`/patients/${nupi}/encounter`)}
                    className="text-xs text-teal-600 hover:text-teal-700 underline">
                    Record first visit
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {encounters.map((enc: any) => (
                  <li key={enc.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Activity size={13} className="text-teal-500 shrink-0" />
                          <span className="text-sm font-medium text-slate-800 capitalize">
                            {enc.encounterType}
                          </span>
                          {badge(
                            enc.source === 'local' ? 'This Facility' : enc.facilityName || 'Remote',
                            enc.source === 'local' ? 'bg-teal-50 text-teal-700' : 'bg-violet-50 text-violet-700'
                          )}
                          {enc.status && badge(enc.status, 'bg-slate-50 text-slate-500')}
                        </div>

                        {enc.chiefComplaint && (
                          <p className="text-xs text-slate-600 ml-5">{enc.chiefComplaint}</p>
                        )}

                        <div className="flex items-center gap-3 mt-1 ml-5 flex-wrap">
                          {enc.encounterDate && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Calendar size={11} />
                              {new Date(enc.encounterDate).toLocaleDateString('en-KE', {
                                year: 'numeric', month: 'short', day: 'numeric',
                              })}
                            </span>
                          )}
                          {enc.practitionerName && (
                            <span className="text-xs text-slate-400">{enc.practitionerName}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-2">
    <span className="text-slate-400">{label}</span>
    <span className="text-slate-800 font-medium text-right">{value}</span>
  </div>
);