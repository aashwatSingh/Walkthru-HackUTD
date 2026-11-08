import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Sparkles, Unlock } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { HudClock, Modal, PhaseBadge, Spinner, useToast } from '../components/ui.jsx';
import KpiCards from './KpiCards.jsx';
import Charts from './Charts.jsx';
import ItemsTable from './ItemsTable.jsx';
import ComparatorModal from './ComparatorModal.jsx';
import AiReviewPanel from './AiReviewPanel.jsx';
import { getAiReviews, getDashboardRows, getMyUnits, openMoveOut } from '../lib/dbService.js';
import { applyFilters } from '../lib/rules.js';

export default function AdminDashboard() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [units, setUnits] = useState([]);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(() => (params.get('unit') ? { unitCode: params.get('unit') } : {}));
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [reviewUnit, setReviewUnit] = useState(null);
  const [aiByItem, setAiByItem] = useState({});

  const refresh = useCallback(async () => {
    const [u, r] = await Promise.all([getMyUnits(), getDashboardRows()]);
    setUnits(u);
    setRows(r);
    getAiReviews(r.map((x) => x.id)).then((reviews) => {
      const out = {};
      for (const [id, kinds] of Object.entries(reviews)) if (kinds.DAMAGE_DIFF) out[id] = kinds.DAMAGE_DIFF.result;
      setAiByItem(out);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refresh().catch((e) => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [refresh, toast]);

  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const openRow = rows.find((r) => r.id === openId);

  const startMoveOut = async (unit) => {
    try {
      await openMoveOut(unit.id);
      toast(`Move-out opened for ${unit.unit_code}. ${unit.assigned_student_name} can start now.`, 'success');
      await refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (loading) return <AppShell wide><Spinner label="Loading dashboard…" /></AppShell>;

  return (
    <AppShell wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground">OPS_CONSOLE // UNIVERSITY HOUSING</p>
            <h1 className="font-heading text-2xl font-bold">Housing dashboard</h1>
          </div>
          <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground"><span className="live-dot bg-[#00FF9D]" aria-hidden /> SYNC // <HudClock /></p>
        </div>
        <KpiCards units={units} rows={rows} />
        <Charts rows={rows} />

        <section className="hud-panel p-4">
          <h2 className="mb-3 flex items-center justify-between font-heading font-semibold">Units <span className="font-mono text-[11px] font-normal text-muted-foreground">{units.length} ON_GRID</span></h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {units.map((u) => (
              <div key={u.id} className="hud-hover space-y-2.5 rounded-[3px] border border-purple-500/20 bg-void/50 p-3" data-testid="unit-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-mono text-[15px] font-semibold text-neon">{u.unit_code}</p><p className="truncate text-xs text-muted-foreground">{u.building_name} · {u.assigned_student_name}</p></div>
                </div>
                <div>
                  <PhaseBadge phase={u.inspection_phase} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {u.inspection_phase === 'MOVE_IN_LOCKED' && <button onClick={() => startMoveOut(u)} className="btn btn-sm btn-primary"><Unlock size={13} /> Open move-out</button>}
                  {u.inspection_phase === 'COMPLETED' && <button onClick={() => setReviewUnit(u)} className="btn btn-sm border-purple-500/50 bg-purple-500/15 text-[#e4d6ff] hover:border-violet-400 hover:bg-purple-500/25 hover:shadow-[0_0_14px_rgb(157_78_221/0.4)]"><Sparkles size={13} className="text-violet-400" /> Run Nemotron Review</button>}
                  {u.inspection_phase === 'COMPLETED' && <Link to={`/report/${u.unit_code}`} className="btn btn-sm btn-outline"><FileText size={13} /> View report</Link>}
                  {(u.inspection_phase === 'MOVE_IN_OPEN' || u.inspection_phase === 'MOVE_OUT_OPEN') && <span className="font-mono text-[11px] text-muted-foreground">AWAITING_STUDENT…</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <ItemsTable rows={filtered} allRows={rows} filters={filters} setFilters={setFilters} onInspect={(r) => setOpenId(r.id)} aiByItem={aiByItem} />
      </div>

      {openRow && <ComparatorModal row={openRow} onClose={() => setOpenId(null)} onChanged={refresh} />}
      {reviewUnit && (
        <Modal title={`Nemotron review: ${reviewUnit.unit_code}`} onClose={() => setReviewUnit(null)} wide>
          <AiReviewPanel unit={reviewUnit} rows={rows.filter((r) => r.unit_id === reviewUnit.id)} onApplied={refresh} />
        </Modal>
      )}
    </AppShell>
  );
}
