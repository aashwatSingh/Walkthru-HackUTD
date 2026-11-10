import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowRight, Bot, Camera, Check, ChevronDown, Fingerprint, Loader2, Lock, Menu, Pencil, QrCode, RotateCcw, Scale,
  ShieldAlert, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Logo, Reveal, useInView } from '../components/brand.jsx';
import Wipe from '../components/Wipe.jsx';
import { homeFor } from '../lib/rules.js';

// Marketing front door. Every claim here is true of this app, and every demo on it is the real mechanism in
// miniature: the wipe is the admin comparator, the fingerprints are computed in your browser from the real file.

const NAV = [
  { id: 'how-it-works', label: 'How it works' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'nemotron', label: 'Nemotron' },
  { id: 'faq', label: 'FAQ' },
];

const FAQS = [
  { q: 'Can a student upload an old photo from their camera roll?', a: 'No. There is no file picker: photos come from the live camera inside the page, each one is stamped with the room, the item and the time, and the database records when it arrived.' },
  { q: 'Can housing change the evidence after a student submits?', a: 'No. Once an inspection is locked, the database itself rejects edits to the photos, notes and timestamps, from students and admins alike. Every file also gets a SHA-256 fingerprint, so any change would show up.' },
  { q: 'Does the AI decide who pays?', a: 'No. Nemotron suggests a status for each item and explains why. The amount comes from a fixed fee schedule in code, and a housing admin approves every decision. Low-confidence calls are marked for a human.' },
  { q: 'What if a student disagrees with a charge?', a: 'They tap “Dispute this charge” and explain why. Nemotron prepares an evidence brief with both timestamps, and housing resolves it with a written comment the student can see.' },
  { q: 'Is the report legally binding?', a: 'Walkthrough does not replace a lease or the school’s room condition form. It gives both sides an organized, timestamped record to attach to those forms and to any appeal.' },
];

// Which section is on screen, and how far down the page we are (for the header).
function useScrollState(ids) {
  const [state, setState] = useState({ active: '', progress: 0 });
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      let active = '';
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.35) active = id;
      }
      setState({ active, progress: max > 0 ? Math.min(1, window.scrollY / max) : 0 });
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, [ids]);
  return state;
}

const NAV_IDS = NAV.map((n) => n.id);

function SiteHeader() {
  const { profile, mfaVerified } = useAuth();
  const [open, setOpen] = useState(false);
  const { active, progress } = useScrollState(NAV_IDS);
  const signedIn = profile && mfaVerified;
  const cta = signedIn
    ? <Link to={homeFor(profile)} className="btn btn-primary">Open the app <ArrowRight className="size-4" /></Link>
    : <Link to="/login" className="btn btn-primary">Try the demo</Link>;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-void/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-1 text-[13.5px] font-medium md:flex" aria-label="Sections">
          {NAV.map((l) => (
            <a key={l.id} href={`#${l.id}`} aria-current={active === l.id ? 'true' : undefined}
              className={`rounded-md px-3 py-1.5 transition-[background-color,color] duration-150 ${active === l.id ? 'bg-cyan-400/[0.12] text-neon' : 'text-muted-foreground hover:bg-white/[0.05] hover:text-foreground'}`}>{l.label}</a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {!signedIn && <Link to="/login" className="btn btn-ghost">Sign in</Link>}
          {cta}
        </div>
        <button className="btn btn-ghost btn-icon size-10 md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <nav className="animate-fade border-t border-line md:hidden" aria-label="Sections">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-4">
            {NAV.map((l) => (
              <a key={l.id} href={`#${l.id}`} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-lg font-semibold transition-colors hover:bg-cyan-400/10 hover:text-neon">{l.label}</a>
            ))}
            <Link to={signedIn ? homeFor(profile) : '/login'} className="btn btn-primary btn-lg mt-3">{signedIn ? 'Open the app' : 'Try the demo'}</Link>
          </div>
        </nav>
      )}
      {/* how far down the page you are */}
      <span aria-hidden className="absolute bottom-[-1px] left-0 h-px w-full origin-left bg-neon shadow-[0_0_8px_#00f0ff]" style={{ transform: `scaleX(${progress})` }} />
    </header>
  );
}

