import { useEffect, useState } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useAuthStore }        from '@/stores/auth.store';
import { apiClient }           from '@/api/auth.api';
import {
  Users, ClipboardList, Activity, ArrowRightLeft,
  UserPlus, PlusCircle, ChevronRight, Loader2,
  ScanFace, AlertCircle, RefreshCw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────
interface Stats {
  totalPatients:    number;
  todayEncounters:  number;
  activeEncounters: number;
  pendingReferrals: number;
  chainBlocks:      number | null;
}

interface RecentPatient {
  id:        string;
  nupi:      string;
  firstName: string;
  lastName:  string;
  gender:    string;
  createdAt: string;
}

interface RecentEncounter {
  id:              string;
  patientNupi:     string;
  encounterType:   string;
  chiefComplaint:  string | null;
  encounterDate:   string;
  status:          string;
  practitionerName:string;
}

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });

const isToday = (d: string) => {
  const date = new Date(d);
  const now  = new Date();
  return date.getDate() === now.getDate() &&
         date.getMonth() === now.getMonth() &&
         date.getFullYear() === now.getFullYear();
};

const STATUS_COLOR: Record<string, string> = {
  'finished':    'bg-teal-50 text-teal-700',
  'in-progress': 'bg-amber-50 text-amber-700',
  'planned':     'bg-blue-50 text-blue-700',
  'cancelled':   'bg-red-50 text-red-600',
};

const greet = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

