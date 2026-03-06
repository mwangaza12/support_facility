import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePatientStore } from '@/stores/patient.store';
import {
  ArrowLeft, MapPin, Phone, Calendar, Activity,
  ClipboardList, Building2, Loader2, PlusCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const badge = (label: string, color: string) => (
  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
);

export const PatientDetail = () => {
  const { nupi }                                          = useParams<{ nupi: string }>();
  const navigate                                          = useNavigate();
  const { currentPatient, encounters, facilitiesVisited,
          isLoadingPatient, loadPatient }    = usePatientStore();

  useEffect(() => {
    if (nupi) loadPatient(nupi);
  }, [nupi]);

  if (isLoadingPatient) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={28} className="animate-spin text-teal-500" />
    </div>
  );

  if (!currentPatient) return (
    <div className="text-center py-20 text-slate-400">
      <p>Patient not found or access token expired.</p>
      <Button variant="link" onClick={() => navigate('/patients')}>Go back</Button>
    </div>
  );

  const p = currentPatient;
  const age = p.dateOfBirth
    ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / 3.156e10)
    : '—';

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
            <h1 className="text-2xl font-bold text-slate-800">
              {p.firstName} {p.middleName} {p.lastName}
            </h1>
            {badge(p.gender, 'bg-blue-50 text-blue-700')}
            {p.isFederatedRecord && badge('Federated', 'bg-violet-50 text-violet-700')}
            {badge(p.active ? 'Active' : 'Inactive', p.active ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700')}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono">{p.nupi}</p>
        </div>
        <Button
          className="bg-teal-600 hover:bg-teal-700 text-white gap-2 shrink-0"
          onClick={() => navigate(`/patients/${nupi}/encounter`)}>
          <PlusCircle size={15} /> Record Visit
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">

        {/* Demographics */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Demographics</h2>
            <div className="space-y-2 text-sm">
              <Row label="Age"        value={`${age} years`} />
              <Row label="DOB"        value={p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('en-KE') : '—'} />
              <Row label="National ID" value={p.nationalId || '—'} />
              <Row label="Blood Group" value={p.bloodGroup || '—'} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</h2>
            <div className="space-y-2 text-sm">
              {p.phoneNumber && (
                <div className="flex items-center gap-2 text-slate-700">
                  <Phone size={13} className="text-slate-400" />
                  {p.phoneNumber}
                </div>
              )}
              {p.address?.county && (
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin size={13} className="text-slate-400" />
                  {[p.address.village, p.address.subCounty, p.address.county].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* Facilities visited */}
          {facilitiesVisited.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                <Building2 size={13} /> Facilities Visited
              </h2>
              <ul className="space-y-2">
                {facilitiesVisited.map((f: any, i: number) => (
                  <li key={i} className="text-xs text-slate-700 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                    {f.name || f.facilityId}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Encounters */}
        <div className="md:col-span-2">
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
              <div className="py-12 text-center text-slate-400 text-sm">
                No encounters recorded yet.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {encounters.map((enc) => (
                  <li key={enc.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Activity size={13} className="text-teal-500 shrink-0" />
                          <span className="text-sm font-medium text-slate-800 capitalize">
                            {enc.encounterType}
                          </span>
                          {badge(
                            enc.source === 'local' ? 'Local' : enc.facilityName || 'Remote',
                            enc.source === 'local' ? 'bg-teal-50 text-teal-700' : 'bg-violet-50 text-violet-700'
                          )}
                        </div>
                        {enc.chiefComplaint && (
                          <p className="text-xs text-slate-600 ml-5">{enc.chiefComplaint}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 ml-5">
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar size={11} />
                            {new Date(enc.encounterDate).toLocaleDateString('en-KE', {
                              year: 'numeric', month: 'short', day: 'numeric'
                            })}
                          </span>
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