import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePatientStore } from '@/stores/patient.store';
import { patientApi } from '@/api/patient.api';
import { useAuthStore } from '@/stores/auth.store';
import { ArrowLeft, Plus, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const ENCOUNTER_TYPES = ['outpatient', 'inpatient', 'emergency', 'check-in', 'referral', 'virtual'];

export const RecordEncounter = () => {
  const { nupi }     = useParams<{ nupi: string }>();
  const navigate     = useNavigate();
  const { accessToken, currentPatient } = usePatientStore();
  const { user }     = useAuthStore();

  const [isLoading, setIsLoading] = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState('');

  const [form, setForm] = useState({
    encounterType:    'outpatient',
    chiefComplaint:   '',
    practitionerName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    notes:            '',
  });

  const [vitals, setVitals] = useState({
    temperature: '', bloodPressure: '', heartRate: '',
    respiratoryRate: '', oxygenSaturation: '', weight: '', height: '',
  });

  const [diagnoses,  setDiagnoses]  = useState([{ code: '', description: '', severity: 'mild' }]);
  const [medications,setMedications]= useState([{ name: '', dosage: '', frequency: '', duration: '' }]);

  const update  = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const updateV = (k: string, v: string) => setVitals(f => ({ ...f, [k]: v }));

  const addDx  = () => setDiagnoses(d => [...d, { code: '', description: '', severity: 'mild' }]);
  const remDx  = (i: number) => setDiagnoses(d => d.filter((_, j) => j !== i));
  const updateDx = (i: number, k: string, v: string) =>
    setDiagnoses(d => d.map((dx, j) => j === i ? { ...dx, [k]: v } : dx));

  const addMed   = () => setMedications(m => [...m, { name: '', dosage: '', frequency: '', duration: '' }]);
  const remMed   = (i: number) => setMedications(m => m.filter((_, j) => j !== i));
  const updateMed = (i: number, k: string, v: string) =>
    setMedications(m => m.map((med, j) => j === i ? { ...med, [k]: v } : med));

  const handleSubmit = async () => {
    if (!form.chiefComplaint) return setError('Chief complaint is required');
    setIsLoading(true); setError('');
    try {
      const cleanVitals = Object.fromEntries(
        Object.entries(vitals).filter(([, v]) => v !== '')
      );
      await patientApi.recordVisit(nupi!, accessToken || '', {
        ...form,
        vitalSigns:  Object.keys(cleanVitals).length ? cleanVitals : undefined,
        diagnoses:   diagnoses.filter(d => d.description),
        medications: medications.filter(m => m.name),
      });
      setSuccess(true);
      setTimeout(() => navigate(`/patients/${nupi}`), 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally { setIsLoading(false); }
  };

  if (success) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <CheckCircle size={48} className="text-teal-500" />
      <p className="font-semibold text-slate-700">Visit recorded successfully</p>
      <p className="text-sm text-slate-400">Redirecting to patient chart…</p>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/patients/${nupi}`)}
          className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Record Visit</h1>
          {currentPatient && (
            <p className="text-xs text-slate-400 mt-0.5">
              {currentPatient.firstName} {currentPatient.lastName} · {nupi}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Encounter basics */}
      <Section title="Encounter Details">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Encounter Type</Label>
            <select
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.encounterType}
              onChange={e => update('encounterType', e.target.value)}>
              {ENCOUNTER_TYPES.map(t => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Practitioner</Label>
            <Input value={form.practitionerName} onChange={e => update('practitionerName', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Chief Complaint <span className="text-red-500">*</span></Label>
          <Input
            placeholder="e.g. Patient presents with persistent headache and fever for 3 days"
            value={form.chiefComplaint}
            onChange={e => update('chiefComplaint', e.target.value)}
          />
        </div>
      </Section>

      {/* Vital signs */}
      <Section title="Vital Signs">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { key: 'temperature',      label: 'Temperature (°C)' },
            { key: 'bloodPressure',    label: 'Blood Pressure'   },
            { key: 'heartRate',        label: 'Heart Rate (bpm)' },
            { key: 'respiratoryRate',  label: 'Resp. Rate'       },
            { key: 'oxygenSaturation', label: 'SpO2 (%)'         },
            { key: 'weight',           label: 'Weight (kg)'      },
          ].map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs">{label}</Label>
              <Input
                placeholder="—"
                value={vitals[key as keyof typeof vitals]}
                onChange={e => updateV(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Diagnoses */}
      <Section title="Diagnoses">
        {diagnoses.map((dx, i) => (
          <div key={i} className="flex gap-2 items-start">
            <Input className="w-24 shrink-0" placeholder="ICD-10" value={dx.code}
              onChange={e => updateDx(i, 'code', e.target.value)} />
            <Input className="flex-1" placeholder="Description" value={dx.description}
              onChange={e => updateDx(i, 'description', e.target.value)} />
            <select
              className="border border-slate-200 rounded-md px-2 py-2 text-sm bg-white"
              value={dx.severity}
              onChange={e => updateDx(i, 'severity', e.target.value)}>
              {['mild','moderate','severe'].map(s => <option key={s}>{s}</option>)}
            </select>
            {diagnoses.length > 1 && (
              <button onClick={() => remDx(i)} className="p-2 text-red-400 hover:text-red-600">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        <button onClick={addDx} className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1 mt-1">
          <Plus size={13} /> Add Diagnosis
        </button>
      </Section>

      {/* Medications */}
      <Section title="Medications">
        {medications.map((med, i) => (
          <div key={i} className="grid grid-cols-4 gap-2 items-start">
            <Input placeholder="Name"      value={med.name}      onChange={e => updateMed(i, 'name', e.target.value)} />
            <Input placeholder="Dosage"    value={med.dosage}    onChange={e => updateMed(i, 'dosage', e.target.value)} />
            <Input placeholder="Frequency" value={med.frequency} onChange={e => updateMed(i, 'frequency', e.target.value)} />
            <div className="flex gap-2">
              <Input placeholder="Duration" value={med.duration} onChange={e => updateMed(i, 'duration', e.target.value)} />
              {medications.length > 1 && (
                <button onClick={() => remMed(i)} className="p-2 text-red-400 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        <button onClick={addMed} className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1 mt-1">
          <Plus size={13} /> Add Medication
        </button>
      </Section>

      {/* Notes */}
      <Section title="Clinical Notes">
        <textarea
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
          rows={4}
          placeholder="Clinical observations, advice given, follow-up instructions…"
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
        />
      </Section>

      <div className="flex gap-3 pb-6">
        <Button variant="outline" className="flex-1" onClick={() => navigate(`/patients/${nupi}`)}>
          Cancel
        </Button>
        <Button
          className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
          onClick={handleSubmit}
          disabled={isLoading}>
          {isLoading ? <Loader2 size={15} className="animate-spin mr-2" /> : null}
          {isLoading ? 'Saving…' : 'Save Encounter'}
        </Button>
      </div>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</h2>
    {children}
  </div>
);