// ── Dashboard ─────────────────────────────────────────────────────
export const Dashboard = () => {
  const navigate         = useNavigate();
  const { user }         = useAuthStore();
  const [stats,          setStats]          = useState<Stats | null>(null);
  const [recentPatients, setRecentPatients] = useState<RecentPatient[]>([]);
  const [recentEnc,      setRecentEnc]      = useState<RecentEncounter[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res  = await apiClient.get('/dashboard/stats');
      const data = res.data;
      setStats(data.stats);
      setRecentPatients(data.recentPatients || []);
      setRecentEnc(data.recentEncounters  || []);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const statCards = [
    {
      label:  'Total Patients',
      value:  stats?.totalPatients    ?? '—',
      icon:   Users,
      color:  'text-teal-600',
      bg:     'bg-teal-50',
      action: () => navigate('/patients'),
    },
    {
      label:  'Encounters Today',
      value:  stats?.todayEncounters  ?? '—',
      icon:   ClipboardList,
      color:  'text-blue-600',
      bg:     'bg-blue-50',
      action: undefined,
    },
    {
      label:  'Active Encounters',
      value:  stats?.activeEncounters ?? '—',
      icon:   Activity,
      color:  'text-amber-600',
      bg:     'bg-amber-50',
      action: undefined,
    },
    {
      label:  'Pending Referrals',
      value:  stats?.pendingReferrals ?? '—',
      icon:   ArrowRightLeft,
      color:  'text-violet-600',
      bg:     'bg-violet-50',
      action: () => navigate('/referrals'),
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {greet()}, {user?.firstName} 👋
          </h1>
          <p className="text-slate-400 mt-0.5 text-sm">
            {new Date().toLocaleDateString('en-KE', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
            {user?.facilityName && (
              <span className="ml-2 text-slate-300">· {user.facilityName}</span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
          title="Refresh">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle size={15} />
          {error}
          <button onClick={load} className="ml-auto text-xs underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* ── Stat cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg, action }) => (
          <div
            key={label}
            onClick={action}
            className={`bg-white rounded-xl border border-slate-200 p-5 shadow-sm transition-all ${
              action ? 'cursor-pointer hover:shadow-md hover:border-slate-300' : ''
            }`}>
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              {loading
                ? <Loader2 size={18} className={`${color} animate-spin`} />
                : <Icon size={20} className={color} />}
            </div>
            <p className="text-2xl font-bold text-slate-800">
              {loading ? <span className="inline-block w-8 h-7 bg-slate-100 rounded animate-pulse" /> : value}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Recent activity ────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">

        {/* Recent Patients */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-teal-500" />
              <h2 className="font-semibold text-slate-700 text-sm">Recently Registered</h2>
            </div>
            <button
              onClick={() => navigate('/patients')}
              className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1">
              View all <ChevronRight size={12} />
            </button>
          </div>

          {loading ? (
            <div className="divide-y divide-slate-100">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-32" />
                    <div className="h-2.5 bg-slate-100 rounded animate-pulse w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentPatients.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              No patients registered yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentPatients.map(p => (
                <li key={p.id}>
                  <button
                    onClick={() => navigate(`/patients/${p.nupi}`)}
                    className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left group">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-teal-700">
                        {p.firstName?.[0]}{p.lastName?.[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {p.firstName} {p.lastName}
                      </p>
                      <p className="text-xs text-slate-400 font-mono truncate">{p.nupi}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400">
                        {isToday(p.createdAt) ? `Today ${fmtTime(p.createdAt)}` : fmt(p.createdAt)}
                      </p>
                      {p.gender && (
                        <span className="text-xs text-slate-300 capitalize">{p.gender}</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Encounters */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList size={15} className="text-blue-500" />
              <h2 className="font-semibold text-slate-700 text-sm">Recent Encounters</h2>
            </div>
          </div>

          {loading ? (
            <div className="divide-y divide-slate-100">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="px-5 py-3.5 space-y-1.5">
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-40" />
                  <div className="h-2.5 bg-slate-100 rounded animate-pulse w-56" />
                </div>
              ))}
            </div>
          ) : recentEnc.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              No encounters recorded yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentEnc.map(enc => (
                <li key={enc.id}>
                  <button
                    onClick={() => navigate(`/patients/${enc.patientNupi}`)}
                    className="w-full px-5 py-3.5 hover:bg-slate-50 transition-colors text-left group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-800 capitalize">
                        {enc.encounterType}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        STATUS_COLOR[enc.status] || 'bg-slate-100 text-slate-500'
                      }`}>
                        {enc.status}
                      </span>
                    </div>
                    {enc.chiefComplaint && (
                      <p className="text-xs text-slate-500 truncate">{enc.chiefComplaint}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-slate-400 font-mono truncate">{enc.patientNupi}</span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-400">
                        {isToday(enc.encounterDate)
                          ? `Today ${fmtTime(enc.encounterDate)}`
                          : fmt(enc.encounterDate)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Quick actions ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Register Patient',    icon: UserPlus,         color: 'bg-teal-600  hover:bg-teal-700',   href: '/patients/register' },
            { label: 'Cross-Facility Lookup', icon: ScanFace,       color: 'bg-violet-600 hover:bg-violet-700', href: '/patients'          },
            { label: 'View All Patients',   icon: Users,            color: 'bg-slate-700 hover:bg-slate-800',  href: '/patients'          },
            { label: 'Referrals',           icon: ArrowRightLeft,   color: 'bg-blue-600  hover:bg-blue-700',   href: '/referrals'         },
          ].filter(a => {
            // hide referrals button for roles that can't see the referrals page
            if (a.href === '/referrals' && !['doctor','nurse'].includes(user?.role || '')) return false;
            return true;
          }).map(({ label, icon: Icon, color, href }) => (
            <button
              key={label}
              onClick={() => navigate(href)}
              className={`${color} text-white flex items-center justify-center gap-2 text-sm font-medium px-4 py-3 rounded-xl transition-colors`}>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── AfyaChain status bar ────────────────────────────────── */}
      <div className="bg-[#0a2540] rounded-xl p-4 flex items-center gap-4">
        <div className="flex items-center gap-2 text-white">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse shrink-0" />
          <span className="text-sm font-semibold">AfyaChain</span>
          <span className="text-xs bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full border border-teal-500/30">Live</span>
        </div>
        <p className="text-xs text-slate-400 flex-1">
          All patient encounters are immutably logged on AfyaChain. Records are federated across all registered facilities.
        </p>
        {stats?.chainBlocks != null && (
          <span className="text-xs text-slate-400 font-mono shrink-0">{stats.chainBlocks} blocks</span>
        )}
      </div>
    </div>
  );
};