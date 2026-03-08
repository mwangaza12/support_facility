import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patientApi } from '@/api/patient.api';
import { ArrowLeft, Loader2, CheckCircle, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  "What is your mother's maiden name?",
  'What city were you born in?',
  'What was the name of your primary school?',
  'What is the name of your oldest sibling?',
];

type Gender = 'male' | 'female' | 'other' | 'unknown';

const empty = () => ({
  // Identity
  nationalId:  '',
  // Demographics
  firstName:   '',
  middleName:  '',
  lastName:    '',
  dateOfBirth: '',
  gender:      'unknown' as Gender,
  phoneNumber: '',
  email:       '',
  // Address
  county:      '',
  subCounty:   '',
  ward:        '',
  village:     '',
  // Security
  securityQuestion: SECURITY_QUESTIONS[0],
  securityAnswer:   '',
  pin:              '',
  pinConfirm:       '',
});

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</h2>
    {children}
  </div>
);

export const RegisterPatient = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(empty());
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    if (!form.nationalId)           return 'National ID is required';
    if (!form.firstName)            return 'First name is required';
    if (!form.lastName)             return 'Last name is required';
    if (!form.dateOfBirth)          return 'Date of birth is required';
    if (!form.phoneNumber)          return 'Phone number is required';
    if (!form.securityAnswer)       return 'Security answer is required';
    if (form.pin.length < 4)        return 'PIN must be at least 4 digits';
    if (form.pin !== form.pinConfirm) return 'PINs do not match';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }

    setIsLoading(true); setError('');
    try {
      await patientApi.create({
        nationalId:       form.nationalId,
        firstName:        form.firstName,
        middleName:       form.middleName || undefined,
        lastName:         form.lastName,
        dateOfBirth:      form.dateOfBirth,
        gender:           form.gender,
        phoneNumber:      form.phoneNumber || undefined,
        email:            form.email       || undefined,
        address: (form.county || form.subCounty || form.ward || form.village) ? {
          county:    form.county    || undefined,
          subCounty: form.subCounty || undefined,
          ward:      form.ward      || undefined,
          village:   form.village   || undefined,
        } : undefined,
        securityQuestion: form.securityQuestion,
        securityAnswer:   form.securityAnswer,
        pin:              form.pin,
      });
      setSuccess(true);
      setTimeout(() => navigate('/patients'), 1800);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <CheckCircle size={48} className="text-teal-500" />
      <p className="font-semibold text-slate-700">Patient registered on AfyaChain</p>
      <p className="text-sm text-slate-400">Redirecting to patients list…</p>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/patients')}
          className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Register New Patient</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Patient will be registered on the AfyaChain national index and assigned a NUPI.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Identity */}
      <Section title="National Identity">
        <div className="space-y-1.5">
          <Label>National ID / Passport <span className="text-red-500">*</span></Label>
          <Input
            placeholder="e.g. 12345678"
            value={form.nationalId}
            onChange={e => set('nationalId', e.target.value)}
          />
        </div>
      </Section>

      {/* Demographics */}
      <Section title="Demographics">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>First Name <span className="text-red-500">*</span></Label>
            <Input value={form.firstName} onChange={e => set('firstName', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Middle Name</Label>
            <Input value={form.middleName} onChange={e => set('middleName', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Last Name <span className="text-red-500">*</span></Label>
            <Input value={form.lastName} onChange={e => set('lastName', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Date of Birth <span className="text-red-500">*</span></Label>
            <Input
              type="date"
              value={form.dateOfBirth}
              onChange={e => set('dateOfBirth', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <select
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.gender}
              onChange={e => set('gender', e.target.value)}>
              {(['male', 'female', 'other', 'unknown'] as Gender[]).map(g => (
                <option key={g} value={g} className="capitalize">{g}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Phone Number <span className="text-red-500">*</span></Label>
            <Input
              type="tel"
              placeholder="e.g. +254712345678"
              value={form.phoneNumber}
              onChange={e => set('phoneNumber', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="optional"
              value={form.email}
              onChange={e => set('email', e.target.value)}
            />
          </div>
        </div>
      </Section>

      {/* Address */}
      <Section title="Address">
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'county',    label: 'County'     },
            { key: 'subCounty', label: 'Sub-County' },
            { key: 'ward',      label: 'Ward'       },
            { key: 'village',   label: 'Village'    },
          ].map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Input
                value={form[key as keyof typeof form]}
                onChange={e => set(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Security / AfyaChain identity */}
      <Section title="Security (AfyaChain Identity)">
        <p className="text-xs text-slate-400">
          The patient uses their security question and PIN to access their records at any facility.
        </p>

        <div className="space-y-1.5">
          <Label>Security Question <span className="text-red-500">*</span></Label>
          <select
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={form.securityQuestion}
            onChange={e => set('securityQuestion', e.target.value)}>
            {SECURITY_QUESTIONS.map(q => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Security Answer <span className="text-red-500">*</span></Label>
          <Input
            placeholder="Patient's answer"
            value={form.securityAnswer}
            onChange={e => set('securityAnswer', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>PIN (≥ 4 digits) <span className="text-red-500">*</span></Label>
            <Input
              type="password"
              placeholder="Patient's PIN"
              maxLength={8}
              value={form.pin}
              onChange={e => set('pin', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm PIN <span className="text-red-500">*</span></Label>
            <Input
              type="password"
              placeholder="Repeat PIN"
              maxLength={8}
              value={form.pinConfirm}
              onChange={e => set('pinConfirm', e.target.value)}
            />
          </div>
        </div>
      </Section>

      {/* Actions */}
      <div className="flex gap-3 pb-6">
        <Button variant="outline" className="flex-1" onClick={() => navigate('/patients')}>
          Cancel
        </Button>
        <Button
          className="flex-1 bg-teal-600 hover:bg-teal-700 text-white gap-2"
          onClick={handleSubmit}
          disabled={isLoading}>
          {isLoading ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
          {isLoading ? 'Registering…' : 'Register Patient'}
        </Button>
      </div>
    </div>
  );
};