import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bot, Camera, ChevronDown, Fingerprint, Lock, Menu, QrCode, Scale, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Logo, Reveal } from '../components/brand.jsx';
import { HudClock } from '../components/ui.jsx';
import { homeFor } from '../lib/rules.js';

// Marketing front door. Every claim here is true of this app.

const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#evidence', label: 'Evidence' },
  { href: '#nemotron', label: 'Nemotron' },
  { href: '#faq', label: 'FAQ' },
];

const STEPS = [
  { icon: QrCode, title: 'Scan the door', body: 'Housing tapes a QR code to every door. Scanning it opens that room’s checklist on the student’s phone, no app to install.', code: 'QR → /inspect/FH-210A' },
  { icon: Camera, title: 'Photograph and lock', body: 'A guided live camera walks through each item. Lock & Submit stamps everything with server time, and from then on nobody can change it.', code: 'lock_inspection() → 409 on edit' },
  { icon: Bot, title: 'Nemotron reviews', body: 'At move-out an NVIDIA Nemotron agent compares every photo pair and suggests a status. A fee schedule sets the money; housing approves.', code: 'compare_photos ×4 · parallel' },
];

const FAQS = [
  { q: 'Can a student upload an old photo from their camera roll?', a: 'No. There is no file picker: photos come from the live camera inside the page, each one is stamped with the room, the item and the time, and the database records when it arrived.' },
  { q: 'Can housing change the evidence after a student submits?', a: 'No. Once an inspection is locked, the database itself rejects edits to the photos, notes and timestamps, from students and admins alike. Every file also gets a SHA-256 fingerprint, so any change would show up.' },
  { q: 'Does the AI decide who pays?', a: 'No. Nemotron suggests a status for each item and explains why. The amount comes from a fixed fee schedule in code, and a housing admin approves every decision. Low-confidence calls are marked for a human.' },
  { q: 'What if a student disagrees with a charge?', a: 'They tap “Dispute this charge” and explain why. Nemotron prepares an evidence brief with both timestamps, and housing resolves it with a written comment the student can see.' },
  { q: 'Is the report legally binding?', a: 'Walkthrough does not replace a lease or the school’s room condition form. It gives both sides an organized, timestamped record to attach to those forms and to any appeal.' },
];

function SiteHeader() {
  const { profile, mfaVerified } = useAuth();
  const [open, setOpen] = useState(false);
  const signedIn = profile && mfaVerified;
  const cta = signedIn
    ? <Link to={homeFor(profile)} className="btn btn-primary">Open the app <ArrowRight className="size-4" /></Link>
    : <Link to="/login" className="btn btn-primary">Try the demo</Link>;
  return (
    <header className="sticky top-0 z-40 border-b border-purple-500/20 bg-void/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-7 font-mono text-[12px] tracking-[0.04em] text-muted-foreground md:flex">
          {NAV.map((l) => <a key={l.href} href={l.href} className="transition-colors hover:text-neon">{l.label}</a>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {!signedIn && <Link to="/login" className="btn btn-ghost">Sign in</Link>}
          {cta}
        </div>
        <button className="btn btn-ghost size-10 px-0 md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <nav className="border-t border-purple-500/20 md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-4">
            {NAV.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-[3px] px-3 py-3 font-heading text-xl font-semibold transition-colors hover:bg-cyan-400/10 hover:text-neon">{l.label}</a>
            ))}
            <Link to={signedIn ? homeFor(profile) : '/login'} className="btn btn-primary btn-lg mt-3">{signedIn ? 'Open the app' : 'Try the demo'}</Link>
          </div>
        </nav>
      )}
    </header>
  );
}

