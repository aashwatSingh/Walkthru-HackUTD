export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—');

export const money = (n) =>
  Number(n || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export const STATUS_META = {
  UNREVIEWED: { label: 'Unreviewed', cls: 'bg-slate-100 text-slate-700', color: '#94a3b8' },
  NO_CHANGE: { label: 'No change', cls: 'bg-emerald-100 text-emerald-800', color: '#10b981' },
  PRE_EXISTING_DAMAGE: { label: 'Pre-existing (waived)', cls: 'bg-sky-100 text-sky-800', color: '#0ea5e9' },
  NEW_DAMAGE_BILLABLE: { label: 'New damage (billable)', cls: 'bg-rose-100 text-rose-800', color: '#f43f5e' },
  DISPUTE_UNDER_REVIEW: { label: 'Dispute under review', cls: 'bg-amber-100 text-amber-800', color: '#f59e0b' },
  NEEDS_HUMAN_REVIEW: { label: 'Needs human review', cls: 'bg-slate-200 text-slate-700', color: '#64748b' },
};

export const PHASE_META = {
  MOVE_IN_OPEN: { label: 'Move-in open', cls: 'bg-blue-100 text-blue-800' },
  MOVE_IN_LOCKED: { label: 'Move-in locked', cls: 'bg-indigo-100 text-indigo-800' },
  MOVE_OUT_OPEN: { label: 'Move-out open', cls: 'bg-orange-100 text-orange-800' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-800' },
};

export const shortHash = (h) => (h ? h.slice(0, 8) : null);
