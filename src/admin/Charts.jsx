import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { STATUS_META, money } from '../lib/format.js';

const TIP = { background: '#171130', border: '1px solid rgba(0,240,255,0.45)', borderRadius: 8, color: '#efedf8', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, boxShadow: '0 10px 30px -8px rgba(0,0,0,0.8)' };
const AXIS = { fontSize: 11.5, fill: '#a8a2c4', fontFamily: 'Archivo, sans-serif' };
const STATUSES = ['NO_CHANGE', 'PRE_EXISTING_DAMAGE', 'NEW_DAMAGE_BILLABLE', 'DISPUTE_UNDER_REVIEW'];

// A legend entry that is also a filter toggle.
function Key({ color, on, dim, onClick, children, count }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12.5px] font-medium transition-[background-color,border-color,opacity,box-shadow] duration-150 ${on ? 'border-white/30 bg-white/[0.08] text-foreground shadow-[0_0_14px_-4px_rgb(255_255_255/0.4)]' : 'border-transparent text-soft hover:border-line hover:bg-white/[0.04]'} ${dim ? 'opacity-45' : ''}`}>
      <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {children}{count !== undefined && <span className="font-mono text-[11px] text-muted-foreground">{count}</span>}
    </button>
  );
}

// Both charts are filters: click a building's bars or a status slice and the table below follows.
export default function Charts({ summary, filters, onFilter }) {
  const byBuilding = summary.by_building;
  const countOf = (key) => Number(summary.by_status.find((s) => s.key === key)?.value || 0);
  const byStatus = STATUSES.map((s) => ({ key: s, name: STATUS_META[s].label, value: countOf(s) })).filter((d) => d.value > 0);
  const reviewed = byStatus.reduce((n, d) => n + d.value, 0);
  const toggle = (key, value) => onFilter({ [key]: filters[key] === value ? undefined : value });
  const pick = (d, field) => d?.payload?.[field] ?? d?.[field] ?? d?.payload?.payload?.[field];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="panel p-4 sm:p-5">
        <h2 className="font-semibold">Waived vs. billable, by building</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Damage students proved was already there, against new damage charges. Click a building to filter.</p>
        <div className="mt-3 h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byBuilding} margin={{ left: -10, right: 8, top: 6 }} barCategoryGap="28%">
              <defs>
                <linearGradient id="g-waived" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00F0FF" /><stop offset="100%" stopColor="#00F0FF" stopOpacity={0.35} /></linearGradient>
                <linearGradient id="g-billable" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FF2A6D" /><stop offset="100%" stopColor="#FF2A6D" stopOpacity={0.35} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 5" vertical={false} stroke="rgba(170,150,255,0.16)" />
              <XAxis dataKey="building" tick={AXIS} stroke="rgba(170,150,255,0.25)" tickLine={false} />
              <YAxis tickFormatter={(v) => `$${v}`} tick={{ ...AXIS, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }} stroke="transparent" tickLine={false} />
              <Tooltip formatter={(v) => money(v)} cursor={{ fill: 'rgba(0,240,255,0.07)' }} contentStyle={TIP} labelStyle={{ color: '#00F0FF', fontFamily: 'Archivo, sans-serif', fontWeight: 600 }} />
              {[['waived', 'Waived (pre-existing)', 'url(#g-waived)'], ['billable', 'New damage (billable)', 'url(#g-billable)']].map(([key, name, fill]) => (
                <Bar key={key} isAnimationActive={false} dataKey={key} name={name} fill={fill} radius={[4, 4, 0, 0]} cursor="pointer"
                  onClick={(d) => toggle('building', pick(d, 'building'))}>
                  {byBuilding.map((b) => <Cell key={b.building} fillOpacity={filters.building && filters.building !== b.building ? 0.25 : 1} />)}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label="Filter by building">
          {byBuilding.map((b) => (
            <Key key={b.building} color="#9d4edd" on={filters.building === b.building} dim={filters.building && filters.building !== b.building} onClick={() => toggle('building', b.building)}>{b.building}</Key>
          ))}
          <span className="ml-auto flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-[3px] bg-neon" /> Waived</span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-[3px] bg-alert" /> Billable</span>
          </span>
        </div>
      </section>

      <section className="panel p-4 sm:p-5">
        <h2 className="font-semibold">Item statuses</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Every reviewed inspection item. Click a slice to filter.</p>
        <div className="relative mt-3 h-60">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie isAnimationActive={false} data={byStatus} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={3} stroke="#0d0a18" strokeWidth={3} cursor="pointer"
                onClick={(d) => toggle('status', pick(d, 'key'))}>
                {byStatus.map((d) => <Cell key={d.key} fill={STATUS_META[d.key].color} fillOpacity={filters.status && filters.status !== d.key ? 0.22 : 1} />)}
              </Pie>
              <Tooltip contentStyle={TIP} itemStyle={{ color: '#efedf8' }} />
            </PieChart>
          </ResponsiveContainer>
          <p className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
            <span className="font-mono text-3xl font-semibold tabular-nums">{filters.status ? countOf(filters.status) : reviewed}</span>
            <span className="text-[11.5px] text-muted-foreground">{filters.status ? STATUS_META[filters.status]?.short : 'reviewed'}</span>
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Filter by status">
          {byStatus.map((d) => (
            <Key key={d.key} color={STATUS_META[d.key].color} count={d.value} on={filters.status === d.key} dim={filters.status && filters.status !== d.key} onClick={() => toggle('status', d.key)}>{d.name}</Key>
          ))}
        </div>
      </section>
    </div>
  );
}