// The hero artifact: one locked exhibit from a real move-out. Drag the divider, exactly as housing does.
function CaseFile() {
  const [touched, setTouched] = useState(false);
  return (
    <div data-lit className="panel relative mx-auto w-full max-w-lg overflow-hidden shadow-[0_30px_80px_-30px_rgb(0_240_255/0.35)] lg:mr-0">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="min-w-0 truncate text-sm font-semibold"><span className="font-mono text-[12px] text-neon">FH-304B</span> <span className="text-muted-foreground">·</span> Window blinds</p>
        <span className="chip border-matrix/40 bg-matrix/10 text-matrix"><Lock className="size-3" aria-hidden /> Locked</span>
      </div>
      <div className="relative p-3 pb-0">
        <Wipe beforeUrl="/landing/move-in.jpg" afterUrl="/landing/move-out.jpg" beforeAlt="Move-in photo: window blinds, intact" afterAlt="Move-out photo: window blinds, slats broken"
          beforeLabel="Move-in · Aug 18" afterLabel="Move-out · Nov 7" label="Compare the move-in and move-out photo" initial={46} onMove={() => setTouched(true)} />
        {!touched && <p className="pointer-events-none absolute inset-x-0 bottom-3 z-[7] text-center"><span className="rounded-md bg-black/75 px-2.5 py-1 text-[12px] font-medium text-cyan-50">Drag to compare</span></p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <span className="seal"><ShieldCheck className="size-3" aria-hidden /> sha256 · 3f9a1c07</span>
        <span className="seal"><ShieldCheck className="size-3" aria-hidden /> sha256 · b81e44d2</span>
        <span className="fact ml-auto">server clock, both photos</span>
      </div>
      <div className="m-4 rounded-lg border border-violet/35 bg-violet/[0.09] p-3.5">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#ecdfff]"><Sparkles className="size-4 text-lilac" aria-hidden /> Nemotron
          <span className="chip ml-auto border-alert/50 bg-alert/10 text-blush"><span className="chip-dot" aria-hidden />New damage · billable</span>
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-soft">Every slat is intact in the move-in photo. Two are snapped at move-out. The fee schedule prices it at <b className="font-mono text-foreground">$45.00</b>; housing approves.</p>
      </div>
    </div>
  );
}

// ───────── How it works: three stages you can operate ─────────
const DEMO_URL = `${typeof window === 'undefined' ? '' : window.location.origin}/inspect/FH-210A`;

function StageScan() {
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
      <div className="relative mx-auto w-48 -rotate-2 rounded-lg bg-white p-4 text-center text-black shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)]">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-black/60">University Housing</p>
        <p className="text-[15px] font-bold">Door Check-In</p>
        <div className="relative mx-auto my-2 w-fit overflow-hidden">
          <QRCodeSVG value={DEMO_URL} size={132} level="M" marginSize={1} title="QR code for room FH-210A" />
          <span aria-hidden className="animate-scan absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-transparent via-cyan-400/70 to-transparent" />
        </div>
        <p className="font-mono text-[10px] text-black/70">Founders Hall · 210-A</p>
      </div>
      <div className="mx-auto w-full max-w-64 rounded-2xl border border-line bg-void p-3">
        <p className="fact truncate rounded-md bg-white/[0.05] px-2 py-1 text-center">/inspect/<span className="text-neon">FH-210A</span></p>
        <p className="mt-3 text-[15px] font-bold">Room 210-A</p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-soft">
          {['Main door & lock', 'Study desk', 'Window blinds', 'Sink & mirror'].map((n) => (
            <li key={n} className="flex items-center gap-2"><span className="size-3.5 rounded-full border border-line" aria-hidden />{n}</li>
          ))}
        </ul>
        <Link to="/login?next=/inspect/FH-210A" className="btn btn-primary btn-sm mt-3 w-full">Open this checklist <ArrowRight className="size-3.5" /></Link>
      </div>
    </div>
  );
}

