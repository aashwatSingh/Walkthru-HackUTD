import { Columns2, Sparkles } from 'lucide-react';
import { StatusBadge } from '../components/ui.jsx';
import { STATUS_META, fmtDateTime, money } from '../lib/format.js';

const Select = ({ label, value, onChange, options }) => (
  <label className="text-xs font-medium text-muted-foreground">{label}
    <select aria-label={label} value={value || ''} onChange={(e) => onChange(e.target.value)} className="field mt-1 block bg-card">
      <option value="">All</option>
      {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  </label>
);

export default function ItemsTable({ rows, allRows, filters, setFilters, onInspect, aiByItem = {} }) {
  const uniq = (key) => [...new Set(allRows.map((r) => r[key]))].sort();
  const set = (k) => (v) => setFilters({ ...filters, [k]: v || undefined });
  return (
    <section className="rounded-2xl border border-white/10 bg-card shadow-sm">
      <div className="grid grid-cols-2 gap-3 border-b border-white/10 p-4 sm:grid-cols-4">
        <Select label="Building" value={filters.building} onChange={set('building')} options={uniq('building_name')} />
        <Select label="Room" value={filters.unitCode} onChange={set('unitCode')} options={uniq('unit_code')} />
        <Select label="Zone" value={filters.zone} onChange={set('zone')} options={uniq('zone_category')} />
        <Select label="Status" value={filters.status} onChange={set('status')} options={Object.keys(STATUS_META).filter((s) => s !== 'NEEDS_HUMAN_REVIEW').map((s) => ({ value: s, label: STATUS_META[s].label }))} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>{['Student', 'Room', 'Item', 'Move-in', 'Move-out', 'Status', 'AI suggests', 'Fine', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((r) => {
              const ai = aiByItem[r.id];
              return (
                <tr key={r.id} className="hover:bg-white/5" data-testid="item-row">
                  <td className="px-3 py-2.5">{r.assigned_student_name}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.unit_code}</td>
                  <td className="px-3 py-2.5"><span className="font-medium">{r.item_name}</span><span className="block text-xs text-muted-foreground">{r.zone_category}</span></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-white/75">{fmtDateTime(r.before_captured_at)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-white/75">{fmtDateTime(r.after_captured_at)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.condition_status} /></td>
                  <td className="px-3 py-2.5">{ai ? <span className="inline-flex items-center gap-1"><Sparkles size={13} className="text-violet-400" /><StatusBadge status={ai.suggested_status} /></span> : <span className="text-white/30">—</span>}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-medium">{money(r.estimated_fine)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => onInspect(r)} className="btn btn-sm btn-outline"><Columns2 size={14} /> Inspect side-by-side</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No items match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
