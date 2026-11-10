import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns2, Loader2, Search, Sparkles, X } from 'lucide-react';
import { StatusBadge } from '../components/ui.jsx';
import { STATUS_META, fmtUtc, fmtUtcShort, money } from '../lib/format.js';

const Select = ({ label, value, onChange, options }) => (
  <label className="min-w-0 text-[12px] font-medium text-muted-foreground">{label}
    <select aria-label={label} value={value || ''} onChange={(e) => onChange(e.target.value)}
      className={`field mt-1 block text-sm ${value ? 'border-cyan-400/70 bg-cyan-400/[0.08] text-neon shadow-[0_0_16px_-6px_rgb(0_240_255/0.6)]' : ''}`}>
      <option value="">All</option>
      {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  </label>
);

// Sorting, searching and paging all happen in the database: this component only shows one page.
const COLUMNS = [
  { key: 'student', label: 'Student', sort: true },
  { key: 'room', label: 'Room', sort: true },
  { key: 'item', label: 'Item', sort: true },
  { key: 'in', label: 'Move-in', sort: true },
  { key: 'out', label: 'Move-out', sort: true },
  { key: 'status', label: 'Status', sort: true },
  { key: 'ai', label: 'AI suggests' },
  { key: 'fine', label: 'Fine', sort: true },
];

export default function ItemsTable({ rows, total, grandTotal, page, pageSize, onPage, loading, options, filters, setFilters, onInspect, aiByItem = {}, search, setSearch, sort, setSort }) {
  const set = (k) => (v) => setFilters({ ...filters, [k]: v || undefined });
  const active = Object.values(filters).filter(Boolean).length + (search ? 1 : 0);
  const sorted = rows;
  const cycle = (key) => setSort(sort?.key !== key ? { key, dir: 1 } : sort.dir === 1 ? { key, dir: -1 } : null);
  const first = total ? page * pageSize + 1 : 0;
  const last = Math.min(total, (page + 1) * pageSize);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="panel overflow-hidden">
      <div className="space-y-3 border-b border-line p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Inspection items</h2>
          <span className="fact flex items-center gap-1.5 tabular-nums" aria-live="polite">{loading && <Loader2 size={12} className="animate-spin text-neon" aria-hidden />}{total === grandTotal ? `${grandTotal} items` : `${total} of ${grandTotal} items`}</span>
          {active > 0 && (
            <button type="button" onClick={() => { setFilters({}); setSearch(''); }} className="animate-pop btn btn-sm btn-outline ml-auto border-cyan-400/50 text-neon">
              <X size={13} /> Clear {active} filter{active > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <label className="col-span-2 min-w-0 text-[12px] font-medium text-muted-foreground lg:col-span-1">Search
            <span className="relative mt-1 block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Student, room or item" aria-label="Search items"
                className={`field pl-9 text-sm ${search ? 'border-cyan-400/70 bg-cyan-400/[0.08]' : ''}`} />
            </span>
          </label>
          <Select label="Building" value={filters.building} onChange={set('building')} options={options.buildings} />
          <Select label="Room" value={filters.unitCode} onChange={set('unitCode')} options={options.unitCodes} />
          <Select label="Zone" value={filters.zone} onChange={set('zone')} options={options.zones} />
          <Select label="Status" value={filters.status} onChange={set('status')} options={Object.keys(STATUS_META).filter((s) => s !== 'NEEDS_HUMAN_REVIEW').map((s) => ({ value: s, label: STATUS_META[s].label }))} />
        </div>
      </div>
      {/* relative: the visually hidden header label is absolutely positioned and must stay inside this scroller */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-line bg-royal/50 text-[12px] text-muted-foreground">
            <tr>
              {COLUMNS.map((c) => {
                const on = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined} className="whitespace-nowrap px-3 py-1.5 font-medium">
                    {c.sort ? (
                      <button type="button" onClick={() => cycle(c.key)} title={`Sort by ${c.label.toLowerCase()}`}
                        className={`-mx-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-cyan-400/10 hover:text-neon ${on ? 'text-neon' : ''}`}>
                        {c.label}{on ? (sort.dir === 1 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />) : <ArrowUpDown size={12} className="opacity-40" aria-hidden />}
                      </button>
                    ) : c.label}
                  </th>
                );
              })}
              <th scope="col" className="px-3 py-1.5"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-line transition-opacity duration-150 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {sorted.map((r) => {
              const ai = aiByItem[r.id];
              return (
                <tr key={r.id} onClick={() => onInspect(r)} className="group cursor-pointer transition-colors duration-150 hover:bg-cyan-400/[0.05]" data-testid="item-row">
                  <td className="whitespace-nowrap px-3 py-2.5">{r.assigned_student_name}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] text-neon">{r.unit_code}</td>
                  <td className="min-w-[190px] px-3 py-2.5"><span className="font-medium">{r.item_name}</span><span className="block text-[11.5px] text-muted-foreground">{r.zone_category}</span></td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-soft" title={fmtUtc(r.before_captured_at)}>{fmtUtcShort(r.before_captured_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-soft" title={fmtUtc(r.after_captured_at)}>{fmtUtcShort(r.after_captured_at)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.condition_status} /></td>
                  <td className="px-3 py-2.5">{ai ? <span className="inline-flex items-center gap-1.5"><Sparkles size={13} className="text-lilac" aria-label="Nemotron" /><StatusBadge status={ai.suggested_status} /></span> : <span className="text-muted-foreground/60">—</span>}</td>
                  <td className={`whitespace-nowrap px-3 py-2.5 font-mono text-[13px] font-medium tabular-nums ${Number(r.estimated_fine) > 0 ? (r.condition_status === 'NEW_DAMAGE_BILLABLE' ? 'text-blush' : 'text-warn') : 'text-muted-foreground'}`}>{money(r.estimated_fine)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={(e) => { e.stopPropagation(); onInspect(r); }} className="btn btn-sm btn-outline group-hover:border-cyan-400/60 group-hover:bg-cyan-400/[0.08] group-hover:text-neon"><Columns2 size={14} /> Inspect side-by-side</button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && !loading && (
              <tr><td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                No items match these filters. <button type="button" onClick={() => { setFilters({}); setSearch(''); }} className="font-semibold text-neon underline-offset-2 hover:underline">Clear them</button>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {total > pageSize && (
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5" aria-label="Table pages">
          <span className="fact tabular-nums">{first}–{last} of {total}</span>
          <span className="flex items-center gap-1.5">
            <button type="button" disabled={page === 0 || loading} onClick={() => onPage(page - 1)} className="btn btn-outline btn-sm"><ChevronLeft size={14} /> Previous page</button>
            <span className="fact px-1 tabular-nums">{page + 1} / {pages}</span>
            <button type="button" disabled={page >= pages - 1 || loading} onClick={() => onPage(page + 1)} className="btn btn-outline btn-sm">Following page <ChevronRight size={14} /></button>
          </span>
        </nav>
      )}
    </section>
  );
}
