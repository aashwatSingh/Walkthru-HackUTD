import { Columns2, Sparkles } from 'lucide-react';
import { StatusBadge } from '../components/ui.jsx';
import { STATUS_META, fmtUtc, fmtUtcShort, money } from '../lib/format.js';

const Select = ({ label, value, onChange, options }) => (
  <label className="hud-label">{label}
    <select aria-label={label} value={value || ''} onChange={(e) => onChange(e.target.value)} className="field mt-1.5 block font-sans text-sm normal-case tracking-normal">
      <option value="">All</option>
      {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  </label>
);

export default function ItemsTable({ rows, allRows, filters, setFilters, onInspect, aiByItem = {} }) {
  const uniq = (key) => [...new Set(allRows.map((r) => r[key]))].sort();
  const set = (k) => (v) => setFilters({ ...filters, [k]: v || undefined });
  return (
    <section className="hud-panel">
      <div className="grid grid-cols-2 gap-3 border-b border-purple-500/20 p-4 sm:grid-cols-4">
        <Select label="Building" value={filters.building} onChange={set('building')} options={uniq('building_name')} />
        <Select label="Room" value={filters.unitCode} onChange={set('unitCode')} options={uniq('unit_code')} />
        <Select label="Zone" value={filters.zone} onChange={set('zone')} options={uniq('zone_category')} />
        <Select label="Status" value={filters.status} onChange={set('status')} options={Object.keys(STATUS_META).filter((s) => s !== 'NEEDS_HUMAN_REVIEW').map((s) => ({ value: s, label: STATUS_META[s].label }))} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-purple-500/20 bg-royal/40 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
            <tr>{['Student', 'Room', 'Item', 'Move-in', 'Move-out', 'Status', 'AI suggests', 'Fine', ''].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-purple-500/15">
            {rows.map((r) => {
              const ai = aiByItem[r.id];
              return (
                <tr key={r.id} className="transition-colors hover:bg-cyan-400/[0.04]" data-testid="item-row">
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.assigned_student_name}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[13px] text-neon">{r.unit_code}</td>
                  <td className="px-3 py-2.5"><span className="font-medium">{r.item_name}</span><span className="block font-mono text-[10.5px] uppercase text-muted-foreground">{r.zone_category}</span></td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[11px] text-[#cfc9e6]" title={fmtUtc(r.before_captured_at)}>{fmtUtcShort(r.before_captured_at)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[11px] text-[#cfc9e6]" title={fmtUtc(r.after_captured_at)}>{fmtUtcShort(r.after_captured_at)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.condition_status} /></td>
                  <td className="px-3 py-2.5">{ai ? <span className="inline-flex items-center gap-1"><Sparkles size={13} className="text-violet-400" aria-label="Nemotron" /><StatusBadge status={ai.suggested_status} /></span> : <span className="font-mono text-muted-foreground/60">—</span>}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[13px] font-medium tabular-nums">{money(r.estimated_fine)}</td>
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
