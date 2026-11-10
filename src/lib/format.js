export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—');

export const money = (n) =>
  Number(n || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

// Status chips: a coloured dot plus a plain-English label. `label` is also used by filters, charts and screen
// readers; `short` is what the chip shows; `code` is the machine name (shown as a tooltip).
// Colours: emerald = verified, cyan = waived with proof, rose = billable, amber = disputed, grey = not decided.
export const STATUS_META = {
  UNREVIEWED: { label: 'Unreviewed', short: 'Unreviewed', code: 'UNREVIEWED', cls: 'border-white/15 bg-white/[0.04] text-[#bdb7d6]', color: '#6b6585' },
  NO_CHANGE: { label: 'No change', short: 'No change', code: 'NO_CHANGE', cls: 'border-matrix/40 bg-matrix/10 text-matrix', color: '#00FF9D' },
  PRE_EXISTING_DAMAGE: { label: 'Pre-existing (waived)', short: 'Pre-existing · waived', code: 'PRE_EXISTING_DAMAGE', cls: 'border-cyan-400/45 bg-cyan-400/10 text-neon', color: '#00F0FF' },
  NEW_DAMAGE_BILLABLE: { label: 'New damage (billable)', short: 'New damage · billable', code: 'NEW_DAMAGE_BILLABLE', cls: 'border-alert/50 bg-alert/10 text-blush', color: '#FF2A6D' },
  DISPUTE_UNDER_REVIEW: { label: 'Dispute under review', short: 'Disputed · in review', code: 'DISPUTE_UNDER_REVIEW', cls: 'border-warn/45 bg-warn/10 text-warn', color: '#FFB800' },
  NEEDS_HUMAN_REVIEW: { label: 'Needs human review', short: 'Needs a human', code: 'NEEDS_HUMAN_REVIEW', cls: 'border-white/15 bg-white/[0.04] text-[#bdb7d6]', color: '#8d86a8' },
};

// The four stops of an inspection, in order. `live` = a student can still add photos.
export const PHASES = ['MOVE_IN_OPEN', 'MOVE_IN_LOCKED', 'MOVE_OUT_OPEN', 'COMPLETED'];
export const PHASE_META = {
  MOVE_IN_OPEN: { label: 'Move-in open', step: 'Move-in', cls: 'border-cyan-400/40 bg-cyan-400/10 text-neon', live: true },
  MOVE_IN_LOCKED: { label: 'Move-in locked', step: 'Locked', cls: 'border-violet/50 bg-violet/15 text-lilac' },
  MOVE_OUT_OPEN: { label: 'Move-out open', step: 'Move-out', cls: 'border-warn/45 bg-warn/10 text-warn', live: true },
  COMPLETED: { label: 'Completed', step: 'Complete', cls: 'border-matrix/40 bg-matrix/10 text-matrix' },
};

// 2026-11-07 09:30:00 UTC: the server-clock format used on evidence tags and logs.
export const fmtUtc = (iso) => (iso ? `${new Date(iso).toISOString().slice(0, 19).replace('T', ' ')} UTC` : '—');
export const fmtUtcShort = (iso) => (iso ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')}Z` : '—');

export const shortHash = (h) => (h ? h.slice(0, 8) : null);
