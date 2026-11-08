import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import AppShell from '../components/AppShell.jsx';
import { PhaseBadge, Spinner, useToast } from '../components/ui.jsx';
import Wizard from './Wizard.jsx';
import StudentSummary from './StudentSummary.jsx';
import { getInspectionItems, getMyUnits, getUnitByCode } from '../lib/dbService.js';

// /inspect/:unitCode: the page a door QR code opens.
export default function InspectPage() {
  const { unitCode } = useParams();
  const { profile } = useAuth();
  const toast = useToast();
  const [unit, setUnit] = useState(undefined); // undefined = loading, null = not yours / not found
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    const u = await getUnitByCode(unitCode);
    const list = u ? await getInspectionItems(u.id) : [];
    setItems(list); // set items BEFORE the unit, so the wizard never renders with an empty checklist
    setUnit(u);
  }, [unitCode]);

  useEffect(() => {
    setUnit(undefined);
    load().catch((e) => { toast(e.message, 'error'); setUnit(null); });
  }, [load, toast]);

  const onItemChanged = (row) => setItems((list) => list.map((i) => (i.id === row.id ? { ...i, ...row } : i)));

  if (profile.role === 'admin') return <Navigate to={`/admin?unit=${encodeURIComponent(unitCode)}`} replace />;

  return (
    <AppShell>
      {unit === undefined && <Spinner label="Loading your room…" />}
      {unit === null && (
        <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-white/10 bg-card p-6 text-center shadow-sm">
          <h1 className="font-heading tracking-tight text-lg font-semibold">This room isn't assigned to you</h1>
          <p className="mt-2 text-sm text-white/75">You're signed in as {profile.email}. Scan the QR code on your own door, or ask housing to check your room assignment.</p>
          <Link to="/my-unit" className="btn btn-primary mt-4">Go to my room</Link>
        </div>
      )}
      {unit && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <p className="text-sm text-muted-foreground">{unit.building_name}</p>
              <h1 className="font-heading tracking-tight text-2xl font-bold">Room {unit.room_number}</h1>
            </div>
            <span className="ml-auto"><PhaseBadge phase={unit.inspection_phase} /></span>
          </div>
          {items.length === 0 ? (
            <p className="rounded-2xl bg-card p-6 text-center text-white/75 shadow-sm">This room has no checklist items yet. Ask housing to check the room setup.</p>
          ) : unit.inspection_phase === 'MOVE_IN_OPEN' || unit.inspection_phase === 'MOVE_OUT_OPEN' ? (
            <Wizard key={unit.inspection_phase} unit={unit} items={items} onItemChanged={onItemChanged} onSubmitted={load} />
          ) : (
            <StudentSummary unit={unit} items={items} onItemChanged={onItemChanged} />
          )}
        </div>
      )}
    </AppShell>
  );
}

// /my-unit: send a student to their own room.
export function MyUnit() {
  const navigate = useNavigate();
  const [none, setNone] = useState(false);
  useEffect(() => {
    getMyUnits().then((u) => (u[0] ? navigate(`/inspect/${u[0].unit_code}`, { replace: true }) : setNone(true))).catch(() => setNone(true));
  }, [navigate]);
  return (
    <AppShell>
      {none ? <p className="mt-10 text-center text-white/75">No room is assigned to your account yet. Ask housing to add you.</p> : <Spinner label="Finding your room…" />}
    </AppShell>
  );
}
