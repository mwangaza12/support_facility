import { useAuthStore } from '@/stores/auth.store';
import { Activity, Users, ClipboardList, TrendingUp } from 'lucide-react';

const stats = [
  { label: 'Patients Today',    value: '—', icon: Users,          color: 'text-teal-600',  bg: 'bg-teal-50'  },
  { label: 'Encounters Today',  value: '—', icon: ClipboardList,  color: 'text-blue-600',  bg: 'bg-blue-50'  },
  { label: 'Active Encounters', value: '—', icon: Activity,       color: 'text-amber-600', bg: 'bg-amber-50' },
  { label: 'Chain Blocks',      value: '—', icon: TrendingUp,     color: 'text-violet-600',bg: 'bg-violet-50'},
];

export const Dashboard = () => {
  const { user } = useAuthStore();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Good morning, {user?.firstName} 👋
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          {new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon size={20} className={color} />
            </div>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Search Patient',   href: '/patients',  color: 'bg-teal-600 hover:bg-teal-700'   },
            { label: 'New Encounter',    href: '/patients',  color: 'bg-blue-600 hover:bg-blue-700'   },
            { label: 'View Records',     href: '/patients',  color: 'bg-slate-700 hover:bg-slate-800' },
          ].map(({ label, href, color }) => (
            <a
              key={label}
              href={href}
              className={`${color} text-white text-sm font-medium px-4 py-3 rounded-lg text-center transition-colors`}>
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* AfyaChain status */}
      <div className="bg-[#0a2540] rounded-xl p-5 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Activity size={18} className="text-teal-400" />
          <span className="font-semibold text-sm">AfyaChain Network</span>
          <span className="ml-auto text-xs bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full border border-teal-500/30">
            Live
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Connected to the HIE Gateway. Patient records are federated across all registered facilities.
          All encounters are immutably logged on AfyaChain.
        </p>
      </div>
    </div>
  );
};