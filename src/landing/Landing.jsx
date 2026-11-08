import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Bot, Camera, ChevronDown, Clock, Database, FileSearch, Fingerprint, GitCompareArrows, Lock, Menu,
  QrCode, Receipt, Scale, Send, ShieldCheck, Sparkle, Sparkles, X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Logo, PopWords, Reveal } from '../components/brand.jsx';
import { homeFor } from '../lib/rules.js';

// Marketing front door (design from the team's Cursor prototype; every claim here is true of this app).

const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#nemotron', label: 'Nemotron' },
  { href: '#faq', label: 'FAQ' },
];

const STEPS = [
  { icon: QrCode, title: 'Scan the door', body: 'Housing tapes a QR code to every door. Scanning it opens that room’s checklist on the student’s phone, no app to install.', offset: 'md:mt-0', tilt: -3 },
  { icon: Camera, title: 'Photograph and lock', body: 'A guided camera walks through each item. Lock & Submit stamps everything with server time, and from then on nobody can change it.', offset: 'md:mt-20', tilt: 2 },
  { icon: Bot, title: 'Nemotron reviews', body: 'At move-out an NVIDIA Nemotron agent compares every photo pair and suggests a status. A fee schedule sets the money; housing approves.', offset: 'md:mt-40', tilt: -2 },
];

const MARQUEE = ['Scan the door QR', 'Live camera only', 'Server timestamps', 'Locked after submit', 'Reviewed by Nemotron', 'Fair fines'];

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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-[15px] font-medium text-white/70 md:flex">
          {NAV.map((l) => (
            <a key={l.href} href={l.href} className="relative transition-colors after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-primary after:transition-all hover:text-primary hover:after:w-full">{l.label}</a>
          ))}
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
        <nav className="border-t border-white/10 md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-4">
            {NAV.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 font-heading text-2xl font-semibold transition-colors hover:bg-primary hover:text-primary-foreground">{l.label}</a>
            ))}
            <Link to={signedIn ? homeFor(profile) : '/login'} className="btn btn-primary btn-lg mt-3">{signedIn ? 'Open the app' : 'Try the demo'}</Link>
          </div>
        </nav>
      )}
    </header>
  );
}

function Sticker({ children, className, tilt }) {
  return (
    <span className={`animate-float absolute z-10 rounded-full px-4 py-2 font-heading text-sm font-bold ${className}`} style={{ '--tilt': `${tilt}deg` }}>
      {children}
    </span>
  );
}

