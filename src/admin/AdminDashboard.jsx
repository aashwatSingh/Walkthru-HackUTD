import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Sparkles, Unlock } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { Modal, PhaseBadge, Spinner, useToast } from '../components/ui.jsx';
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
        <h1 className="text-2xl font-bold">Housing dashboard</h1>
        <KpiCards units={units} rows={rows} />
        <Charts rows={rows} />

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Units</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {units.map((u) => (
              <div key={u.id} className="space-y-2 rounded-xl border border-slate-200 p-3" data-testid="unit-card">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-semibold">{u.unit_code}</p><p className="text-xs text-slate-500">{u.building_name} · {u.assigned_student_name}</p></div>
                  <PhaseBadge phase={u.inspection_phase} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {u.inspection_phase === 'MOVE_IN_LOCKED' && <button onClick={() => startMoveOut(u)} className="flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white"><Unlock size={13} /> Open move-out</button>}
                  {u.inspection_phase === 'COMPLETED' && <button onClick={() => setReviewUnit(u)} className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white"><Sparkles size={13} /> Run Nemotron Review</button>}
                  {u.inspection_phase === 'COMPLETED' && <Link to={`/report/${u.unit_code}`} className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium"><FileText size={13} /> View report</Link>}
                  {(u.inspection_phase === 'MOVE_IN_OPEN' || u.inspection_phase === 'MOVE_OUT_OPEN') && <span className="text-xs text-slate-500">Waiting on the student</span>}
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
