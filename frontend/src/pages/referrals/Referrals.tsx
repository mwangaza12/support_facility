import { useEffect, useState } from 'react';
import { useReferralStore, type Referral } from '@/stores/referral.store';
import { useAuthStore } from '@/stores/auth.store';
import {
  ArrowRightLeft, Plus, X, Loader2, AlertCircle,
  ChevronRight, Clock, CheckCircle2, XCircle,
  ArrowUpRight, ArrowDownLeft, Building2, User,
  FileText, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const URGENCY_COLOR: Record<string, string> = {
  ROUTINE:   'bg-slate-100 text-slate-600',
  URGENT:    'bg-amber-50 text-amber-700',
  EMERGENCY: 'bg-red-50 text-red-700',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING:   'bg-blue-50 text-blue-700',
  ACCEPTED:  'bg-teal-50 text-teal-700',
  REJECTED:  'bg-red-50 text-red-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const STATUS_ICON: Record<string, any> = {
  PENDING:   Clock,
  ACCEPTED:  CheckCircle2,
  REJECTED:  XCircle,
  COMPLETED: CheckCircle2,
  CANCELLED: XCircle,
};

const badge = (label: string, color: string) => (
  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
);

const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-KE', {
  day: 'numeric', month: 'short', year: 'numeric'
}) : '—';

// ── Create Referral Modal ─────────────────────────────────────────