function StageShoot() {
  const [state, setState] = useState('live'); // live → held → locked
  const [flash, setFlash] = useState(0);
  const [denied, setDenied] = useState(0);
  const shoot = () => { setFlash((f) => f + 1); setState('held'); };
  return (
    <div className="mx-auto w-full max-w-md">
      <div key={denied} className={`viewfinder scanlines relative overflow-hidden rounded-lg border bg-black ${state === 'locked' ? 'border-matrix/50' : 'border-cyan-400/30'} ${denied ? 'animate-shake' : ''}`}>
        <img src="/landing/move-in.jpg" alt="Window blinds seen through the camera" className={`aspect-[16/10] w-full object-cover transition-[filter] duration-500 ${state === 'live' ? 'saturate-[0.85]' : ''}`} />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] flex items-center justify-between bg-gradient-to-b from-black/85 to-transparent px-3 pb-6 pt-2 font-mono text-[10px] tracking-[0.05em] text-cyan-100/90">
          <span>FH-210A · WINDOW BLINDS</span>
          {state === 'live' && <span className="flex items-center gap-1.5"><span className="live-dot bg-alert" aria-hidden /> LIVE</span>}
          {state === 'held' && <span className="flex items-center gap-1.5 text-neon"><span className="live-dot bg-neon" aria-hidden /> CAPTURED</span>}
          {state === 'locked' && <span className="flex items-center gap-1.5 text-matrix"><Lock className="size-3" aria-hidden /> LOCKED</span>}
        </div>
        {flash > 0 && <span key={flash} aria-hidden className="animate-shutter pointer-events-none absolute inset-0 z-[5] bg-white opacity-0" />}
        {state === 'live' && (
          <button type="button" onClick={shoot} aria-label="Take the photo" className="group absolute bottom-3 left-1/2 z-[6] flex size-14 -translate-x-1/2 items-center justify-center rounded-full border-2 border-cyan-300 shadow-[0_0_20px_rgb(0_240_255/0.5)] transition-transform active:scale-90">
            <span className="size-10 rounded-full bg-neon transition-colors group-hover:bg-white" />
          </button>
        )}
      </div>
      <div className="mt-3 min-h-[5.5rem]" aria-live="polite">
        {state === 'live' && <p className="text-sm text-soft">Press the shutter. There is no upload button: the photo can only come from the live camera.</p>}
        {state === 'held' && (
          <div className="animate-rise flex flex-wrap items-center gap-2">
            <span className="seal"><Fingerprint className="size-3" aria-hidden /> sha256 · 3f9a1c07</span>
            <span className="fact">stamped by the server clock</span>
            <button type="button" onClick={() => setState('locked')} className="btn btn-primary btn-sm ml-auto"><Lock className="size-3.5" /> Lock &amp; submit</button>
          </div>
        )}
        {state === 'locked' && (
          <div className="animate-rise space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setDenied((d) => d + 1)} className="btn btn-danger btn-sm"><Pencil className="size-3.5" /> Try to edit it</button>
              <button type="button" onClick={() => { setState('live'); setDenied(0); }} className="btn btn-ghost btn-sm text-muted-foreground"><RotateCcw className="size-3.5" /> Start over</button>
            </div>
            {denied > 0
              ? <p key={denied} className="animate-rise rounded-md border border-alert/50 bg-alert/10 px-3 py-2 text-sm text-[#ffd0dd]"><b>Rejected by the database.</b> Locked evidence cannot be edited, by the student or by housing.</p>
              : <p className="text-sm text-soft">Locked. From here on, nobody can change the photo, the note or the time.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function StageReview() {
  const [decision, setDecision] = useState(null); // null | 'billable' | 'waived'
  return (
    <div className="mx-auto w-full max-w-md rounded-lg border border-violet/35 bg-violet/[0.08] p-4">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#ecdfff]"><Sparkles className="size-4 text-lilac" aria-hidden /> Nemotron suggests
        <span className="chip ml-auto border-alert/50 bg-alert/10 text-blush"><span className="chip-dot" aria-hidden />New damage · billable</span>
      </p>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="flex gap-[3px]" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => <span key={i} className={`h-2.5 w-2 rounded-[2px] ${i < 9 ? 'bg-neon shadow-[0_0_6px_rgb(0_240_255/0.5)]' : 'bg-violet/20'}`} style={i < 9 ? { opacity: 1 - i * 0.06 } : undefined} />)}
        </span>
        <span className="fact text-soft">92% confident</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-soft">Two bottom slats are snapped. They are intact in the move-in photo.</p>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md border border-line bg-void/60 p-3 font-mono text-[12px]">
        <dt className="text-muted-foreground">Fee schedule, window blinds</dt><dd className="text-right">$45.00</dd>
        <dt className="text-muted-foreground">Severity, moderate</dt><dd className="text-right">× 1.0</dd>
        <dt className="border-t border-line pt-1 font-sans text-[12.5px] font-semibold text-foreground">Computed by code, not the model</dt><dd className="border-t border-line pt-1 text-right font-semibold text-blush">$45.00</dd>
      </dl>
      <div className="mt-3 min-h-10" aria-live="polite">
        {decision === null ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDecision('billable')} className="btn btn-tone-rose btn-sm">Approve $45.00</button>
            <button type="button" onClick={() => setDecision('waived')} className="btn btn-tone-cyan btn-sm">Waive it</button>
            <span className="fact self-center">a person decides</span>
          </div>
        ) : (
          <p className="animate-rise flex flex-wrap items-center gap-2 text-sm">
            <Check className={`size-4 ${decision === 'billable' ? 'text-blush' : 'text-neon'}`} aria-hidden />
            <b>{decision === 'billable' ? 'Approved by housing: $45.00 billable.' : 'Waived by housing: no charge.'}</b>
            <button type="button" onClick={() => setDecision(null)} className="btn btn-ghost btn-sm ml-auto text-muted-foreground"><RotateCcw className="size-3.5" /> Undo</button>
          </p>
        )}
      </div>
    </div>
  );
}

