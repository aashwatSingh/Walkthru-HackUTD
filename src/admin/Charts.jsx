import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { STATUS_META, money } from '../lib/format.js';

const STATUSES = ['NO_CHANGE', 'PRE_EXISTING_DAMAGE', 'NEW_DAMAGE_BILLABLE', 'DISPUTE_UNDER_REVIEW'];

export default function Charts({ rows }) {
  const byBuilding = Object.values(
    rows.reduce((acc, r) => {
      const b = (acc[r.building_name] ??= { building: r.building_name, waived: 0, billable: 0 });
      b.waived += Number(r.waived_amount || 0);
      b.billable += Number(r.billable_amount || 0);
      return acc;
    }, {}),
  );
  const byStatus = STATUSES.map((s) => ({ key: s, name: STATUS_META[s].label, value: rows.filter((r) => r.condition_status === s).length })).filter((d) => d.value > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold">Waived vs. billable, by building</h2>
        <p className="mb-2 text-xs text-slate-500">Damage students proved was already there, vs. new damage charges.</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byBuilding} margin={{ left: -10, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="building" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
              <Bar isAnimationActive={false} dataKey="waived" name="Waived (pre-existing)" fill={STATUS_META.PRE_EXISTING_DAMAGE.color} radius={[4, 4, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="billable" name="New damage (billable)" fill={STATUS_META.NEW_DAMAGE_BILLABLE.color} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold">Item statuses</h2>
        <p className="mb-2 text-xs text-slate-500">All reviewed inspection items.</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie isAnimationActive={false} data={byStatus} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} label={({ value }) => value}>
                {byStatus.map((d) => <Cell key={d.key} fill={STATUS_META[d.key].color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
