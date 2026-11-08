import { Columns2, Sparkles } from 'lucide-react';
import { StatusBadge } from '../components/ui.jsx';
import { STATUS_META, fmtDateTime, money } from '../lib/format.js';

const Select = ({ label, value, onChange, options }) => (
  <label className="text-xs font-medium text-slate-500">{label}
    <select aria-label={label} value={value || ''} onChange={(e) => onChange(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900">
      <option value="">All</option>
      {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  </label>
);

export default function ItemsTable({ rows, allRows, filters, setFilters, onInspect, aiByItem = {} }) {
  const uniq = (key) => [...new Set(allRows.map((r) => r[key]))].sort();
  const set = (k) => (v) => setFilters({ ...filters, [k]: v || undefined });
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 sm:grid-cols-4">
        <Select label="Building" value={filters.building} onChange={set('building')} options={uniq('building_name')} />
        <Select label="Room" value={filters.unitCode} onChange={set('unitCode')} options={uniq('unit_code')} />
        <Select label="Zone" value={filters.zone} onChange={set('zone')} options={uniq('zone_category')} />
        <Select label="Status" value={filters.status} onChange={set('status')} options={Object.keys(STATUS_META).filter((s) => s !== 'NEEDS_HUMAN_REVIEW').map((s) => ({ value: s, label: STATUS_META[s].label }))} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{['Student', 'Room', 'Item', 'Move-in', 'Move-out', 'Status', 'AI suggests', 'Fine', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const ai = aiByItem[r.id];
              return (
                <tr key={r.id} className="hover:bg-slate-50" data-testid="item-row">
                  <td className="px-3 py-2.5">{r.assigned_student_name}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.unit_code}</td>
                  <td className="px-3 py-2.5"><span className="font-medium">{r.item_name}</span><span className="block text-xs text-slate-500">{r.zone_category}</span></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600">{fmtDateTime(r.before_captured_at)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600">{fmtDateTime(r.after_captured_at)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.condition_status} /></td>
                  <td className="px-3 py-2.5">{ai ? <span className="inline-flex items-center gap-1"><Sparkles size={13} className="text-violet-500" /><StatusBadge status={ai.suggested_status} /></span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-medium">{money(r.estimated_fine)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => onInspect(r)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:border-blue-500 hover:text-blue-700"><Columns2 size={14} /> Inspect side-by-side</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No items match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