const CreateReferralModal = ({ onClose }: { onClose: () => void }) => {
  const { facilities, createReferral, isSubmitting, error } = useReferralStore();
  const { user } = useAuthStore();

  const [form, setForm] = useState({
    nupi:       '',
    toFacility: '',
    reason:     '',
    urgency:    'ROUTINE' as 'ROUTINE' | 'URGENT' | 'EMERGENCY',
    notes:      '',
  });
  const [success, setSuccess] = useState(false);
  const update = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.nupi || !form.toFacility || !form.reason) return;
    try {
      await createReferral({ ...form, issuedBy: `${user?.firstName} ${user?.lastName}`.trim() });
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={18} className="text-teal-600" />
            <h2 className="font-semibold text-slate-800">New Referral</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <CheckCircle2 size={40} className="text-teal-500" />
            <p className="font-semibold text-slate-700">Referral created</p>
            <p className="text-sm text-slate-400">Logged on blockchain</p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg flex items-center gap-2">
                <AlertCircle size={13} /> {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Patient NUPI <span className="text-red-500">*</span></Label>
              <Input placeholder="NUPI-XXXXXXXX" value={form.nupi} onChange={e => update('nupi', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Refer To <span className="text-red-500">*</span></Label>
              <select
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.toFacility} onChange={e => update('toFacility', e.target.value)}>
                <option value="">Select facility…</option>
                {facilities.map((f: any) => (
                  <option key={f.facilityId} value={f.facilityId}>{f.name} — {f.county}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. Specialist consultation for cardiac evaluation"
                value={form.reason} onChange={e => update('reason', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Urgency</Label>
              <div className="flex gap-2">
                {(['ROUTINE', 'URGENT', 'EMERGENCY'] as const).map(u => (
                  <button key={u} onClick={() => update('urgency', u)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      form.urgency === u
                        ? u === 'EMERGENCY' ? 'bg-red-500 text-white border-red-500'
                          : u === 'URGENT'  ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}>{u}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                rows={3} placeholder="Additional clinical notes for receiving facility…"
                value={form.notes} onChange={e => update('notes', e.target.value)} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
                onClick={handleSubmit}
                disabled={isSubmitting || !form.nupi || !form.toFacility || !form.reason}>
                {isSubmitting ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                {isSubmitting ? 'Creating…' : 'Create Referral'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Referral Detail Modal ─────────────────────────────────────────

const ReferralDetail = ({ referral, onClose, isIncoming }: {
  referral: Referral; onClose: () => void; isIncoming: boolean;
}) => {
  const { updateStatus, isSubmitting } = useReferralStore();
  const [notes, setNotes] = useState('');
  const StatusIcon = STATUS_ICON[referral.status] || Clock;
  const canUpdate  = referral.status === 'PENDING' || referral.status === 'ACCEPTED';

  const handleUpdate = async (status: Referral['status']) => {
    await updateStatus(referral.id, status, notes || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <StatusIcon size={18} className="text-teal-600" />
            <h2 className="font-semibold text-slate-800">Referral Details</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            {badge(referral.status, STATUS_COLOR[referral.status] || '')}
            {badge(referral.urgency, URGENCY_COLOR[referral.urgency] || '')}
            {referral.blockIndex !== undefined && (
              <span className="text-xs text-slate-400 font-mono">Block #{referral.blockIndex}</span>
            )}
          </div>
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient</p>
            <div className="flex items-center gap-2">
              <User size={14} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-800">
                {referral.patientName || (
                  <span className="text-slate-400 font-mono text-xs">{referral.patientNupi}</span>
                )}
              </span>
            </div>
            {referral.patientName && (
              <p className="text-xs text-slate-400 font-mono ml-5">{referral.patientNupi}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-4 space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">From</p>
              <div className="flex items-center gap-1.5">
                <Building2 size={13} className="text-slate-400" />
                <span className="text-sm text-slate-700">{referral.fromFacilityName || referral.fromFacilityId}</span>
              </div>
            </div>
            <div className="bg-teal-50 rounded-xl p-4 space-y-1">
              <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">To</p>
              <div className="flex items-center gap-1.5">
                <Building2 size={13} className="text-teal-500" />
                <span className="text-sm text-teal-800 font-medium">{referral.toFacilityName || referral.toFacilityId}</span>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <FileText size={12} /> Reason
            </p>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-4 py-3">{referral.reason}</p>
          </div>
          {referral.notes && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</p>
              <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3">{referral.notes}</p>
            </div>
          )}
          <div className="text-xs text-slate-400 space-y-1">
            {referral.issuedBy && <p>Issued by: {referral.issuedBy}</p>}
            <p>Created: {fmt(referral.createdAt)}</p>
          </div>
          {isIncoming && canUpdate && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Update Status</p>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                rows={2} placeholder="Optional response notes…"
                value={notes} onChange={e => setNotes(e.target.value)} />
              <div className="flex gap-2">
                {referral.status === 'PENDING' && (
                  <>
                    <Button className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-xs"
                      onClick={() => handleUpdate('ACCEPTED')} disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : 'Accept'}
                    </Button>
                    <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50 text-xs"
                      onClick={() => handleUpdate('REJECTED')} disabled={isSubmitting}>
                      Reject
                    </Button>
                  </>
                )}
                {referral.status === 'ACCEPTED' && (
                  <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                    onClick={() => handleUpdate('COMPLETED')} disabled={isSubmitting}>
                    Mark Completed
                  </Button>
                )}
              </div>
            </div>
          )}
          {!isIncoming && referral.status === 'PENDING' && (
            <div className="border-t border-slate-100 pt-4">
              <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50 text-xs"
                onClick={() => handleUpdate('CANCELLED')} disabled={isSubmitting}>
                Cancel Referral
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Referral Row ──────────────────────────────────────────────────

const ReferralRow = ({ referral, isIncoming, onClick }: {
  referral: Referral; isIncoming: boolean; onClick: () => void;
}) => (
  <li>
    <button onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left">
      <div className={`p-2 rounded-lg shrink-0 ${isIncoming ? 'bg-violet-50' : 'bg-teal-50'}`}>
        {isIncoming
          ? <ArrowDownLeft size={15} className="text-violet-600" />
          : <ArrowUpRight  size={15} className="text-teal-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-sm font-medium text-slate-800 truncate">
            {referral.patientName || (
              <span className="font-mono text-slate-500 text-xs">
                {referral.patientNupi?.slice(0, 20)}…
              </span>
            )}
          </span>
          {badge(referral.urgency, URGENCY_COLOR[referral.urgency] || '')}
        </div>
        <p className="text-xs text-slate-500 truncate">
          {isIncoming
            ? `From: ${referral.fromFacilityName || referral.fromFacilityId}`
            : `To: ${referral.toFacilityName || referral.toFacilityId}`}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{fmt(referral.createdAt)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge(referral.status, STATUS_COLOR[referral.status] || '')}
        <ChevronRight size={15} className="text-slate-400" />
      </div>
    </button>
  </li>
);

// ── Main Page ─────────────────────────────────────────────────────

export const Referrals = () => {
  const { user } = useAuthStore();
  const { outgoing, incoming, selected, isLoading, loadOutgoing, loadIncoming, loadFacilities, selectReferral } = useReferralStore();

  const [tab,        setTab]        = useState<'outgoing' | 'incoming'>('outgoing');
  const [showCreate, setShowCreate] = useState(false);
  const isDoctor = user?.role === 'doctor';

  useEffect(() => {
    loadOutgoing();
    loadIncoming();
    loadFacilities();
  }, []);

  const list           = tab === 'outgoing' ? outgoing : incoming;
  const pendingIncoming = incoming.filter(r => r.status === 'PENDING').length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Referrals</h1>
          <p className="text-sm text-slate-400 mt-0.5">Inter-facility patient referral management</p>
        </div>
        {isDoctor && (
          <Button className="bg-teal-600 hover:bg-teal-700 text-white gap-2" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> New Referral
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Outgoing', value: outgoing.length,       icon: ArrowUpRight,  color: 'text-teal-600',   bg: 'bg-teal-50'   },
          { label: 'Total Incoming', value: incoming.length,       icon: ArrowDownLeft, color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'Pending Action', value: pendingIncoming,       icon: Zap,           color: 'text-amber-600',  bg: 'bg-amber-50'  },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
            <div className={`p-2 rounded-lg ${bg}`}><Icon size={18} className={color} /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex border-b border-slate-100">
          {(['outgoing', 'incoming'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                tab === t ? 'text-teal-600 border-b-2 border-teal-600' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t === 'outgoing'
                ? <><ArrowUpRight size={14} /> Outgoing</>
                : <><ArrowDownLeft size={14} /> Incoming
                    {pendingIncoming > 0 && (
                      <span className="bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                        {pendingIncoming}
                      </span>
                    )}
                  </>}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-teal-500" /></div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <ArrowRightLeft size={32} className="mx-auto text-slate-200" />
            <p className="text-slate-400 text-sm">No {tab} referrals yet.</p>
            {tab === 'outgoing' && isDoctor && (
              <button onClick={() => setShowCreate(true)} className="text-xs text-teal-600 hover:text-teal-700 underline">
                Create first referral
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map(r => (
              <ReferralRow key={r.id} referral={r} isIncoming={tab === 'incoming'} onClick={() => selectReferral(r)} />
            ))}
          </ul>
        )}
      </div>

      {showCreate && <CreateReferralModal onClose={() => setShowCreate(false)} />}
      {selected && (
        <ReferralDetail referral={selected} isIncoming={tab === 'incoming'} onClose={() => selectReferral(null)} />
      )}
    </div>
  );
};