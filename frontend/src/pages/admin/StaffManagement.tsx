import { useState } from 'react';
import { staffApi } from '@/api/patient.api';
import { UserPlus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type UserRole = 'doctor' | 'nurse' | 'receptionist' | 'admin' | 'pharmacist' | 'lab_technician';

const ROLES: UserRole[] = ['doctor', 'nurse', 'receptionist', 'admin', 'pharmacist', 'lab_technician'];

const empty = () => ({
  firstName: '', lastName: '', email: '',
  password: '', role: 'doctor' as UserRole, department: '',
});

export const StaffManagement = () => {
  const [form,      setForm]      = useState(empty());
  const [isLoading, setIsLoading] = useState(false);
  const [success,   setSuccess]   = useState('');
  const [error,     setError]     = useState('');

  const update = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    const { firstName, lastName, email, password, role } = form;
    if (!firstName || !lastName || !email || !password || !role)
      return setError('All fields except department are required');

    setIsLoading(true); setError(''); setSuccess('');
    try {
      await staffApi.addStaff(form);
      setSuccess(`${firstName} ${lastName} added successfully`);
      setForm(empty());
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally { setIsLoading(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Staff Management</h1>
        <p className="text-sm text-slate-400 mt-1">
          Add clinical staff. They will be credentialed on AfyaChain automatically.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <UserPlus size={18} className="text-teal-600" />
          <h2 className="font-semibold text-slate-700">Add Staff Member</h2>
        </div>

        {success && (
          <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 text-teal-700 px-4 py-3 rounded-lg text-sm">
            <CheckCircle size={15} /> {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>First Name <span className="text-red-500">*</span></Label>
            <Input value={form.firstName} onChange={e => update('firstName', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Last Name <span className="text-red-500">*</span></Label>
            <Input value={form.lastName} onChange={e => update('lastName', e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Email <span className="text-red-500">*</span></Label>
          <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Temporary Password <span className="text-red-500">*</span></Label>
          <Input type="password" value={form.password} onChange={e => update('password', e.target.value)}
            placeholder="They can change this after first login" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Role <span className="text-red-500">*</span></Label>
            <select
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 capitalize"
              value={form.role}
              onChange={e => update('role', e.target.value)}>
              {ROLES.map(r => (
                <option key={r} value={r} className="capitalize">
                  {r.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Input
              placeholder="e.g. Cardiology"
              value={form.department}
              onChange={e => update('department', e.target.value)}
            />
          </div>
        </div>

        <Button
          className="w-full bg-teal-600 hover:bg-teal-700 text-white"
          onClick={handleSubmit}
          disabled={isLoading}>
          {isLoading ? <Loader2 size={15} className="animate-spin mr-2" /> : <UserPlus size={15} className="mr-2" />}
          {isLoading ? 'Adding Staff…' : 'Add Staff Member'}
        </Button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
        <strong>Note:</strong> New staff will receive an email with their credentials.
        Advise them to change their password on first login. Their credentials are logged on AfyaChain for audit purposes.
      </div>
    </div>
  );
};