function HeroMock() {
  const items = [
    { name: 'Main door & lock', status: 'No change', tone: 'bg-primary/15 text-primary' },
    { name: 'Study desk', status: 'Pre-existing · $85 waived', tone: 'bg-sky-400/15 text-sky-300' },
    { name: 'Window blinds', status: 'New damage · $45', tone: 'bg-rose-500/15 text-rose-300' },
    { name: 'Sink & mirror', status: 'Disputed', tone: 'bg-amber-400/15 text-amber-300' },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md lg:mr-0">
      <div aria-hidden className="absolute -inset-10 -z-10 rounded-full bg-primary/20 blur-3xl" />
      <Sticker tilt={-8} className="-top-5 -left-4 bg-primary text-primary-foreground sm:-left-10">Locked by the database</Sticker>
      <Sticker tilt={7} className="-right-2 -bottom-5 bg-white text-black sm:-right-8 [animation-delay:1.2s]">Reviewed by Nemotron</Sticker>
      <div className="rotate-2 rounded-2xl border border-white/15 bg-card p-5 transition-transform duration-500 hover:rotate-0 sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="font-heading text-xl font-bold">Founders Hall · 304-B</div>
            <div className="text-sm text-muted-foreground">Move-out · locked 9:40 AM, server time</div>
          </div>
          <Lock className="size-5 text-primary" aria-label="Locked" />
        </div>
        <ul className="mt-4 space-y-2.5">
          {items.map((i) => (
            <li key={i.name} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-3">
              <span className="flex items-center gap-3 font-medium">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10"><Camera className="size-4 text-white/70" /></span>
                {i.name}
              </span>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${i.tone}`}>{i.status}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-primary/30 bg-accent p-3 text-sm text-white/85">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          Nemotron: the desk scratch is already in the Aug 18 move-in photo. Recommendation: waive.
        </p>
      </div>
    </div>
  );
}

function AgentTimeline() {
  const steps = [
    { icon: Database, tool: 'list_items', note: '4 items loaded' },
    { icon: FileSearch, tool: 'compare_photos ×4', note: 'vision, in parallel' },
    { icon: FileSearch, tool: 'get_dispute_evidence', note: 'sink: both timestamps' },
    { icon: Receipt, tool: 'calculate_fee', note: 'blinds: $45 from the schedule' },
    { icon: Send, tool: 'submit_review', note: 'summary + dispute brief' },
  ];
  return (
    <ol className="mt-6 space-y-2" aria-label="Example agent timeline">
      {steps.map((s, i) => (
        <li key={s.tool} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-sm">
          <span className="w-14 shrink-0 text-xs font-semibold text-white/50">Round {i < 1 ? 1 : i < 3 ? 2 : i < 4 ? 3 : 4}</span>
          <s.icon className="size-4 shrink-0 text-primary" />
          <code className="font-mono text-[13px] font-semibold">{s.tool}</code>
          <span className="ml-auto hidden text-white/60 sm:inline">{s.note}</span>
          <span className="text-primary" aria-label="ok">✓</span>
        </li>
      ))}
    </ol>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 overflow-x-clip">
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl items-center gap-16 px-5 pt-16 pb-24 sm:px-8 md:pt-24 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="animate-pop mb-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
              <ShieldCheck className="size-4" /> Move-in &amp; move-out proof for students
            </p>
            <h1 className="font-heading text-[clamp(3rem,7.5vw,6rem)] leading-[0.95] font-extrabold tracking-tight [text-wrap:balance]">
              <PopWords text="Don't pay for damage you didn't do." highlight={["didn't"]} startDelay={120} />
            </h1>
            <p className="animate-pop mt-8 max-w-xl text-xl leading-relaxed text-white/75 sm:text-2xl [text-wrap:pretty]" style={{ animationDelay: '850ms' }}>
              Scan the QR code on your door, photograph each item, and lock it. After that, nobody can change it. Not even housing.
            </p>
            <div className="animate-pop mt-10 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: '1000ms' }}>
              <Link to="/login" className="btn btn-primary btn-xl">Try the demo <ArrowRight className="size-5" /></Link>
              <a href="#how-it-works" className="btn btn-outline btn-xl">See how it works</a>
            </div>
          </div>
          <div className="animate-pop" style={{ animationDelay: '500ms' }}><HeroMock /></div>
        </section>

        {/* Marquee */}
        <div className="-mx-4 -rotate-2 border-y-2 border-black bg-primary py-4 text-primary-foreground" aria-hidden>
          <div className="animate-marquee flex w-max gap-10 font-heading text-3xl font-extrabold tracking-tight uppercase sm:text-4xl">
            {[...MARQUEE, ...MARQUEE].map((m, i) => (
              <span key={i} className="flex items-center gap-10">{m}<Sparkle className="size-7 fill-current" /></span>
            ))}
          </div>
        </div>

        {/* How it works: a real three-step sequence, so the numbers carry information */}
        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-28 sm:px-8">
          <Reveal>
            <h2 className="max-w-3xl font-heading text-5xl leading-[0.95] font-extrabold tracking-tight sm:text-7xl [text-wrap:balance]">
              Three steps. <span className="text-transparent [-webkit-text-stroke:2px_var(--primary)]">Zero</span> surprise fines.
            </h2>
          </Reveal>
          <ol className="mt-16 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 150} tilt={s.tilt} className={s.offset}>
                <div className="group h-full rotate-(--tilt) rounded-2xl border border-white/10 bg-card p-8 transition-all duration-500 hover:-translate-y-2 hover:rotate-0 hover:border-primary/60" style={{ '--tilt': `${s.tilt}deg` }}>
                  <div className="flex items-center justify-between">
                    <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"><s.icon className="size-7" /></span>
                    <span aria-hidden className="font-heading text-7xl font-extrabold text-transparent transition-colors [-webkit-text-stroke:1.5px_rgba(255,255,255,0.35)] group-hover:text-primary group-hover:[-webkit-text-stroke-color:var(--primary)]">0{i + 1}</span>
                  </div>
                  <h3 className="mt-8 font-heading text-3xl font-bold">{s.title}</h3>
                  <p className="mt-3 text-lg leading-relaxed text-white/70">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Features bento */}
        <section id="features" className="scroll-mt-24 border-t border-white/10 bg-white text-black">
          <div className="mx-auto max-w-7xl px-5 py-28 sm:px-8">
            <Reveal>
              <h2 className="max-w-4xl font-heading text-5xl leading-[0.95] font-extrabold tracking-tight sm:text-7xl [text-wrap:balance]">
                Evidence that <span className="inline-block rotate-1 rounded-2xl bg-black px-3 text-primary">holds up.</span>
              </h2>
            </Reveal>
            <div className="mt-16 grid auto-rows-[minmax(220px,auto)] gap-5 md:grid-cols-6">
              <Reveal className="md:col-span-4 md:row-span-2">
                <div className="group flex h-full flex-col justify-between rounded-2xl bg-black p-8 text-white sm:p-10">
                  <GitCompareArrows className="size-12 text-primary transition-transform duration-500 group-hover:rotate-180" />
                  <div>
                    <h3 className="font-heading text-4xl font-extrabold sm:text-5xl [text-wrap:balance]">Move-in vs. move-out, side by side.</h3>
                    <p className="mt-4 max-w-lg text-lg text-white/75">Housing sees both photos with their timestamps and the student’s notes, then drags a slider across them. Every item ends up labeled: no change, pre-existing, or new damage.</p>
                  </div>
                </div>
              </Reveal>
              <Reveal delay={100} className="md:col-span-2">
                <div className="flex h-full flex-col justify-between rounded-2xl bg-primary p-7">
                  <Clock className="size-9" />
                  <div>
                    <h3 className="font-heading text-2xl font-bold">Server timestamps</h3>
                    <p className="mt-2 text-black/75">The database stamps every photo with its own clock. A phone’s clock can’t fake it.</p>
                  </div>
                </div>
              </Reveal>
              <Reveal delay={200} className="md:col-span-2">
                <div className="flex h-full flex-col justify-between rounded-2xl border-2 border-black p-7">
                  <Camera className="size-9" />
                  <div>
                    <h3 className="font-heading text-2xl font-bold">Live camera only</h3>
                    <p className="mt-2 text-black/75">No camera-roll uploads. Each photo is taken in the page and stamped with room, item and time.</p>
                  </div>
                </div>
              </Reveal>
              <Reveal delay={100} className="md:col-span-3">
                <div className="flex h-full flex-col justify-between rounded-2xl border-2 border-black p-7">
                  <Scale className="size-9" />
                  <div>
                    <h3 className="font-heading text-2xl font-bold">One-tap disputes</h3>
                    <p className="mt-2 text-black/75">Students dispute a charge with a written reason. Their locked move-in photo is attached automatically.</p>
                  </div>
                </div>
              </Reveal>
              <Reveal delay={200} className="md:col-span-3">
                <div className="flex h-full flex-col justify-between rounded-2xl bg-black p-7 text-white">
                  <div className="flex gap-3"><Lock className="size-9 text-primary" /><Fingerprint className="size-9 text-white/60" /></div>
                  <div>
                    <h3 className="font-heading text-2xl font-bold">Tamper-proof by design</h3>
                    <p className="mt-2 text-white/75">After locking, Postgres rejects every edit, from students and admins alike. SHA-256 fingerprints prove each file is the one uploaded.</p>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* NVIDIA Nemotron */}
        <section id="nemotron" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-28 sm:px-8">
          <Reveal>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-1.5 text-sm font-semibold text-white/80"><Bot className="size-4 text-primary" /> Powered by NVIDIA Nemotron</p>
            <h2 className="max-w-4xl font-heading text-5xl leading-[0.95] font-extrabold tracking-tight sm:text-6xl [text-wrap:balance]">An inspection agent, <span className="text-primary">not a chatbot.</span></h2>
          </Reveal>
          <div className="mt-14 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Reveal tilt={-1}>
              <div className="h-full rounded-2xl border border-white/10 bg-card p-8">
                <h3 className="font-heading text-3xl font-bold">It plans the review, then calls tools.</h3>
                <p className="mt-3 max-w-xl text-lg text-white/70">At move-out, Nemotron decides what to look at, compares every photo pair with its vision model, pulls the dispute evidence, prices damage from the fee schedule and writes the summary. Housing sees every step.</p>
                <AgentTimeline />
              </div>
            </Reveal>
            <div className="grid gap-6">
              <Reveal delay={120} tilt={2}>
                <div className="rounded-2xl bg-primary p-8 text-primary-foreground">
                  <Camera className="size-8" />
                  <h3 className="mt-6 font-heading text-2xl font-bold">A coach while you shoot</h3>
                  <p className="mt-2 text-black/75">After each photo, Nemotron checks the framing, light and focus, and at move-out the angle against your move-in photo. Then it suggests a retake if needed.</p>
                </div>
              </Reveal>
              <Reveal delay={220} tilt={-1}>
                <div className="rounded-2xl bg-white p-8 text-black">
                  <Scale className="size-8" />
                  <h3 className="mt-6 font-heading text-2xl font-bold">Nemotron proposes. Code computes. Humans decide.</h3>
                  <p className="mt-2 text-black/75">The model never sets a fine. Dollar amounts come from a fixed schedule, and an admin approves every status.</p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-4xl scroll-mt-24 px-5 pb-28 sm:px-8">
          <Reveal><h2 className="font-heading text-5xl font-extrabold tracking-tight sm:text-6xl">Questions?</h2></Reveal>
          <div className="mt-10 divide-y divide-white/15 border-y border-white/15">
            {FAQS.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-6 font-heading text-xl font-bold transition-colors hover:text-primary sm:text-2xl [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="size-6 shrink-0 transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <p className="max-w-[65ch] pb-6 text-lg leading-relaxed text-white/75">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-5 pb-28 sm:px-8">
          <Reveal tilt={-1.5}>
            <div className="relative overflow-hidden rounded-2xl border-2 border-primary bg-card px-8 py-16 text-center sm:px-16 sm:py-24">
              <div aria-hidden className="absolute -top-24 -right-24 size-72 rounded-full bg-primary/25 blur-3xl" />
              <h2 className="relative font-heading text-5xl leading-[0.95] font-extrabold tracking-tight sm:text-7xl [text-wrap:balance]">
                Moving in soon?<br /><span className="text-primary">Document it today.</span>
              </h2>
              <p className="relative mx-auto mt-6 max-w-lg text-xl text-white/75">The best time to stop a fine is before you unpack your first box.</p>
              <Link to="/login" className="btn btn-primary btn-xl relative mt-10"><ShieldCheck className="size-5" /> Try the demo</Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="overflow-hidden border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-5 pt-10 text-white/60 sm:flex-row sm:items-center sm:px-8">
          <Logo />
          <p>Built at HackUTD 2026 · Powered by NVIDIA Nemotron</p>
        </div>
        <div aria-hidden className="mx-auto -mb-[0.2em] max-w-7xl px-5 pt-6 font-heading text-[clamp(4rem,17vw,15rem)] leading-none font-extrabold tracking-tight text-transparent select-none [-webkit-text-stroke:2px_rgba(255,255,255,0.14)] sm:px-8">
          Walkthrough
        </div>
      </footer>
    </div>
  );
}
