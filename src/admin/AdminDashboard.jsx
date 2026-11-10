import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText, Hourglass, ListFilter, RefreshCw, Search, ShieldAlert, Sparkles, TriangleAlert, Unlock } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { HudClock, Modal, PhaseBadge, Spinner, useToast } from '../components/ui.jsx';
import PhaseTrack from '../components/PhaseTrack.jsx';
import KpiCards from './KpiCards.jsx';
import Charts from './Charts.jsx';
import ItemsTable from './ItemsTable.jsx';
import ComparatorModal from './ComparatorModal.jsx';
import AiReviewPanel from './AiReviewPanel.jsx';
import { getAiReviews, getDashboardPage, getDashboardSummary, getInspectionItems, getSetupChecks, getUnitsPage, openMoveOut } from '../lib/dbService.js';

const LIT = { MOVE_IN_OPEN: '', MOVE_IN_LOCKED: 'violet', MOVE_OUT_OPEN: 'amber', COMPLETED: 'matrix' };
const PAGE_SIZE = 50;      // table rows per page
const ROOMS_PER_PAGE = 8;  // room cards per page
const EMPTY = { units: 0, inspected: 0, items: 0, saved: 0, billable: 0, disputes: 0, by_building: [], by_status: [], buildings: [], zones: [], unit_codes: [] };
const mb = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(bytes / 1e6, 0).toFixed(bytes >= 1e7 ? 0 : 1)} MB`);

// The value, a moment after it stops changing (search boxes: one query per pause, not per keystroke).
function useSettled(value, ms = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

// Nothing here loads "everything": totals and chart data are aggregated by the database, the table and the room
// cards are fetched one page at a time, and filters, search and sorting are part of the query.
export default function AdminDashboard() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [summary, setSummary] = useState(EMPTY);
  const [setup, setSetup] = useState({ checks: [], storage: null });
  const [filters, setFilters] = useState(() => (params.get('unit') ? { unitCode: params.get('unit') } : {}));
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);
  const [table, setTable] = useState({ rows: [], total: 0 });
  const [tableLoading, setTableLoading] = useState(true);
  const [rooms, setRooms] = useState({ units: [], total: 0 });
  const [roomSearch, setRoomSearch] = useState('');
  const [roomPage, setRoomPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [opening, setOpening] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [reviewUnit, setReviewUnit] = useState(null);
  const [reviewRows, setReviewRows] = useState(null);
  const [aiByItem, setAiByItem] = useState({});
  const roomsRef = useRef(null);
  const tableRef = useRef(null);
  const tableRun = useRef(0);
  const roomsRun = useRef(0);
  const searchTerm = useSettled(search);
  const roomTerm = useSettled(roomSearch);

  const loadSummary = useCallback(async () => setSummary(await getDashboardSummary()), []);

  const loadTable = useCallback(async () => {
    const run = ++tableRun.current;
    setTableLoading(true);
    try {
      const res = await getDashboardPage({ filters, search: searchTerm, sort, page, pageSize: PAGE_SIZE });
      if (run !== tableRun.current) return; // a newer query is already on its way
      setTable(res);
      getAiReviews(res.rows.map((x) => x.id)).then((reviews) => {
        if (run !== tableRun.current) return;
        const out = {};
        for (const [id, kinds] of Object.entries(reviews)) if (kinds.DAMAGE_DIFF) out[id] = kinds.DAMAGE_DIFF.result;
        setAiByItem(out);
      }).catch(() => {});
    } finally {
      if (run === tableRun.current) setTableLoading(false);
    }
  }, [filters, searchTerm, sort, page]);

  const loadRooms = useCallback(async () => {
    const run = ++roomsRun.current;
    const res = await getUnitsPage({ search: roomTerm, page: roomPage, pageSize: ROOMS_PER_PAGE });
    if (run === roomsRun.current) setRooms(res);
  }, [roomTerm, roomPage]);

  // Everything again, after something changed (a decision, a new move-out, the Refresh button).
  const refresh = useCallback(() => Promise.all([loadSummary(), loadTable(), loadRooms()]), [loadSummary, loadTable, loadRooms]);

  useEffect(() => {
    loadSummary().catch((e) => toast(e.message, 'error')).finally(() => setLoading(false));
    getSetupChecks().then(setSetup).catch(() => {});
  }, [loadSummary, toast]);
  useEffect(() => { loadTable().catch((e) => toast(e.message, 'error')); }, [loadTable, toast]);
  useEffect(() => { loadRooms().catch((e) => toast(e.message, 'error')); }, [loadRooms, toast]);

  // A new filter, search or sort starts again from the first page.
  const changeFilters = (next) => { setFilters(next); setPage(0); };
  const changeSearch = (text) => { setSearch(text); setPage(0); };
  const changeSort = (next) => { setSort(next); setPage(0); };
  const toTable = () => requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  // A filter chosen from a tile, a chart or a room card: apply it and bring the table into view.
  const applyFilter = (patch) => { changeFilters({ ...filters, ...patch }); if (Object.values(patch).some(Boolean)) toTable(); };

  // The Nemotron panel needs every item of its room, whatever page or filter the table is on.
  const loadReviewRows = useCallback(async (unit) => setReviewRows(await getInspectionItems(unit.id)), []);
  useEffect(() => {
    setReviewRows(null);
    if (reviewUnit) loadReviewRows(reviewUnit).catch((e) => toast(e.message, 'error'));
  }, [reviewUnit, loadReviewRows, toast]);

  const sync = async () => {
    setSyncing(true);
    try {
      await refresh();
      getSetupChecks().then(setSetup).catch(() => {});
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

  const openRow = table.rows.find((r) => r.id === openId);
  const roomPages = Math.max(1, Math.ceil(rooms.total / ROOMS_PER_PAGE));
  const bad = setup.checks.filter((c) => c.level === 'bad').length;

  return (
    <AppShell wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display text-[30px]">Housing dashboard</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{summary.units} rooms · {summary.items} checklist items. The numbers, the charts and the room cards all filter the table.</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="fact hidden items-center gap-2 sm:flex"><span className="live-dot bg-matrix" aria-hidden /> <HudClock /></p>
            <button type="button" onClick={sync} disabled={syncing} className="btn btn-outline btn-sm"><RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Refresh</button>
          </div>
        </div>

        {/* Things about this project's setup that are missing or risky. Empty when everything is in place. */}
        {setup.checks.length > 0 && (
          <section className={`rounded-xl border p-4 ${bad ? 'border-alert/50 bg-alert/[0.07]' : 'border-warn/45 bg-warn/[0.07]'}`} aria-label="Setup checks" data-testid="setup-checks">
            <h2 className={`flex items-center gap-2 text-sm font-semibold ${bad ? 'text-blush' : 'text-warn'}`}>
              {bad ? <ShieldAlert size={16} aria-hidden /> : <TriangleAlert size={16} aria-hidden />}
              {bad ? `${bad} setup ${bad === 1 ? 'problem needs' : 'problems need'} attention` : 'Setup notes'}
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm text-soft">
              {setup.checks.map((c) => (
                <li key={c.text} className="flex gap-2.5">
                  <span aria-hidden className={`mt-[7px] size-1.5 shrink-0 rounded-full ${c.level === 'bad' ? 'bg-alert shadow-[0_0_6px_#ff2a6d]' : 'bg-warn'}`} />
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <KpiCards summary={summary} status={filters.status} onStatus={(status) => applyFilter({ status })}
          onRooms={() => roomsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <Charts summary={summary} filters={filters} onFilter={applyFilter} />

        <section ref={roomsRef} className="panel scroll-mt-20 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">Rooms</h2>
            <span className="fact tabular-nums">{rooms.total === summary.units ? `${summary.units} rooms` : `${rooms.total} of ${summary.units} rooms`}</span>
            {summary.units > ROOMS_PER_PAGE && (
              <label className="relative ml-auto w-full max-w-64">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input type="search" value={roomSearch} onChange={(e) => { setRoomSearch(e.target.value); setRoomPage(0); }} placeholder="Room, building or student" aria-label="Search rooms" className="field pl-9 text-sm" />
              </label>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {rooms.units.map((u) => {
              const selected = filters.unitCode === u.unit_code;
              const counted = u.item_count !== undefined;
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
                    {counted && <p className="fact mt-2">move-in {u.before_count}/{u.item_count} · move-out {u.after_count}/{u.item_count}</p>}
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
            {rooms.units.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No rooms match that search.</p>}
          </div>
          {rooms.total > ROOMS_PER_PAGE && (
            <nav className="mt-3 flex items-center justify-end gap-1.5" aria-label="Room pages">
              <button type="button" disabled={roomPage === 0} onClick={() => setRoomPage(roomPage - 1)} className="btn btn-outline btn-sm" aria-label="Earlier rooms"><ChevronLeft size={14} /></button>
              <span className="fact px-1 tabular-nums">{roomPage + 1} / {roomPages}</span>
              <button type="button" disabled={roomPage >= roomPages - 1} onClick={() => setRoomPage(roomPage + 1)} className="btn btn-outline btn-sm" aria-label="Later rooms"><ChevronRight size={14} /></button>
            </nav>
          )}
        </section>

        <div ref={tableRef} className="scroll-mt-20">
          <ItemsTable rows={table.rows} total={table.total} grandTotal={summary.items} page={page} pageSize={PAGE_SIZE} onPage={setPage} loading={tableLoading}
            options={{ buildings: summary.buildings, zones: summary.zones, unitCodes: summary.unit_codes }}
            filters={filters} setFilters={changeFilters} search={search} setSearch={changeSearch} sort={sort} setSort={changeSort}
            onInspect={(r) => setOpenId(r.id)} aiByItem={aiByItem} />
        </div>

        {setup.storage && setup.storage.files > 0 && (
          <p className="fact text-center">
            Storage: {setup.storage.files} files, {mb(setup.storage.bytes)}
            {setup.storage.unreferenced_files > 0 && <> · {setup.storage.unreferenced_files} of them ({mb(setup.storage.unreferenced_bytes)}) are retakes and abandoned uploads that no checklist item points to</>}
          </p>
        )}
      </div>

      {openRow && <ComparatorModal key={openRow.id} row={openRow} rows={table.rows} onNavigate={setOpenId} onClose={() => setOpenId(null)} onChanged={refresh} />}
      {reviewUnit && (
        <Modal title={`Nemotron review: ${reviewUnit.unit_code}`} onClose={() => setReviewUnit(null)} wide>
          {reviewRows
            ? <AiReviewPanel unit={reviewUnit} rows={reviewRows} onApplied={() => Promise.all([refresh(), loadReviewRows(reviewUnit)])} />
            : <Spinner label="Loading the room…" />}
        </Modal>
      )}
    </AppShell>
  );
}
