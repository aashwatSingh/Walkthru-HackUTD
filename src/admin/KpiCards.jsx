import { ArrowDown, Filter } from 'lucide-react';
import { Ticker } from '../components/ui.jsx';
import { money } from '../lib/format.js';

const TONE = {
  violet: { ink: 'text-foreground', on: 'border-lilac/70 bg-violet/15 shadow-[0_0_24px_-6px_rgb(157_78_221/0.7)]' },
  cyan: { ink: 'text-neon', on: 'border-cyan-400/70 bg-cyan-400/[0.1] shadow-[0_0_24px_-6px_rgb(0_240_255/0.7)]' },
  amber: { ink: 'text-warn', on: 'border-warn/70 bg-warn/[0.1] shadow-[0_0_24px_-6px_rgb(255_184_0/0.7)]' },
  rose: { ink: 'text-blush', on: 'border-alert/70 bg-alert/[0.1] shadow-[0_0_24px_-6px_rgb(255_42_109/0.7)]' },
};

// Four readouts that are also controls: three of them filter the item table to the rows behind the number.
export default function KpiCards({ units, rows, status, onStatus, onRooms }) {
  const inspected = units.filter((u) => u.inspection_phase !== 'MOVE_IN_OPEN').length;
  const saved = rows.reduce((s, r) => s + Number(r.waived_amount || 0), 0);
  const disputes = rows.filter((r) => r.condition_status === 'DISPUTE_UNDER_REVIEW').length;
  const billable = rows.reduce((s, r) => s + Number(r.billable_amount || 0), 0);
  const cells = [
    { label: 'Units inspected', value: inspected, sub: `of ${units.length} rooms`, tone: 'violet', lit: 'violet' },
    { label: '$ saved by students', value: money(saved), sub: 'pre-existing damage, waived', tone: 'cyan', lit: '', filter: 'PRE_EXISTING_DAMAGE' },
    { label: 'Active disputes', value: disputes, sub: 'waiting on housing', tone: 'amber', lit: 'amber', filter: 'DISPUTE_UNDER_REVIEW' },
    { label: 'Confirmed billable', value: money(billable), sub: 'new damage charges', tone: 'rose', lit: 'rose', filter: 'NEW_DAMAGE_BILLABLE' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cells.map((c, i) => {
        const on = !!c.filter && status === c.filter;
        const t = TONE[c.tone];
        return (
          <button key={c.label} type="button" data-lit={c.lit} aria-pressed={c.filter ? on : undefined}
            onClick={() => (c.filter ? onStatus(on ? undefined : c.filter) : onRooms())}
            title={c.filter ? (on ? 'Show all items again' : 'Show only these items in the table') : 'Jump to the rooms'}
            className={`animate-rise group rounded-xl border p-4 text-left transition-[background-color,border-color,box-shadow] duration-200 ${on ? t.on : 'border-line bg-obsidian hover:bg-royal'}`}
            style={{ animationDelay: `${i * 50}ms` }}>
            <span className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-muted-foreground">
              {c.label}
              <span aria-hidden className={`flex items-center gap-1 text-[11px] transition-opacity duration-200 ${on ? `${t.ink} opacity-100` : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
                {c.filter ? <><Filter size={11} /> {on ? 'filtering' : 'filter'}</> : <><ArrowDown size={11} /> rooms</>}
              </span>
            </span>
            <span className={`mt-1.5 block font-mono text-[26px] font-semibold leading-none tabular-nums ${t.ink}`} data-testid={`kpi-${c.label}`}><Ticker value={c.value} /></span>
            <span className="mt-1.5 block text-xs text-muted-foreground">{c.sub}</span>
          </button>
        );
      })}
    </div>
  );
}
