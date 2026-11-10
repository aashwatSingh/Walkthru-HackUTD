import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Hourglass, ListFilter, RefreshCw, Sparkles, Unlock } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { HudClock, Modal, PhaseBadge, Spinner, useToast } from '../components/ui.jsx';
import PhaseTrack from '../components/PhaseTrack.jsx';
import KpiCards from './KpiCards.jsx';
import Charts from './Charts.jsx';
import ItemsTable from './ItemsTable.jsx';
import ComparatorModal from './ComparatorModal.jsx';
import AiReviewPanel from './AiReviewPanel.jsx';
import { getAiReviews, getDashboardRows, getMyUnits, openMoveOut } from '../lib/dbService.js';
import { applyFilters } from '../lib/rules.js';

const LIT = { MOVE_IN_OPEN: '', MOVE_IN_LOCKED: 'violet', MOVE_OUT_OPEN: 'amber', COMPLETED: 'matrix' };

export default function AdminDashboard() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [units, setUnits] = useState([]);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(() => (params.get('unit') ? { unitCode: params.get('unit') } : {}));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [opening, setOpening] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [reviewUnit, setReviewUnit] = useState(null);
  const [aiByItem, setAiByItem] = useState({});
  const roomsRef = useRef(null);
  const tableRef = useRef(null);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = applyFilters(rows, filters);
    return q ? list.filter((r) => `${r.assigned_student_name} ${r.unit_code} ${r.item_name} ${r.zone_category} ${r.building_name}`.toLowerCase().includes(q)) : list;
  }, [rows, filters, search]);
  const openRow = rows.find((r) => r.id === openId);

  const toTable = () => requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  // A filter chosen from a tile, a chart or a room card: apply it and bring the table into view.
  const applyFilter = (patch) => { setFilters((f) => ({ ...f, ...patch })); if (Object.values(patch).some(Boolean)) toTable(); };

  const sync = async () => {
    setSyncing(true);
    try {
      await refresh();
      toast('Dashboard is up to date.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const startMoveOut = async (unit) => {
    setOpening(unit.id);
    try {
      await openMoveOut(unit.id);
      toast(`Move-out opened for ${unit.unit_code}. ${unit.assigned_student_name} can start now.`, 'success');
      await refresh();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setOpening(null);
    }
  };

  if (loading) return <AppShell wide><Spinner label="Loading dashboard…" /></AppShell>;

  return (
    <AppShell wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display text-[30px]">Housing dashboard</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{units.length} rooms · {rows.length} checklist items. The numbers, the charts and the room cards all filter the table.</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="fact hidden items-center gap-2 sm:flex"><span className="live-dot bg-matrix" aria-hidden /> <HudClock /></p>
            <button type="button" onClick={sync} disabled={syncing} className="btn btn-outline btn-sm"><RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Refresh</button>
          </div>
        </div>

        <KpiCards units={units} rows={rows} status={filters.status} onStatus={(status) => applyFilter({ status })}
          onRooms={() => roomsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <Charts rows={rows} filters={filters} onFilter={applyFilter} />

        <section ref={roomsRef} className="panel scroll-mt-20 p-4 sm:p-5">
          <h2 className="mb-3 flex items-baseline justify-between gap-3 font-semibold">Rooms <span className="fact font-normal">{units.length} rooms</span></h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {units.map((u) => {
              const mine = rows.filter((r) => r.unit_id === u.id);
              const selected = filters.unitCode === u.unit_code;
              return (
                <div key={u.id} data-lit={LIT[u.inspection_phase] ?? ''} data-testid="unit-card"
                  className={`flex flex-col gap-3 rounded-xl border p-3.5 transition-[background-color,border-color,box-shadow] duration-200 ${selected ? 'is-on text-foreground' : 'border-line bg-void/50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[16px] font-semibold text-neon">{u.unit_code}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.building_name} · {u.assigned_student_name}</p>
                    </div>
                    <PhaseBadge phase={u.inspection_phase} />
                  </div>
                  <div>
                    <PhaseTrack phase={u.inspection_phase} compact />
                    <p className="fact mt-2">move-in {mine.filter((r) => r.before_media_path).length}/{mine.length} · move-out {mine.filter((r) => r.after_media_path).length}/{mine.length}</p>
                  </div>
                  <div className="relative z-[2] mt-auto flex flex-wrap gap-1.5">
                    {u.inspection_phase === 'MOVE_IN_LOCKED' && <button onClick={() => startMoveOut(u)} disabled={opening === u.id} className="btn btn-sm btn-primary"><Unlock size={13} /> Open move-out</button>}
                    {u.inspection_phase === 'COMPLETED' && <button onClick={() => setReviewUnit(u)} className="btn btn-sm btn-violet"><Sparkles size={13} className="text-lilac" /> Run Nemotron Review</button>}
                    {u.inspection_phase === 'COMPLETED' && <Link to={`/report/${u.unit_code}`} className="btn btn-sm btn-outline"><FileText size={13} /> View report</Link>}
                    {(u.inspection_phase === 'MOVE_IN_OPEN' || u.inspection_phase === 'MOVE_OUT_OPEN') && <span className="flex h-8 items-center gap-1.5 text-[12.5px] text-muted-foreground"><Hourglass size={13} aria-hidden /> Waiting for the student</span>}
                    <button type="button" onClick={() => applyFilter({ unitCode: selected ? undefined : u.unit_code })} aria-pressed={selected} title={selected ? 'Show every room again' : `Show only ${u.unit_code} in the table`}
                      className={`btn btn-sm btn-icon ml-auto size-8 ${selected ? 'btn-tone-cyan' : 'btn-ghost text-muted-foreground'}`} aria-label={`Filter the table to ${u.unit_code}`}><ListFilter size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div ref={tableRef} className="scroll-mt-20">
          <ItemsTable rows={filtered} allRows={rows} filters={filters} setFilters={setFilters} search={search} setSearch={setSearch} onInspect={(r) => setOpenId(r.id)} aiByItem={aiByItem} />
        </div>
      </div>

      {openRow && <ComparatorModal key={openRow.id} row={openRow} rows={filtered} onNavigate={setOpenId} onClose={() => setOpenId(null)} onChanged={refresh} />}
      {reviewUnit && (
        <Modal title={`Nemotron review: ${reviewUnit.unit_code}`} onClose={() => setReviewUnit(null)} wide>
          <AiReviewPanel unit={reviewUnit} rows={rows.filter((r) => r.unit_id === reviewUnit.id)} onApplied={refresh} />
        </Modal>
      )}
    </AppShell>
  );
}
