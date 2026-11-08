import { useEffect, useState } from 'react';
import { Plus, Printer } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { Spinner, useToast } from '../components/ui.jsx';
import DoorFlyer from './DoorFlyer.jsx';
import { createUnit, getMyUnits } from '../lib/dbService.js';

// QR codes encode VITE_PUBLIC_SITE_URL (not window.location) so a code printed from localhost still works at the venue.
const SITE = (import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '');

const blank = { buildingName: '', roomNumber: '', semester: 'Fall 2026', studentName: '', studentEmail: '' };

export default function QrGenerator() {
  const toast = useToast();
  const [units, setUnits] = useState(null);
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMyUnits().then((u) => { setUnits(u); setCode(u[0]?.unit_code || ''); }).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  const unit = units?.find((u) => u.unit_code === code);
  const url = unit ? `${SITE}/inspect/${unit.unit_code}` : '';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await createUnit(form);
      setUnits((list) => [...list, u].sort((a, b) => a.unit_code.localeCompare(b.unit_code)));
      setCode(u.unit_code);
      setCreating(false);
      setForm(blank);
      toast(`Created ${u.unit_code} with its checklist.`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';

  return (
    <AppShell wide>
      <div className="space-y-5">
        <div className="no-print">
          <h1 className="text-2xl font-bold">Door QR codes</h1>
          <p className="text-sm text-slate-500">Print one per room and tape it to the door. Scanning it opens that room's guided inspection.</p>
        </div>

        {!units ? <Spinner /> : (
          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <div className="no-print space-y-4">
              <label className="block text-sm font-medium">Room
                <select value={code} onChange={(e) => setCode(e.target.value)} className={input}>
                  {units.map((u) => <option key={u.id} value={u.unit_code}>{u.unit_code}: {u.building_name} {u.room_number} ({u.assigned_student_name})</option>)}
                </select>
              </label>
              <button onClick={() => setCreating(!creating)} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium"><Plus size={16} /> New unit</button>

              {creating && (
                <form onSubmit={create} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <label className="block text-sm font-medium">Building name<input required value={form.buildingName} onChange={set('buildingName')} className={input} placeholder="Founders Hall" /></label>
                  <label className="block text-sm font-medium">Room number<input required value={form.roomNumber} onChange={set('roomNumber')} className={input} placeholder="304-B" /></label>
                  <label className="block text-sm font-medium">Assigned student<input required value={form.studentName} onChange={set('studentName')} className={input} placeholder="Alex Rivera" /></label>
                  <label className="block text-sm font-medium">Student email<input required type="email" value={form.studentEmail} onChange={set('studentEmail')} className={input} placeholder="alex@university.edu" /></label>
                  <label className="block text-sm font-medium">Semester<input required value={form.semester} onChange={set('semester')} className={input} /></label>
                  <button disabled={busy} className="w-full rounded-xl bg-slate-900 py-2.5 font-medium text-white">{busy ? 'Creating…' : 'Create unit'}</button>
                  <p className="text-xs text-slate-500">The 4-item checklist is added automatically.</p>
                </form>
              )}

              {unit && (
                <>
                  <button onClick={() => window.print()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white"><Printer size={18} /> Print Door Check-In Flyer</button>
                  <p className="break-all rounded-lg bg-slate-100 p-2 text-xs text-slate-600">Encodes: {url}</p>
                </>
              )}
            </div>
            <div>{unit ? <DoorFlyer unit={unit} url={url} /> : <p className="text-slate-500">Pick or create a unit to see its QR code.</p>}</div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
