export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—');

export const money = (n) =>
  Number(n || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export const STATUS_META = {
  UNREVIEWED: { label: 'Unreviewed', cls: 'bg-white/10 text-white/70', color: '#a3a3a3' },
  NO_CHANGE: { label: 'No change', cls: 'bg-primary/15 text-primary', color: '#b8f03c' },
  PRE_EXISTING_DAMAGE: { label: 'Pre-existing (waived)', cls: 'bg-sky-400/15 text-sky-300', color: '#38bdf8' },
  NEW_DAMAGE_BILLABLE: { label: 'New damage (billable)', cls: 'bg-rose-500/15 text-rose-300', color: '#fb7185' },
  DISPUTE_UNDER_REVIEW: { label: 'Dispute under review', cls: 'bg-amber-400/15 text-amber-300', color: '#fbbf24' },
  NEEDS_HUMAN_REVIEW: { label: 'Needs human review', cls: 'bg-white/10 text-white/70', color: '#737373' },
};

export const PHASE_META = {
  MOVE_IN_OPEN: { label: 'Move-in open', cls: 'bg-sky-400/15 text-sky-300' },
  MOVE_IN_LOCKED: { label: 'Move-in locked', cls: 'bg-violet-400/15 text-violet-300' },
  MOVE_OUT_OPEN: { label: 'Move-out open', cls: 'bg-amber-400/15 text-amber-300' },
  COMPLETED: { label: 'Completed', cls: 'bg-primary/15 text-primary' },
};

export const shortHash = (h) => (h ? h.slice(0, 8) : null);
