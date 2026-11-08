export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—');

export const money = (n) =>
  Number(n || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

// Status chips read like terminal readouts: [GROUP // VALUE]. `label` stays the plain-English name (filters, charts,
// screen readers); `code` is what the chip shows. Colors: matrix emerald = verified, cyan = waived with proof,
// crimson = billable, amber = disputed.
export const STATUS_META = {
  UNREVIEWED: { label: 'Unreviewed', code: ['STATUS', 'UNREVIEWED'], cls: 'border-white/15 bg-white/[0.04] text-[#b9b3d1]', color: '#6b6585' },
  NO_CHANGE: { label: 'No change', code: ['VERIFIED', 'NO_CHANGE'], cls: 'border-emerald-400/40 bg-emerald-400/10 text-[#00FF9D]', color: '#00FF9D' },
  PRE_EXISTING_DAMAGE: { label: 'Pre-existing (waived)', code: ['PRE_EXISTING', 'WAIVED'], cls: 'border-cyan-400/45 bg-cyan-400/10 text-[#00F0FF]', color: '#00F0FF' },
  NEW_DAMAGE_BILLABLE: { label: 'New damage (billable)', code: ['NEW_DAMAGE', 'BILLABLE'], cls: 'border-rose-500/50 bg-rose-500/10 text-[#FF5C8D]', color: '#FF2A6D' },
  DISPUTE_UNDER_REVIEW: { label: 'Dispute under review', code: ['DISPUTE', 'UNDER_REVIEW'], cls: 'border-amber-400/45 bg-amber-400/10 text-[#FFB800]', color: '#FFB800' },
  NEEDS_HUMAN_REVIEW: { label: 'Needs human review', code: ['FLAG', 'HUMAN_REVIEW'], cls: 'border-white/15 bg-white/[0.04] text-[#b9b3d1]', color: '#8d86a8' },
};

export const PHASE_META = {
  MOVE_IN_OPEN: { label: 'Move-in open', cls: 'border-cyan-400/40 bg-cyan-400/10 text-[#00F0FF]', live: true },
  MOVE_IN_LOCKED: { label: 'Move-in locked', cls: 'border-purple-500/50 bg-purple-500/15 text-[#c79bff]' },
  MOVE_OUT_OPEN: { label: 'Move-out open', cls: 'border-amber-400/45 bg-amber-400/10 text-[#FFB800]', live: true },
  COMPLETED: { label: 'Completed', cls: 'border-emerald-400/40 bg-emerald-400/10 text-[#00FF9D]' },
};

// 2026-11-07 09:30:00 UTC: the server-clock format used on evidence tags and logs.
export const fmtUtc = (iso) => (iso ? `${new Date(iso).toISOString().slice(0, 19).replace('T', ' ')} UTC` : '—');
export const fmtUtcShort = (iso) => (iso ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')}Z` : '—');

export const shortHash = (h) => (h ? h.slice(0, 8) : null);
