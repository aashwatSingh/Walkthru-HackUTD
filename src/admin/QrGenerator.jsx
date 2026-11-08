import { useEffect, useState } from 'react';
import { Plus, Printer } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { Spinner, useToast } from '../components/ui.jsx';
import DoorFlyer from './DoorFlyer.jsx';
import { createUnit, getMyUnits } from '../lib/dbService.js';

// QR codes encode VITE_PUBLIC_SITE_URL when it's set (so codes printed from a laptop open the deployed app),
// otherwise the address this page is on (right on Vercel without any setting).
const SITE = (import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '');

// Where phones will actually land, and whether that can work. A phone can't open the laptop's localhost.
function siteCheck(site) {
  let url;
  try {
    url = new URL(site);
  } catch {
    return { level: 'bad', text: `QR codes point to "${site}", which is not a web address. Fix VITE_PUBLIC_SITE_URL.` };
  }
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname)) {
    return { level: 'bad', text: `QR codes point to ${url.host}: phones can't open that. Deploy the app and print from the deployed site, or set VITE_PUBLIC_SITE_URL to your deployed link.` };
  }
  if (url.protocol !== 'https:') return { level: 'bad', text: `QR codes point to ${url.host} without https: phones won't open the camera there.` };
  if (url.origin !== window.location.origin) return { level: 'info', text: `QR codes open ${url.host}, not this site. Make sure that's your deployed Walkthrough.` };
  return null;
}
const SITE_CHECK = siteCheck(SITE);

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

  const input = 'field mt-1.5';

  return (
    <AppShell wide>
      <div className="space-y-5">
        <div className="no-print">
          <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground">PRINT_QUEUE // DOOR TAGS</p>
          <h1 className="font-heading text-2xl font-bold">Door QR codes</h1>
          <p className="text-sm text-muted-foreground">Print one per room and tape it to the door. Scanning it opens that room's guided inspection.</p>
        </div>

        {!units ? <Spinner /> : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
            <div className="no-print space-y-4">
              <label className="block text-sm font-medium">Room
                <select value={code} onChange={(e) => setCode(e.target.value)} className={input}>
                  {units.map((u) => <option key={u.id} value={u.unit_code}>{u.unit_code}: {u.building_name} {u.room_number} ({u.assigned_student_name})</option>)}
                </select>
              </label>
              <button onClick={() => setCreating(!creating)} className="btn btn-outline"><Plus size={16} /> New unit</button>

              {creating && (
                <form onSubmit={create} className="hud-panel space-y-3 p-4">
                  <label className="block text-sm font-medium">Building name<input required value={form.buildingName} onChange={set('buildingName')} className={input} placeholder="Founders Hall" /></label>
                  <label className="block text-sm font-medium">Room number<input required value={form.roomNumber} onChange={set('roomNumber')} className={input} placeholder="304-B" /></label>
                  <label className="block text-sm font-medium">Assigned student<input required value={form.studentName} onChange={set('studentName')} className={input} placeholder="Alex Rivera" /></label>
                  <label className="block text-sm font-medium">Student email<input required type="email" value={form.studentEmail} onChange={set('studentEmail')} className={input} placeholder="alex@university.edu" /></label>
                  <label className="block text-sm font-medium">Semester<input required value={form.semester} onChange={set('semester')} className={input} /></label>
                  <button disabled={busy} className="btn btn-primary btn-lg w-full">{busy ? 'Creating…' : 'Create unit'}</button>
                  <p className="text-xs text-muted-foreground">The 4-item checklist is added automatically.</p>
                </form>
              )}

              {unit && (
                <>
                  <button onClick={() => window.print()} className="btn btn-primary btn-lg w-full"><Printer size={18} /> Print Door Check-In Flyer</button>
                  <p className="break-all rounded-[3px] border border-purple-500/25 bg-void/60 p-2 font-mono text-[11px] text-[#cfc9e6]">Encodes: {url}</p>
                  {SITE_CHECK && (
                    <p role={SITE_CHECK.level === 'bad' ? 'alert' : 'status'} data-testid="qr-site-check"
                      className={`rounded-[3px] border p-2.5 text-sm ${SITE_CHECK.level === 'bad' ? 'border-amber-400/50 bg-amber-400/10 text-[#ffe3a1]' : 'border-cyan-400/40 bg-cyan-400/[0.07] text-cyan-100'}`}>
                      {SITE_CHECK.text}
                    </p>
                  )}
                </>
              )}
            </div>
            <div>{unit ? <DoorFlyer unit={unit} url={url} /> : <p className="text-muted-foreground">Pick or create a unit to see its QR code.</p>}</div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
