import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EvidenceFrame, MediaView, Modal, Seal, ZoneBadge, useToast } from '../components/ui.jsx';
import MediaCapture from './MediaCapture.jsx';
import PhotoCoach from './PhotoCoach.jsx';
import { lockInspection, removeStudentMedia, runPhotoCheck, updateNotes, uploadStudentMedia } from '../lib/dbService.js';
import { canEditEvidence } from '../lib/rules.js';
import { fmtUtc } from '../lib/format.js';

// Guided inspection: one checklist item per screen. `phase` = 'before' (move-in) or 'after' (move-out).
export default function Wizard({ unit, items, onItemChanged, onSubmitted }) {
  const { profile } = useAuth();
  const toast = useToast();
  const phase = unit.inspection_phase === 'MOVE_IN_OPEN' ? 'before' : 'after';
  const [step, setStep] = useState(() => Math.max(0, items.findIndex((i) => !i[`${phase}_media_path`])));
  const [busy, setBusy] = useState(false);
  const [retaking, setRetaking] = useState(false);
  const [coach, setCoach] = useState({});
  const [notes, setNotes] = useState({});
  const [noteSaved, setNoteSaved] = useState(null); // item id whose note was just saved
  const [confirming, setConfirming] = useState(false);
  const [fresh, setFresh] = useState(null); // item id that was captured a moment ago (plays the "sealed" animation)

  const item = items[step];
  const path = item[`${phase}_media_path`];
  const type = item[`${phase}_media_type`];
  const done = items.filter((i) => i[`${phase}_media_path`]).length;
  const editable = canEditEvidence(profile, unit, phase);
  const noteValue = notes[item.id] ?? item[`${phase}_notes`] ?? '';
  const phaseName = phase === 'before' ? 'Move-in' : 'Move-out';

  const saveNotes = async () => {
    if (!editable || noteValue === (item[`${phase}_notes`] ?? '')) return;
    try {
      onItemChanged(await updateNotes(item.id, phase, noteValue));
      setNoteSaved(item.id);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const goTo = (i, save = true) => {
    if (i < 0 || i >= items.length || i === step) return;
    if (save) saveNotes();
    setStep(i);
    setRetaking(false);
    setNoteSaved(null);
  };

  // ← and → move between items (not while typing, and not behind a dialog).
  const nav = useRef(goTo);
  nav.current = goTo;
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || confirming) return;
      if (/^(INPUT|TEXTAREA|SELECT|VIDEO)$/.test(e.target.tagName) || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'ArrowRight') nav.current(step + 1);
      if (e.key === 'ArrowLeft') nav.current(step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, confirming]);

  const handleCapture = async ({ blob, kind, sample }) => {
    setBusy(true);
    try {
      const row = await uploadStudentMedia({ item, phase, file: blob, notes: noteValue || undefined, sample });
      onItemChanged(row);
      setRetaking(false);
      setFresh(item.id);
      if (kind === 'photo') {
        setCoach((c) => ({ ...c, [item.id]: { status: 'checking' } }));
        runPhotoCheck(item.id, phase)
          .then((r) => setCoach((c) => ({ ...c, [item.id]: r.skipped ? { status: 'skipped' } : { status: 'done', result: r } })))
          .catch(() => setCoach((c) => ({ ...c, [item.id]: { status: 'error' } })));
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      onItemChanged(await removeStudentMedia(item, phase));
      setCoach((c) => ({ ...c, [item.id]: undefined }));
      setFresh(null);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await lockInspection(unit.id);
      toast(phase === 'before' ? 'Move-in submitted and locked.' : 'Move-out submitted and locked.', 'success');
      setConfirming(false);
      await onSubmitted();
    } catch (e) {
      toast(e.message, 'error');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const checking = coach[item.id]?.status === 'checking';
  const last = step === items.length - 1;

  return (
    <div className="space-y-4">
      {/* Progress: a count, a bar, and one tile per item to jump to */}
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-semibold text-neon">Step {step + 1} of {items.length}</span>
          <span className="text-muted-foreground"><b className="font-semibold text-foreground">{done}</b> of {items.length} photographed</span>
        </div>
        <nav className="grid grid-cols-4 gap-1.5" aria-label={`Checklist items, ${done} of ${items.length} photographed`}>
          {items.map((it, i) => {
            const shot = !!it[`${phase}_media_path`];
            const on = i === step;
            return (
              <button key={it.id} type="button" onClick={() => goTo(i)} aria-label={`Go to step ${i + 1}`} aria-current={on ? 'step' : undefined} title={it.item_name}
                className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-left sm:justify-start transition-[background-color,border-color,box-shadow] duration-150 ${on ? 'is-on' : 'border-line bg-void/40 hover:border-cyan-400/40 hover:bg-white/[0.04]'}`}>
                <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold transition-colors duration-300 ${shot ? 'bg-matrix text-void shadow-[0_0_10px_rgb(0_255_157/0.6)]' : on ? 'bg-neon/20 text-neon' : 'bg-white/10 text-muted-foreground'}`}>
                  {shot ? <Check size={12} strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                <span className={`hidden truncate text-[11.5px] font-medium sm:block ${on ? 'text-neon' : shot ? 'text-soft' : 'text-muted-foreground'}`} aria-hidden>{it.item_name.split(/[&(]/)[0].trim()}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <section className="panel space-y-3.5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ZoneBadge zone={item.zone_category} />
          <span className="fact ml-auto">Item {step + 1} · {phaseName}</span>
        </div>
        {/* only the words slide in when the item changes: the camera below keeps running */}
        <div key={item.id} className="animate-rise">
          <h2 className="text-[22px] font-bold leading-tight">{item.item_name}</h2>
          <p className="mt-1.5 text-soft">{item.instruction_text}</p>
        </div>

        {phase === 'after' && (
          <div className="rounded-lg border border-violet/35 bg-violet/[0.08] p-3">
            <p className="mb-2 text-sm font-semibold text-[#e4d6ff]">Match this angle: your locked move-in photo</p>
            <div className="flex gap-3">
              <EvidenceFrame small className="size-28 shrink-0">
                <MediaView path={item.before_media_path} type={item.before_media_type} alt="Move-in reference" className="size-28" zoom />
              </EvidenceFrame>
              <div className="min-w-0 text-sm">
                <p className="fact text-[#e4d6ff]">{fmtUtc(item.before_captured_at)}</p>
                <p className="mt-1.5"><span className="chip border-violet/50 bg-violet/15 text-lilac"><Lock size={11} aria-hidden /> Locked at move-in</span></p>
                {item.before_notes && <p className="mt-1.5 text-[#e4d6ff]">“{item.before_notes}”</p>}
              </div>
            </div>
          </div>
        )}

        {path && !retaking ? (
          <div className="space-y-2.5">
            <div className="relative">
              <EvidenceFrame label={`${unit.unit_code} · ${phaseName.toUpperCase()}`} right={<span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-matrix shadow-[0_0_6px_#00ff9d]" aria-hidden /> STORED</span>}
                className={fresh === item.id ? 'border-cyan-400/50 shadow-[0_0_34px_-10px_rgb(0_240_255/0.6)]' : ''}>
                <MediaView path={path} type={type} alt={`${item.item_name} ${phase === 'before' ? 'move-in' : 'move-out'}`} className="max-h-96 w-full" zoom />
                {checking && <span aria-hidden className="animate-scan pointer-events-none absolute inset-x-0 top-0 z-[4] h-[10%] bg-gradient-to-b from-transparent via-violet/50 to-transparent" />}
                {fresh === item.id && <span aria-hidden className="animate-shutter pointer-events-none absolute inset-0 z-[5] bg-white opacity-0" />}
              </EvidenceFrame>
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-muted-foreground">
              <span className="fact">Captured {fmtUtc(item[`${phase}_captured_at`])}</span>
              <Seal sha={item[`${phase}_sha256`]} className={fresh === item.id ? 'animate-tick' : ''} />
            </p>
            <PhotoCoach state={coach[item.id]} />
            {editable && (
              <div className="flex gap-2">
                <button onClick={() => setRetaking(true)} className="btn btn-outline btn-lg flex-1"><RotateCcw size={16} /> Retake</button>
                <button onClick={remove} className="btn btn-danger btn-lg"><Trash2 size={16} /> Remove</button>
              </div>
            )}
          </div>
        ) : editable ? (
          <div className="space-y-2">
            {busy ? (
              <div className="relative overflow-hidden rounded-lg border border-cyan-400/40 bg-cyan-400/[0.06] p-7 text-center" role="status">
                <p className="flex items-center justify-center gap-2.5 text-sm font-medium text-cyan-50"><Loader2 size={17} className="animate-spin text-neon" /> Uploading… server is fingerprinting (SHA-256)</p>
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-neon shadow-[0_0_10px_#00f0ff]" style={{ animation: 'fill-x 1.4s var(--ease-expo) both' }} />
              </div>
            ) : <MediaCapture item={item} unit={unit} phase={phase} onCapture={handleCapture} />}
            {retaking && !busy && <button onClick={() => setRetaking(false)} className="btn btn-ghost w-full text-muted-foreground">Keep the current photo</button>}
          </div>
        ) : (
          <p className="well flex items-center gap-2 p-4 text-sm text-muted-foreground"><Lock size={15} aria-hidden /> This inspection is locked.</p>
        )}

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label className="label" htmlFor={`notes-${item.id}`}>Condition notes (optional)</label>
            <span className="fact" aria-live="polite">
              {noteSaved === item.id ? <span className="animate-tick flex items-center gap-1 text-matrix"><Check size={12} aria-hidden /> saved</span> : `${noteValue.length} / 2000`}
            </span>
          </div>
          <textarea id={`notes-${item.id}`} value={noteValue} disabled={!editable} rows={2} maxLength={2000}
            onChange={(e) => { setNotes((n) => ({ ...n, [item.id]: e.target.value })); setNoteSaved(null); }} onBlur={saveNotes}
            placeholder="Describe anything already damaged or worn…" className="field mt-1.5" />
        </div>
      </section>

      {/* Actions stay within thumb reach on a phone */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-void/90 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="flex gap-3">
          <button disabled={step === 0} onClick={() => goTo(step - 1, false)} className="btn btn-outline btn-lg"><ChevronLeft size={18} /> Back</button>
          {!last ? (
            <button onClick={() => goTo(step + 1)} className={`btn btn-lg flex-1 ${path ? 'btn-primary' : 'btn-outline'}`}>Next <ChevronRight size={18} /></button>
          ) : (
            <button disabled={done < items.length || busy} onClick={() => { saveNotes(); setConfirming(true); }} className="btn btn-primary btn-lg min-w-0 flex-1">
              <Lock size={18} className="shrink-0" /> <span className="truncate">Lock &amp; Submit Official Inspection</span>
            </button>
          )}
        </div>
        {last && done < items.length && <p className="mt-2 text-center text-[12.5px] font-medium text-warn">Photograph every item to submit ({items.length - done} left).</p>}
      </div>

      {confirming && (
        <Modal title="Submit your official inspection?" onClose={() => setConfirming(false)}>
          <p className="text-soft">
            Once you submit, <b className="text-foreground">nothing can be changed</b>: not by you, not by housing. Your photos and notes are stamped with the server time as your official record.
          </p>
          <ul className="mt-4 grid grid-cols-4 gap-2">
            {items.map((it) => (
              <li key={it.id} className="min-w-0">
                <EvidenceFrame small><MediaView path={it[`${phase}_media_path`]} type={it[`${phase}_media_type`]} alt={it.item_name} className="aspect-square w-full" /></EvidenceFrame>
                <p className="mt-1 truncate text-[11px] text-muted-foreground" title={it.item_name}>{it.item_name.split(/[&(]/)[0].trim()}</p>
              </li>
            ))}
          </ul>
          <p className="fact mt-3">{done} files · SHA-256 fingerprinted · server clock</p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setConfirming(false)} className="btn btn-outline btn-lg flex-1">Go back</button>
            <button disabled={busy} onClick={submit} className="btn btn-primary btn-lg flex-1">{busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />} {busy ? 'Locking…' : 'Lock & submit'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
