import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Plus, Printer, QrCode, X } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { PhaseBadge, Spinner, useToast } from '../components/ui.jsx';
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getMyUnits().then((u) => { setUnits(u); setCode(u[0]?.unit_code || ''); }).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  const unit = units?.find((u) => u.unit_code === code);
  const url = unit ? `${SITE}/inspect/${unit.unit_code}` : '';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast(url, 'info');
    }
  };

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
          <h1 className="display text-[30px]">Door QR codes</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Print one per room and tape it to the door. Scanning it opens that room's guided inspection.</p>
        </div>

        {!units ? <Spinner /> : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
            <div className="no-print space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Room</h2>
                  <button onClick={() => setCreating(!creating)} aria-expanded={creating} className={`btn btn-sm ${creating ? 'btn-tone-cyan' : 'btn-outline'}`}>{creating ? <X size={14} /> : <Plus size={14} />} New unit</button>
                </div>
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1" role="radiogroup" aria-label="Room">
                  {units.map((u) => {
                    const on = u.unit_code === code;
                    return (
                      <button key={u.id} type="button" role="radio" aria-checked={on} data-lit onClick={() => setCode(u.unit_code)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] duration-150 ${on ? 'is-on' : 'border-line bg-obsidian hover:bg-royal'}`}>
                        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${on ? 'border-cyan-400/60 bg-cyan-400/15 text-neon' : 'border-line text-muted-foreground'}`}><QrCode size={16} aria-hidden /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[14px] font-semibold text-neon">{u.unit_code}</span>
                          <span className="block truncate text-xs text-muted-foreground">{u.building_name} {u.room_number} · {u.assigned_student_name}</span>
                        </span>
                        <PhaseBadge phase={u.inspection_phase} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {creating && (
                <form onSubmit={create} className="panel animate-pop space-y-3 p-4">
                  <label className="label">Building name<input required value={form.buildingName} onChange={set('buildingName')} className={input} placeholder="Founders Hall" /></label>
                  <label className="label">Room number<input required value={form.roomNumber} onChange={set('roomNumber')} className={input} placeholder="304-B" /></label>
                  <label className="label">Assigned student<input required value={form.studentName} onChange={set('studentName')} className={input} placeholder="Alex Rivera" /></label>
                  <label className="label">Student email<input required type="email" value={form.studentEmail} onChange={set('studentEmail')} className={input} placeholder="alex@university.edu" /></label>
                  <label className="label">Semester<input required value={form.semester} onChange={set('semester')} className={input} /></label>
                  <button disabled={busy} className="btn btn-primary btn-lg w-full">{busy ? <><Loader2 size={17} className="animate-spin" /> Creating…</> : 'Create unit'}</button>
                  <p className="text-xs text-muted-foreground">The 4-item checklist is added automatically.</p>
                </form>
              )}

              {unit && (
                <>
                  <button onClick={() => window.print()} className="btn btn-primary btn-lg w-full"><Printer size={18} /> Print Door Check-In Flyer</button>
                  <div className="well space-y-2 p-2.5">
                    <p className="break-all font-mono text-[11.5px] text-soft">Encodes: {url}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={copy} className="btn btn-sm btn-outline flex-1">{copied ? <Check size={14} className="text-matrix" /> : <Copy size={14} />} {copied ? 'Link copied' : 'Copy link'}</button>
                      <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline flex-1"><ExternalLink size={14} /> Open it</a>
                    </div>
                  </div>
                  {SITE_CHECK && (
                    <p role={SITE_CHECK.level === 'bad' ? 'alert' : 'status'} data-testid="qr-site-check"
                      className={`rounded-lg border p-2.5 text-sm ${SITE_CHECK.level === 'bad' ? 'border-warn/50 bg-warn/10 text-[#ffe3a1]' : 'border-cyan-400/40 bg-cyan-400/[0.07] text-cyan-50'}`}>
                      {SITE_CHECK.text}
                    </p>
                  )}
                </>
              )}
            </div>
            <div key={code} className="animate-rise">{unit ? <DoorFlyer unit={unit} url={url} /> : <p className="text-muted-foreground">Pick or create a unit to see its QR code.</p>}</div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
