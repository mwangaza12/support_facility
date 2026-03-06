import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import {
  LayoutDashboard, Users, UserCog, LogOut,
  Activity, Menu, X, ChevronRight, Shield
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard',        roles: ['doctor','nurse','receptionist','admin','pharmacist','lab_technician'] },
  { to: '/patients',  icon: Users,           label: 'Patients',          roles: ['doctor','nurse','receptionist'] },
  { to: '/admin',     icon: Shield,          label: 'Admin Panel',       roles: ['admin'] },
  { to: '/staff',     icon: UserCog,         label: 'Staff Management',  roles: ['admin'] },
];

export default function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate          = useNavigate();
  const [open, setOpen]   = useState(true);

  const visible = navItems.filter(n => user?.role && n.roles.includes(user.role));

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">

      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside
        className={`
          flex flex-col bg-[#0a2540] text-white transition-all duration-300 ease-in-out
          ${open ? 'w-60' : 'w-16'}
        `}>

        {/* Logo / toggle */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-white/10">
          {open && (
            <div className="flex items-center gap-2">
              <Activity className="text-teal-400" size={20} />
              <span className="font-bold text-sm tracking-wide">AfyaLink HIE</span>
            </div>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="ml-auto p-1.5 rounded-md hover:bg-white/10 transition-colors">
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {visible.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150 group
                ${isActive
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'}
              `}>
              <Icon size={18} className="shrink-0" />
              {open && (
                <>
                  <span className="flex-1">{label}</span>
                  <ChevronRight size={14} className="opacity-40 group-hover:opacity-100" />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-white/10 p-3">
          {open ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center text-xs font-bold shrink-0">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="Logout">
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full flex justify-center p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title="Logout">
              <LogOut size={15} />
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">
              {user?.facilityId}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-xs text-slate-500">AfyaChain Connected</span>
          </div>
        </header>

        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}