const STEPS = [
  { icon: QrCode, title: 'Scan the door', body: 'Housing tapes a QR code to every door. Scanning it opens that room’s checklist on the student’s phone, no app to install.', Stage: StageScan },
  { icon: Camera, title: 'Photograph and lock', body: 'A guided live camera walks through each item. Lock & Submit stamps everything with server time, and from then on nobody can change it.', Stage: StageShoot },
  { icon: Bot, title: 'Nemotron reviews', body: 'At move-out an NVIDIA Nemotron agent compares every photo pair and suggests a status. A fee schedule sets the money; housing approves.', Stage: StageReview },
];
const AUTO_MS = 7000;

function HowItWorks() {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const [ref, seen] = useInView(0.3);
  useEffect(() => {
    if (!auto || !seen) return undefined;
    const id = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), AUTO_MS);
    return () => clearTimeout(id);
  }, [auto, seen, step]);
  const { Stage } = STEPS[step];
  return (
    <div ref={ref} className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
      <ol className="space-y-2" role="tablist" aria-label="How it works">
        {STEPS.map((s, i) => {
          const on = i === step;
          return (
            <li key={s.title}>
              <button type="button" role="tab" aria-selected={on} data-lit onClick={() => { setAuto(false); setStep(i); }}
                className={`relative block w-full overflow-hidden rounded-xl border p-5 text-left transition-[background-color,border-color] duration-200 ${on ? 'border-cyan-400/50 bg-cyan-400/[0.07]' : 'border-line bg-void/40 hover:border-cyan-400/30'}`}>
                <span className="flex items-center gap-3">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-semibold transition-colors duration-200 ${on ? 'border-cyan-400/60 bg-cyan-400/15 text-neon' : 'border-line text-muted-foreground'}`}>{i + 1}</span>
                  <span className="text-xl font-bold">{s.title}</span>
                  <s.icon className={`ml-auto size-5 shrink-0 transition-colors ${on ? 'text-neon' : 'text-muted-foreground'}`} aria-hidden />
                </span>
                <span className={`mt-2 block leading-relaxed ${on ? 'text-soft' : 'text-muted-foreground'}`}>{s.body}</span>
                {on && auto && seen && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-neon" style={{ animation: `fill-x ${AUTO_MS}ms linear both` }} />}
              </button>
            </li>
          );
        })}
      </ol>
      <div role="tabpanel" aria-label={STEPS[step].title} onPointerDown={() => setAuto(false)} onKeyDown={() => setAuto(false)}
        className="panel flex min-h-[26rem] items-center p-5 sm:p-8">
        <div key={step} className="animate-rise w-full"><Stage /></div>
      </div>
    </div>
  );
}

// ───────── Fingerprint lab: real SHA-256 of the real file, in your browser ─────────
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function HashLine({ value, against }) {
  if (!value) return <span className="text-muted-foreground">computing…</span>;
  return (
    <span className="break-all">
      {value.match(/.{8}/g).map((group, g) => (
        <span key={g} className="mr-1.5 inline-block">
          {[...group].map((c, i) => {
            const changed = against && against[g * 8 + i] !== c;
            return <span key={i} className={changed ? 'text-blush' : ''}>{c}</span>;
          })}
        </span>
      ))}
    </span>
  );
}

function FingerprintLab() {
  const [bytes, setBytes] = useState(null);
  const [original, setOriginal] = useState('');
  const [current, setCurrent] = useState('');
  const [tampered, setTampered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!globalThis.crypto?.subtle) throw new Error('no crypto');
      const buf = await (await fetch('/landing/move-out.jpg')).arrayBuffer();
      const sha = hex(await crypto.subtle.digest('SHA-256', buf));
      if (!live) return;
      setBytes(new Uint8Array(buf));
      setOriginal(sha);
      setCurrent(sha);
    })().catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);

  const toggle = async () => {
    if (!bytes) return;
    const next = !tampered;
    const copy = bytes.slice();
    if (next) copy[copy.length - 64] ^= 1; // one bit, in the image data
    setTampered(next);
    setCurrent('');
    setCurrent(hex(await crypto.subtle.digest('SHA-256', copy)));
  };

  const match = current && current === original;
  return (
    <div data-lit={tampered ? 'rose' : undefined} className={`panel overflow-hidden transition-[border-color] duration-300 ${tampered ? 'border-alert/50' : ''}`}>
      <div className="viewfinder scanlines relative border-b border-line bg-black">
        <img src="/landing/move-out.jpg" alt="Move-out photo of window blinds with broken slats" className="aspect-[16/9] w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] flex justify-between bg-gradient-to-b from-black/85 to-transparent px-3 pb-6 pt-2 font-mono text-[10px] tracking-[0.05em] text-cyan-100/90">
          <span>FH-304B · WINDOW BLINDS · MOVE-OUT</span><span>{bytes ? `${(bytes.length / 1024).toFixed(0)} KB` : ''}</span>
        </div>
        {tampered && <span aria-hidden className="absolute bottom-6 right-8 z-[5] size-2.5 rounded-full bg-alert shadow-[0_0_14px_4px_rgb(255_42_109/0.7)]" />}
      </div>
      <div className="space-y-3 p-4">
        {failed ? (
          <p className="text-sm text-muted-foreground">Fingerprints are computed with your browser’s cryptography, which needs an https:// page.</p>
        ) : (
          <>
            <dl className="space-y-2 font-mono text-[11.5px] leading-relaxed">
              <div><dt className="kicker">Registered by the server at upload</dt><dd className="mt-0.5 text-cyan-100"><HashLine value={original} /></dd></div>
              <div><dt className="kicker">The file right now</dt><dd className="mt-0.5 text-cyan-100" aria-live="polite"><HashLine value={current} against={original} /></dd></div>
            </dl>
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
              {current && (match
                ? <span key="ok" className="animate-tick chip border-cyan-400/50 bg-cyan-400/10 py-1 text-neon"><ShieldCheck className="size-3.5" aria-hidden /> Fingerprint matches upload</span>
                : <span key="bad" className="animate-tick chip border-alert/60 bg-alert/15 py-1 text-blush"><ShieldAlert className="size-3.5" aria-hidden /> Mismatch: file changed since upload</span>)}
              <button type="button" onClick={toggle} disabled={!bytes} className={`btn btn-sm ml-auto ${tampered ? 'btn-outline' : 'btn-danger'}`}>
                {tampered ? <><RotateCcw className="size-3.5" /> Put it back</> : <><Pencil className="size-3.5" /> Change one bit of the file</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ───────── The agent trace, played back ─────────
const TRACE = [
  ['Round 1', [['list_items', '', '4 items loaded', '180ms']]],
  ['Round 2 · in parallel', [['compare_photos', 'door', 'no change', '3.1s'], ['compare_photos', 'desk', 'pre-existing', '3.4s'], ['compare_photos', 'blinds', 'new damage', '2.9s'], ['compare_photos', 'sink', 'disputed', '3.2s']]],
  ['Round 3 · in parallel', [['get_dispute_evidence', 'sink', 'both timestamps', '40ms'], ['calculate_fee', 'blinds', '$45.00 from schedule', '12ms']]],
  ['Round 4', [['submit_review', '', 'summary + dispute brief', '1.8s']]],
];
const TRACE_TOTAL = TRACE.reduce((n, [, calls]) => n + calls.length, 0);

function AgentTrace() {
  const [ref, seen] = useInView(0.35);
  const [n, setN] = useState(() => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? TRACE_TOTAL + 1 : 0));
  useEffect(() => {
    if (!seen || n > TRACE_TOTAL) return undefined;
    const id = setTimeout(() => setN((x) => x + 1), n === 0 ? 300 : 430);
    return () => clearTimeout(id);
  }, [seen, n]);
  let index = 0;
  return (
    <div ref={ref} className="term overflow-hidden" aria-label="Example agent trace">
      <div className="flex items-center justify-between gap-3 border-b border-cyan-500/20 bg-cyan-400/[0.04] px-4 py-2 text-[11.5px] text-cyan-100">
        <span className="flex items-center gap-2">{n <= TRACE_TOTAL ? <Loader2 className="size-3.5 animate-spin text-neon" aria-hidden /> : <Check className="size-3.5 text-matrix" aria-hidden />} nemotron.trace · FH-304B</span>
        <button type="button" onClick={() => setN(0)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-neon transition-colors hover:bg-cyan-400/10"><RotateCcw className="size-3" aria-hidden /> Replay</button>
      </div>
      <div className="min-h-[20.5rem] space-y-3 overflow-x-auto p-4 text-[12px]">
        {TRACE.map(([head, calls]) => {
          const first = index;
          if (n <= first) { index += calls.length; return null; }
          return (
            <div key={head} className="animate-line">
              <p className="font-semibold text-lilac">{head}</p>
              {calls.map(([tool, arg, note, ms]) => {
                const i = index++;
                if (n <= i) return null;
                const running = n === i + 1 && n <= TRACE_TOTAL;
                return (
                  <p key={tool + arg} className="animate-line flex items-center gap-2 whitespace-nowrap py-px text-[#d6d1ea]">
                    <span className="text-violet/80" aria-hidden>›</span>
                    <span><span className="font-semibold text-neon">{tool}</span><span className="text-cyan-100/70">({arg})</span></span>
                    <span className="flex-1 text-muted-foreground">{running ? '' : note}</span>
                    <span className="text-muted-foreground">{running ? '' : ms}</span>
                    {running ? <Loader2 className="size-3.5 animate-spin text-neon" aria-hidden /> : <Check className="size-3.5 text-matrix" aria-label="ok" />}
                  </p>
                );
              })}
            </div>
          );
        })}
        {n > TRACE_TOTAL && <p className="animate-line text-matrix">review complete · {TRACE_TOTAL} tool calls · every step logged</p>}
      </div>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="mt-8 divide-y divide-line border-y border-line">
      {FAQS.map((f, i) => {
        const on = open === i;
        return (
          <div key={f.q}>
            <h3>
              <button type="button" aria-expanded={on} aria-controls={`faq-${i}`} onClick={() => setOpen(on ? -1 : i)}
                className={`flex w-full items-center justify-between gap-4 py-5 text-left text-lg font-semibold transition-colors hover:text-neon sm:text-xl ${on ? 'text-neon' : ''}`}>
                {f.q}
                <ChevronDown className={`size-5 shrink-0 transition-transform duration-300 ${on ? 'rotate-180 text-neon' : 'text-muted-foreground'}`} aria-hidden />
              </button>
            </h3>
            <div id={`faq-${i}`} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-expo ${on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden"><p className="max-w-[65ch] pb-5 leading-relaxed text-soft">{f.a}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PROOFS = [
  [Lock, 'Locked by the database', 'After submit, Postgres rejects every edit to photos, notes and timestamps, from students and admins alike.'],
  [Fingerprint, 'Fingerprinted by the server', 'The server computes a SHA-256 hash of every file at upload. Housing’s screen re-hashes it and shows the match.'],
  [Camera, 'Live camera only', 'No camera-roll uploads. Each photo is taken in the page and stamped with room, item and time.'],
  [Scale, 'One-tap disputes', 'Students dispute a charge with a reason. Their locked move-in photo is attached automatically.'],
];

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="relative flex-1 overflow-x-clip">
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-5 pb-20 pt-12 sm:px-8 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div className="animate-rise">
            <p className="mb-6 inline-flex items-center gap-2 rounded-md border border-cyan-400/35 bg-cyan-400/[0.08] px-2.5 py-1 text-[12.5px] font-semibold text-neon">
              <span className="live-dot bg-neon" aria-hidden /> Move-in and move-out proof for students
            </p>
            <h1 className="display text-[clamp(2.35rem,5.6vw,4.6rem)]">
              Don’t pay for damage you <span className="text-neon">didn’t do.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-soft sm:text-xl">
              Scan the QR code on your door, photograph each item, and lock it. After that, nobody can change it. Not even housing.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/login" className="btn btn-primary btn-xl">Try the demo <ArrowRight className="size-5" /></Link>
              <a href="#how-it-works" className="btn btn-outline btn-xl">See how it works</a>
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-7 gap-y-2 text-[13.5px] text-soft">
              <li className="flex items-center gap-2"><Check className="size-4 text-neon" aria-hidden /> Server-clock timestamps</li>
              <li className="flex items-center gap-2"><Check className="size-4 text-neon" aria-hidden /> SHA-256 per file</li>
              <li className="flex items-center gap-2"><Check className="size-4 text-neon" aria-hidden /> Reviewed by NVIDIA Nemotron</li>
            </ul>
          </div>
          <div className="animate-rise [animation-delay:140ms]"><CaseFile /></div>
        </section>

        {/* How it works: a real three-step sequence, each stage operable */}
        <section id="how-it-works" className="scroll-mt-20 border-y border-line bg-obsidian/70">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <Reveal>
              <h2 className="display max-w-3xl text-[clamp(1.9rem,4vw,3.1rem)]">Three steps. Zero surprise fines.</h2>
              <p className="mt-3 max-w-xl text-soft">Each step below works. Press the shutter, lock it, then try to change it.</p>
            </Reveal>
            <HowItWorks />
          </div>
        </section>

        {/* Evidence: the fingerprint, demonstrated on the real file */}
        <section id="evidence" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <Reveal><FingerprintLab /></Reveal>
            <Reveal delay={120}>
              <h2 className="display text-[clamp(1.9rem,4vw,3.1rem)]">Evidence that holds up.</h2>
              <p className="mt-3 max-w-lg text-soft">Those fingerprints are computed right now, in your browser, from that photo. Change a single bit and the whole value changes.</p>
              <dl className="mt-7 space-y-1">
                {PROOFS.map(([Icon, title, body]) => (
                  <div key={title} data-lit className="group flex gap-4 rounded-xl border border-transparent p-3 transition-colors hover:bg-white/[0.02]">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line text-muted-foreground transition-colors duration-200 group-hover:border-cyan-400/50 group-hover:bg-cyan-400/10 group-hover:text-neon"><Icon className="size-5" aria-hidden /></span>
                    <div><dt className="font-semibold">{title}</dt><dd className="mt-0.5 text-soft">{body}</dd></div>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        {/* NVIDIA Nemotron */}
        <section id="nemotron" className="scroll-mt-20 border-y border-line bg-obsidian/70">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.15fr]">
            <Reveal>
              <p className="mb-5 inline-flex items-center gap-2 text-[13px] font-semibold text-lilac"><Bot className="size-4" aria-hidden /> Powered by NVIDIA Nemotron</p>
              <h2 className="display text-[clamp(1.9rem,4vw,3.1rem)]">An inspection agent, not a chatbot.</h2>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-soft">At move-out, Nemotron decides what to look at, compares every photo pair with its vision model, pulls the dispute evidence, prices damage from the fee schedule and writes the summary. Housing sees every step.</p>
              <ul className="mt-7 space-y-4 text-soft">
                <li className="flex gap-3"><Camera className="mt-0.5 size-5 shrink-0 text-lilac" aria-hidden /><span><b className="text-foreground">A coach while you shoot.</b> After each photo it checks framing, light and focus, and suggests a retake if needed.</span></li>
                <li className="flex gap-3"><Scale className="mt-0.5 size-5 shrink-0 text-lilac" aria-hidden /><span><b className="text-foreground">Nemotron proposes. Code computes. Humans decide.</b> The model never sets a fine; an admin approves every status.</span></li>
              </ul>
            </Reveal>
            <Reveal delay={120}><AgentTrace /></Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-4xl scroll-mt-20 px-5 py-20 sm:px-8">
          <Reveal><h2 className="display text-[clamp(1.9rem,4vw,3.1rem)]">Questions?</h2></Reveal>
          <Faq />
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
          <Reveal>
            <div className="viewfinder relative overflow-hidden rounded-2xl border border-cyan-400/35 bg-obsidian px-6 py-14 text-center sm:px-16 sm:py-20">
              <h2 className="display text-[clamp(2rem,4.6vw,3.6rem)]">Moving in soon? <span className="text-neon">Document it today.</span></h2>
              <p className="mx-auto mt-5 max-w-lg text-lg text-soft">The best time to stop a fine is before you unpack your first box.</p>
              <Link to="/login" className="btn btn-primary btn-xl relative z-[2] mt-9"><ShieldCheck className="size-5" /> Try the demo</Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center sm:px-8">
          <Logo />
          <p className="fact">Built at HackUTD 2026 · Powered by NVIDIA Nemotron</p>
        </div>
      </footer>
    </div>
  );
}