// The hero artifact: what housing actually sees for one item, drawn with the app's own HUD parts.
function HeroTerminal() {
  const rows = [
    { name: 'Main door & lock', code: '[VERIFIED // NO_CHANGE]', cls: 'border-emerald-400/40 bg-emerald-400/10 text-[#00FF9D]' },
    { name: 'Study desk', code: '[PRE_EXISTING // WAIVED]', cls: 'border-cyan-400/45 bg-cyan-400/10 text-neon' },
    { name: 'Window blinds', code: '[NEW_DAMAGE // BILLABLE]', cls: 'border-rose-500/50 bg-rose-500/10 text-[#FF5C8D]' },
    { name: 'Sink & mirror', code: '[DISPUTE // UNDER_REVIEW]', cls: 'border-amber-400/45 bg-amber-400/10 text-[#FFB800]' },
  ];
  return (
    <div className="hud-panel relative mx-auto w-full max-w-md overflow-hidden lg:mr-0">
      <div className="flex items-center justify-between border-b border-purple-500/20 px-4 py-2.5 font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground">
        <span>CASE // FH-304B</span>
        <span className="flex items-center gap-1.5 text-[#00FF9D]"><Lock className="size-3" /> LOCKED</span>
      </div>
      <div className="hud-frame scanlines relative aspect-[16/10] overflow-hidden border-b border-purple-500/20 bg-black">
        <img src="/seed/blinds-broken.jpg" alt="Move-out photo of the window blinds, one slat bent" className="h-full w-full object-cover opacity-90" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] flex justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pb-5 pt-2 font-mono text-[10px] text-cyan-100/90">
          <span className="min-w-0 truncate">CAM_T1 // UNIT FH-304B // MOVE_OUT</span>
          <span className="flex shrink-0 items-center gap-1.5"><span className="live-dot bg-[#FF2A6D]" aria-hidden /> ARCHIVED</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-6 font-mono text-[10px] text-cyan-100/80"><HudClock /></div>
      </div>
      <ul className="divide-y divide-purple-500/15 px-4">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="font-medium">{r.name}</span>
            <span className={`hud-pill ${r.cls}`}>{r.code}</span>
          </li>
        ))}
      </ul>
      <p className="m-4 mt-1 rounded-[3px] border border-purple-500/30 bg-purple-500/10 p-3 font-mono text-[11.5px] leading-relaxed text-[#d9c6ff]">
        <span className="text-violet-400">&gt; nemotron:</span> the desk scratch is already in the Aug 18 move-in photo. Recommendation: waive.
      </p>
    </div>
  );
}

