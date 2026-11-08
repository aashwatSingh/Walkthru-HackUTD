import { money } from '../lib/format.js';

// A single telemetry strip, not four stat cards: one ruled row of readouts with a colored rule per metric.
export default function KpiCards({ units, rows }) {
  const inspected = units.filter((u) => u.inspection_phase !== 'MOVE_IN_OPEN').length;
  const saved = rows.reduce((s, r) => s + Number(r.waived_amount || 0), 0);
  const disputes = rows.filter((r) => r.condition_status === 'DISPUTE_UNDER_REVIEW').length;
  const billable = rows.reduce((s, r) => s + Number(r.billable_amount || 0), 0);
  const cells = [
    { label: 'Units inspected', code: 'UNITS_INSPECTED', value: inspected, sub: `of ${units.length} units`, tone: 'text-foreground', rule: 'bg-violet' },
    { label: '$ saved by students', code: 'SAVED_BY_STUDENTS', value: money(saved), sub: 'pre-existing damage documented', tone: 'text-neon', rule: 'bg-neon' },
    { label: 'Active disputes', code: 'ACTIVE_DISPUTES', value: disputes, sub: 'waiting on housing', tone: 'text-[#FFB800]', rule: 'bg-[#FFB800]' },
    { label: 'Confirmed billable', code: 'CONFIRMED_BILLABLE', value: money(billable), sub: 'new damage charges', tone: 'text-[#FF5C8D]', rule: 'bg-[#FF2A6D]' },
  ];
  return (
    <dl className="hud-panel grid grid-cols-2 lg:grid-cols-4">
      {cells.map((c, i) => (
        <div key={c.label} className={`relative p-4 ${i % 2 ? 'border-l' : ''} ${i > 1 ? 'border-t lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''} border-purple-500/20`}>
          <span aria-hidden className={`absolute left-4 top-0 h-px w-10 ${c.rule} shadow-[0_0_8px_currentColor]`} />
          <dt className="font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground" title={c.label}>
            <span className="sr-only">{c.label}</span><span aria-hidden>{c.code}</span>
          </dt>
          <dd className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${c.tone}`} data-testid={`kpi-${c.label}`}>{c.value}</dd>
          <dd className="mt-0.5 text-xs text-muted-foreground">{c.sub}</dd>
        </div>
      ))}
    </dl>
  );
}
