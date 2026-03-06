import { useAuthStore } from '@/stores/auth.store';
import { Shield, Users, Activity, Building2, Key } from 'lucide-react';

export const AdminPanel = () => {
  const { user } = useAuthStore();

  const cards = [
    {
      icon: Users,
      label: 'Staff Management',
      desc:  'Add, manage and credential clinical staff',
      href:  '/staff',
      color: 'bg-teal-50 text-teal-600',
    },
    {
      icon: Activity,
      label: 'AfyaChain Monitor',
      desc:  'View blockchain activity and block history',
      href:  '#',
      color: 'bg-blue-50 text-blue-600',
    },
    {
      icon: Building2,
      label: 'Facility Profile',
      desc:  'Manage facility info and MoH registration',
      href:  '#',
      color: 'bg-amber-50 text-amber-600',
    },
    {
      icon: Key,
      label: 'API Credentials',
      desc:  'View facility API key and gateway config',
      href:  '#',
      color: 'bg-violet-50 text-violet-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0a2540] flex items-center justify-center">
          <Shield size={20} className="text-teal-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Admin Panel</h1>
          <p className="text-xs text-slate-400">
            {user?.facilityId} · Logged in as {user?.firstName} {user?.lastName}
          </p>
        </div>
      </div>

      {/* Facility info */}
      <div className="bg-[#0a2540] rounded-xl p-5 text-white grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Facility ID',   value: user?.facilityId || '—' },
          { label: 'Role',          value: 'Administrator'          },
          { label: 'Network',       value: 'AfyaLink HIE'           },
          { label: 'Status',        value: 'Active ✓'               },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-slate-400">{label}</p>
            <p className="text-sm font-semibold mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Action cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map(({ icon: Icon, label, desc, href, color }) => (
          <a
            key={label}
            href={href}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-teal-200 transition-all group">
            <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
              <Icon size={20} />
            </div>
            <h3 className="font-semibold text-slate-800 group-hover:text-teal-700 transition-colors">
              {label}
            </h3>
            <p className="text-xs text-slate-400 mt-1">{desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
};