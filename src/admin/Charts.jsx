import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { STATUS_META, money } from '../lib/format.js';

const TIP = { background: 'rgba(15,12,27,0.95)', border: '1px solid rgba(0,240,255,0.4)', borderRadius: 3, color: '#ece9f7', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 };
const AXIS = { fontSize: 11, fill: '#a29bbd', fontFamily: 'JetBrains Mono, monospace' };
const LEGEND = { fontSize: 12, color: '#a29bbd' };

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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="hud-panel p-4">
        <h2 className="mb-1 font-heading font-semibold">Waived vs. billable, by building</h2>
        <p className="mb-2 text-xs text-muted-foreground">Damage students proved was already there, vs. new damage charges.</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byBuilding} margin={{ left: -10, right: 8 }}>
              <defs>
                <linearGradient id="g-waived" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00F0FF" /><stop offset="100%" stopColor="#9D4EDD" stopOpacity={0.55} /></linearGradient>
                <linearGradient id="g-billable" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FF2A6D" /><stop offset="100%" stopColor="#9D4EDD" stopOpacity={0.55} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="rgba(168,85,247,0.18)" />
              <XAxis dataKey="building" tick={AXIS} stroke="rgba(168,85,247,0.3)" />
              <YAxis tickFormatter={(v) => `$${v}`} tick={AXIS} stroke="rgba(168,85,247,0.3)" />
              <Tooltip formatter={(v) => money(v)} cursor={{ fill: "rgba(0,240,255,0.06)" }} contentStyle={TIP} labelStyle={{ color: "#00F0FF" }} />
              <Legend wrapperStyle={LEGEND} />
              <Bar isAnimationActive={false} dataKey="waived" name="Waived (pre-existing)" fill="url(#g-waived)" radius={[2, 2, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="billable" name="New damage (billable)" fill="url(#g-billable)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="hud-panel p-4">
        <h2 className="mb-1 font-heading font-semibold">Item statuses</h2>
        <p className="mb-2 text-xs text-muted-foreground">All reviewed inspection items.</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie isAnimationActive={false} data={byStatus} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={3} stroke="#0f0c1b" strokeWidth={2} label={{ fill: "#ece9f7", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>
                {byStatus.map((d) => <Cell key={d.key} fill={STATUS_META[d.key].color} />)}
              </Pie>
              <Tooltip contentStyle={TIP} itemStyle={{ color: "#ece9f7" }} />
              <Legend wrapperStyle={LEGEND} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
