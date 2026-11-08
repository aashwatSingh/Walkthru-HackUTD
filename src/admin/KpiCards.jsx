import { AlertTriangle, ClipboardCheck, DollarSign, PiggyBank } from 'lucide-react';
import { money } from '../lib/format.js';

export default function KpiCards({ units, rows }) {
  const inspected = units.filter((u) => u.inspection_phase !== 'MOVE_IN_OPEN').length;
  const saved = rows.reduce((s, r) => s + Number(r.waived_amount || 0), 0);
  const disputes = rows.filter((r) => r.condition_status === 'DISPUTE_UNDER_REVIEW').length;
  const billable = rows.reduce((s, r) => s + Number(r.billable_amount || 0), 0);
  const cards = [
    { label: 'Units inspected', value: inspected, sub: `of ${units.length} units`, icon: ClipboardCheck, tone: 'text-primary bg-primary/10' },
    { label: '$ saved by students', value: money(saved), sub: 'pre-existing damage documented', icon: PiggyBank, tone: 'text-sky-400 bg-sky-400/10' },
    { label: 'Active disputes', value: disputes, sub: 'waiting on housing', icon: AlertTriangle, tone: 'text-amber-400 bg-amber-400/10' },
    { label: 'Confirmed billable', value: money(billable), sub: 'new damage charges', icon: DollarSign, tone: 'text-rose-400 bg-rose-400/10' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-card p-4 shadow-sm">
          <span className={`rounded-xl p-2.5 ${c.tone}`}><c.icon size={20} /></span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-bold" data-testid={`kpi-${c.label}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