function AgentTrace() {
  const lines = [
    ['ROUND 01 // SEQ_EXEC', [['list_items()', '4 items loaded', '180ms']]],
    ['ROUND 02 // PARALLEL_EXEC', [['compare_photos(door)', 'no change', '3.1s'], ['compare_photos(desk)', 'pre-existing', '3.4s'], ['compare_photos(blinds)', 'new damage', '2.9s'], ['compare_photos(sink)', 'disputed', '3.2s']]],
    ['ROUND 03 // PARALLEL_EXEC', [['get_dispute_evidence(sink)', 'both timestamps', '40ms'], ['calculate_fee(blinds)', '$45.00 from schedule', '12ms']]],
    ['ROUND 04 // SEQ_EXEC', [['submit_review()', 'summary + dispute brief', '1.8s']]],
  ];
  return (
    <div className="term overflow-hidden" aria-label="Example agent trace">
      <div className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-400/[0.04] px-4 py-2 text-[11px] text-cyan-100">
        <span className="flex items-center gap-2"><span className="flex gap-1" aria-hidden><span className="size-2 rounded-full bg-[#FF2A6D]/70" /><span className="size-2 rounded-full bg-[#FFB800]/70" /><span className="size-2 rounded-full bg-[#00FF9D]/70" /></span> nemotron.trace</span>
        <span className="text-muted-foreground">FH-304B</span>
      </div>
      <div className="space-y-3 overflow-x-auto p-4 text-[12px]">
        {lines.map(([head, calls]) => (
          <div key={head}>
            <p className="font-semibold text-violet-400">[{head}]</p>
            {calls.map(([call, note, ms], i) => (
              <p key={call} className="flex gap-2 whitespace-nowrap text-[#d6d1ea]">
                <span className="text-violet-400/80">{i === calls.length - 1 ? '└─►' : '├─►'}</span>
                <span className="text-neon">{call}</span>
                <span className="flex-1 text-muted-foreground">{note}</span>
                <span className="text-muted-foreground">{ms}</span>
                <span className="text-[#00FF9D]">[OK]</span>
              </p>
            ))}
          </div>
        ))}
        <p className="text-[#00FF9D]">&gt; review complete · 8 calls · exit 0</p>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="relative flex-1 overflow-x-clip">
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-5 pt-14 pb-20 sm:px-8 md:pt-20 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-rise">
            <p className="mb-6 inline-flex items-center gap-2 rounded-[2px] border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 font-mono text-[11px] tracking-[0.06em] text-neon">
              <span className="live-dot bg-neon" aria-hidden /> MOVE-IN / MOVE-OUT EVIDENCE FOR STUDENTS
            </p>
            <h1 className="font-heading text-[clamp(2.6rem,6.4vw,5.2rem)] leading-[0.98] font-bold tracking-[-0.03em]">
              Don't pay for damage you <span className="text-neon">didn't do.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-[#cfc9e6] sm:text-xl">
              Scan the QR code on your door, photograph each item, and lock it. After that, nobody can change it. Not even housing.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link to="/login" className="btn btn-primary btn-xl">Try the demo <ArrowRight className="size-5" /></Link>
              <a href="#how-it-works" className="btn btn-outline btn-xl">See how it works</a>
            </div>
            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[11px] text-muted-foreground">
              <div><dt className="tracking-[0.08em]">TIMESTAMP</dt><dd className="text-foreground">server clock</dd></div>
              <div><dt className="tracking-[0.08em]">INTEGRITY</dt><dd className="text-foreground">SHA-256 per file</dd></div>
              <div><dt className="tracking-[0.08em]">REVIEW</dt><dd className="text-foreground">NVIDIA Nemotron</dd></div>
            </dl>
          </div>
          <div className="animate-rise [animation-delay:150ms]"><HeroTerminal /></div>
        </section>

        {/* How it works: a real three-step sequence, so the numbers carry information */}
        <section id="how-it-works" className="scroll-mt-20 border-y border-purple-500/20 bg-obsidian/60">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <Reveal>
              <h2 className="max-w-2xl font-heading text-4xl leading-[1.02] font-bold sm:text-5xl">Three steps. Zero surprise fines.</h2>
            </Reveal>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-md border border-purple-500/20 bg-purple-500/20 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 120} className="bg-void p-7">
                  <div className="flex items-center justify-between">
                    <span className="hud-frame hud-frame-sm flex size-11 items-center justify-center rounded-[3px] border border-cyan-400/40 bg-cyan-400/10 text-neon"><s.icon className="size-5" /></span>
                    <span className="font-mono text-xs text-muted-foreground">STEP_{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="mt-6 font-heading text-2xl font-bold">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-[#cfc9e6]">{s.body}</p>
                  <p className="mt-5 font-mono text-[11px] text-violet-400">&gt; {s.code}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Evidence: a split layout, one large proof object and the guarantees beside it */}
        <section id="evidence" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
            <Reveal>
              <div className="hud-frame scanlines relative grid grid-cols-2 gap-px overflow-hidden rounded-md border border-cyan-400/30 bg-black">
                {[['T0 // MOVE-IN', '/seed/blinds.jpg', 'Move-in photo of the window blinds, intact'], ['T1 // MOVE-OUT', '/seed/blinds-broken.jpg', 'Move-out photo of the window blinds, one slat bent']].map(([label, src, alt]) => (
                  <figure key={label} className="relative">
                    <img src={src} alt={alt} className="aspect-[3/4] w-full object-cover" />
                    <figcaption className="absolute left-2 top-2 z-[4] rounded-[2px] border border-cyan-400/30 bg-black/70 px-2 py-0.5 font-mono text-[10px] text-cyan-100">{label}</figcaption>
                  </figure>
                ))}
                <span aria-hidden className="laser absolute inset-y-0 left-1/2 z-[4] w-0.5 -translate-x-1/2" />
              </div>
              <p className="mt-3 flex flex-wrap gap-2 font-mono text-[11px]">
                <span className="hud-pill border-cyan-400/50 bg-cyan-400/10 text-neon"><ShieldCheck className="size-3" /> [SHA256 // VERIFIED] 3f9a1c07</span>
                <span className="hud-pill border-rose-500/50 bg-rose-500/10 text-[#FF5C8D]">[NEW_DAMAGE // BILLABLE] $45.00</span>
              </p>
            </Reveal>
            <Reveal delay={120}>
              <h2 className="font-heading text-4xl leading-[1.02] font-bold sm:text-5xl">Evidence that holds up.</h2>
              <dl className="mt-8 space-y-6">
                {[
                  [Lock, 'Locked by the database', 'After submit, Postgres rejects every edit to photos, notes and timestamps, from students and admins alike.'],
                  [Fingerprint, 'Fingerprinted', 'Every file gets a SHA-256 hash at upload. Housing’s screen re-hashes it and shows the match.'],
                  [Camera, 'Live camera only', 'No camera-roll uploads. Each photo is taken in the page and stamped with room, item and time.'],
                  [Scale, 'One-tap disputes', 'Students dispute a charge with a reason. Their locked move-in photo is attached automatically.'],
                ].map(([Icon, title, body]) => (
                  <div key={title} className="flex gap-4">
                    <Icon className="mt-1 size-5 shrink-0 text-neon" />
                    <div><dt className="font-semibold">{title}</dt><dd className="mt-1 text-[#cfc9e6]">{body}</dd></div>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        {/* NVIDIA Nemotron */}
        <section id="nemotron" className="scroll-mt-20 border-y border-purple-500/20 bg-obsidian/60">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.2fr]">
            <Reveal>
              <p className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-violet-400"><Bot className="size-4" /> POWERED BY NVIDIA NEMOTRON</p>
              <h2 className="font-heading text-4xl leading-[1.02] font-bold sm:text-5xl">An inspection agent, not a chatbot.</h2>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-[#cfc9e6]">At move-out, Nemotron decides what to look at, compares every photo pair with its vision model, pulls the dispute evidence, prices damage from the fee schedule and writes the summary. Housing sees every step.</p>
              <ul className="mt-8 space-y-4 text-[#cfc9e6]">
                <li className="flex gap-3"><Camera className="mt-0.5 size-5 shrink-0 text-violet-400" /><span><b className="text-foreground">A coach while you shoot.</b> After each photo it checks framing, light and focus, and suggests a retake if needed.</span></li>
                <li className="flex gap-3"><Scale className="mt-0.5 size-5 shrink-0 text-violet-400" /><span><b className="text-foreground">Nemotron proposes. Code computes. Humans decide.</b> The model never sets a fine; an admin approves every status.</span></li>
              </ul>
            </Reveal>
            <Reveal delay={120}><AgentTrace /></Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-4xl scroll-mt-20 px-5 py-20 sm:px-8">
          <Reveal><h2 className="font-heading text-4xl font-bold sm:text-5xl">Questions?</h2></Reveal>
          <div className="mt-8 divide-y divide-purple-500/20 border-y border-purple-500/20">
            {FAQS.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-heading text-lg font-semibold transition-colors hover:text-neon sm:text-xl [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <p className="max-w-[65ch] pb-5 leading-relaxed text-[#cfc9e6]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
          <Reveal>
            <div className="hud-frame relative overflow-hidden rounded-md border border-cyan-400/40 bg-obsidian px-8 py-14 text-center sm:px-16 sm:py-20">
              <h2 className="font-heading text-4xl leading-[1.02] font-bold sm:text-6xl">Moving in soon? <span className="text-neon">Document it today.</span></h2>
              <p className="mx-auto mt-5 max-w-lg text-lg text-[#cfc9e6]">The best time to stop a fine is before you unpack your first box.</p>
              <Link to="/login" className="btn btn-primary btn-xl mt-9"><ShieldCheck className="size-5" /> Try the demo</Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-purple-500/20">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center sm:px-8">
          <Logo />
          <p className="font-mono text-[11px] text-muted-foreground">Built at HackUTD 2026 · Powered by NVIDIA Nemotron</p>
        </div>
      </footer>
    </div>
  );
}
