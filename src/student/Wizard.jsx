import { useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { MediaView, Modal, ZoneBadge, useToast } from '../components/ui.jsx';
import MediaCapture from './MediaCapture.jsx';
import PhotoCoach from './PhotoCoach.jsx';
import { lockInspection, removeStudentMedia, runPhotoCheck, updateNotes, uploadStudentMedia } from '../lib/dbService.js';
import { canEditEvidence } from '../lib/rules.js';
import { fmtDateTime, shortHash } from '../lib/format.js';

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
  const [confirming, setConfirming] = useState(false);

  const item = items[step];
  const path = item[`${phase}_media_path`];
  const type = item[`${phase}_media_type`];
  const done = items.filter((i) => i[`${phase}_media_path`]).length;
  const editable = canEditEvidence(profile, unit, phase);
  const noteValue = notes[item.id] ?? item[`${phase}_notes`] ?? '';

  const handleCapture = async ({ blob, kind, sample }) => {
    setBusy(true);
    try {
      const row = await uploadStudentMedia({ item, phase, file: blob, notes: noteValue || undefined, sample });
      onItemChanged(row);
      setRetaking(false);
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
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const saveNotes = async () => {
    if (!editable || noteValue === (item[`${phase}_notes`] ?? '')) return;
    try {
      onItemChanged(await updateNotes(item.id, phase, noteValue));
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

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium">Step {step + 1} of {items.length}</span>
          <span className="text-muted-foreground">{done} of {items.length} photographed</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={done} aria-valuemax={items.length}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
        <div className="mt-2 flex gap-1.5">
          {items.map((it, i) => (
            <button key={it.id} onClick={() => { setStep(i); setRetaking(false); }} aria-label={`Go to step ${i + 1}`}
              className={`h-2.5 flex-1 rounded-full ${i === step ? 'bg-white' : it[`${phase}_media_path`] ? 'bg-primary' : 'bg-white/15'}`} />
          ))}
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-card p-4 shadow-sm">
        <ZoneBadge zone={item.zone_category} />
        <h2 className="font-heading tracking-tight text-xl font-semibold">{item.item_name}</h2>
        <p className="text-white/75">{item.instruction_text}</p>

        {phase === 'after' && (
          <div className="rounded-xl border border-indigo-400/30 bg-indigo-400/10 p-3">
            <p className="mb-2 text-sm font-semibold text-indigo-200">Match this angle: your locked move-in photo</p>
            <div className="flex gap-3">
              <MediaView path={item.before_media_path} type={item.before_media_type} alt="Move-in reference" className="h-28 w-28 shrink-0" />
              <div className="text-sm text-indigo-200">
                <p className="font-medium">{fmtDateTime(item.before_captured_at)}</p>
                {item.before_notes && <p className="mt-1 text-indigo-200">“{item.before_notes}”</p>}
              </div>
            </div>
          </div>
        )}

        {path && !retaking ? (
          <div className="space-y-2">
            <MediaView path={path} type={type} alt={`${item.item_name} ${phase === 'before' ? 'move-in' : 'move-out'}`} className="max-h-96 w-full" />
            <p className="text-xs text-muted-foreground">
              Captured {fmtDateTime(item[`${phase}_captured_at`])}
              {item[`${phase}_sha256`] && <> · fingerprint <code className="font-mono">{shortHash(item[`${phase}_sha256`])}</code></>}
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
            {busy ? <p className="rounded-xl bg-white/10 p-6 text-center text-white/75">Uploading…</p> : <MediaCapture item={item} unit={unit} phase={phase} onCapture={handleCapture} />}
            {retaking && <button onClick={() => setRetaking(false)} className="btn btn-ghost w-full text-muted-foreground">Keep the current photo</button>}
          </div>
        ) : (
          <p className="rounded-xl bg-white/10 p-4 text-sm text-white/75">This inspection is locked.</p>
        )}

        <label className="block text-sm font-medium">Condition notes (optional)
          <textarea value={noteValue} disabled={!editable} rows={2} onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))} onBlur={saveNotes}
            placeholder="Describe anything already damaged or worn…" className="field mt-1" />
        </label>
      </section>

      <div className="flex gap-3">
        <button disabled={step === 0} onClick={() => { setStep(step - 1); setRetaking(false); }} className="btn btn-outline btn-lg"><ChevronLeft size={18} /> Back</button>
        {step < items.length - 1 ? (
          <button onClick={() => { saveNotes(); setStep(step + 1); setRetaking(false); }} className="btn btn-primary btn-lg flex-1">Next <ChevronRight size={18} /></button>
        ) : (
          <button disabled={done < items.length || busy} onClick={() => { saveNotes(); setConfirming(true); }} className="btn btn-lime btn-lg flex-1">
            <Lock size={18} /> Lock &amp; Submit Official Inspection
          </button>
        )}
      </div>
      {step === items.length - 1 && done < items.length && <p className="text-center text-sm text-amber-200">Photograph every item to submit ({items.length - done} left).</p>}

      {confirming && (
        <Modal title="Submit your official inspection?" onClose={() => setConfirming(false)}>
          <p className="text-white/75">
            Once you submit, <b>nothing can be changed</b>: not by you, not by housing. Your photos and notes are stamped with the server time as your official record.
          </p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setConfirming(false)} className="btn btn-outline btn-lg flex-1">Go back</button>
            <button disabled={busy} onClick={submit} className="btn btn-lime btn-lg flex-1"><Lock size={16} /> {busy ? 'Locking…' : 'Lock & submit'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
