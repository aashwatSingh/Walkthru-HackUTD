import { useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EvidenceFrame, MediaView, Modal, ZoneBadge, useToast } from '../components/ui.jsx';
import MediaCapture from './MediaCapture.jsx';
import PhotoCoach from './PhotoCoach.jsx';
import { lockInspection, removeStudentMedia, runPhotoCheck, updateNotes, uploadStudentMedia } from '../lib/dbService.js';
import { canEditEvidence } from '../lib/rules.js';
import { fmtUtc, shortHash } from '../lib/format.js';

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

  const tag = phase === 'before' ? 'MOVE_IN' : 'MOVE_OUT';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="font-semibold text-neon">Step {step + 1} of {items.length}</span>
          <span className="text-muted-foreground">{done} of {items.length} photographed</span>
        </div>
        <div className="flex gap-1" role="progressbar" aria-label="Items photographed" aria-valuenow={done} aria-valuemax={items.length}>
          {items.map((it, i) => {
            const shot = it[`${phase}_media_path`];
            return (
              <button key={it.id} onClick={() => { setStep(i); setRetaking(false); }} aria-label={`Go to step ${i + 1}`}
                className={`h-1.5 flex-1 rounded-[1px] transition-colors ${shot ? 'laser' : 'bg-purple-500/20 hover:bg-purple-500/35'} ${i === step ? 'outline outline-1 outline-offset-2 outline-cyan-400/70' : ''}`} />
            );
          })}
        </div>
      </div>

      <section className="hud-panel space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ZoneBadge zone={item.zone_category} />
          <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">ITEM_{String(step + 1).padStart(2, '0')} // {tag}</span>
        </div>
        <h2 className="font-heading text-xl font-semibold">{item.item_name}</h2>
        <p className="text-[#cfc9e6]">{item.instruction_text}</p>

        {phase === 'after' && (
          <div className="rounded-[3px] border border-purple-500/30 bg-purple-500/[0.07] p-3">
            <p className="mb-2 text-sm font-semibold text-[#d9c6ff]">Match this angle: your locked move-in photo</p>
            <div className="flex gap-3">
              <EvidenceFrame small className="h-28 w-28 shrink-0">
                <MediaView path={item.before_media_path} type={item.before_media_type} alt="Move-in reference" className="h-28 w-28" />
              </EvidenceFrame>
              <div className="min-w-0 text-sm">
                <p className="font-mono text-xs text-[#d9c6ff]">{fmtUtc(item.before_captured_at)}</p>
                <p className="mt-1"><span className="hud-pill border-purple-500/50 bg-purple-500/15 text-[#c79bff]">[REF // MOVE_IN_LOCKED]</span></p>
                {item.before_notes && <p className="mt-1.5 text-[#d9c6ff]">“{item.before_notes}”</p>}
              </div>
            </div>
          </div>
        )}

        {path && !retaking ? (
          <div className="space-y-2">
            <EvidenceFrame label={`EVIDENCE // ${unit.unit_code} // ${tag}`} right={<span className="flex items-center gap-1.5"><span className="live-dot bg-[#00FF9D]" aria-hidden /> STORED</span>}>
              <MediaView path={path} type={type} alt={`${item.item_name} ${phase === 'before' ? 'move-in' : 'move-out'}`} className="max-h-96 w-full" />
            </EvidenceFrame>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-purple-500/25 pt-2 font-mono text-[11px] text-muted-foreground">
              <span>Captured {fmtUtc(item[`${phase}_captured_at`])}</span>
              {item[`${phase}_sha256`] && <span className="hud-pill border-cyan-400/40 bg-cyan-400/10 text-neon" title={item[`${phase}_sha256`]}>[SHA256 // {shortHash(item[`${phase}_sha256`])}…]</span>}
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
            {busy ? <p className="flex items-center justify-center gap-2 rounded-[3px] border border-cyan-400/30 bg-cyan-400/[0.06] p-6 text-center font-mono text-sm text-cyan-100"><span className="live-dot bg-neon" aria-hidden /> Uploading… server is fingerprinting (SHA-256)</p> : <MediaCapture item={item} unit={unit} phase={phase} onCapture={handleCapture} />}
            {retaking && <button onClick={() => setRetaking(false)} className="btn btn-ghost w-full text-muted-foreground">Keep the current photo</button>}
          </div>
        ) : (
          <p className="rounded-[3px] border border-purple-500/25 p-4 font-mono text-sm text-muted-foreground">[LOCKED] This inspection is locked.</p>
        )}

        <label className="block text-sm font-medium">Condition notes (optional)
          <textarea value={noteValue} disabled={!editable} rows={2} onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))} onBlur={saveNotes}
            placeholder="Describe anything already damaged or worn…" className="field mt-1.5" />
        </label>
      </section>

      <div className="flex gap-3">
        <button disabled={step === 0} onClick={() => { setStep(step - 1); setRetaking(false); }} className="btn btn-outline btn-lg"><ChevronLeft size={18} /> Back</button>
        {step < items.length - 1 ? (
          <button onClick={() => { saveNotes(); setStep(step + 1); setRetaking(false); }} className="btn btn-primary btn-lg flex-1">Next <ChevronRight size={18} /></button>
        ) : (
          <button disabled={done < items.length || busy} onClick={() => { saveNotes(); setConfirming(true); }} className="btn btn-primary btn-lg flex-1">
            <Lock size={18} /> Lock &amp; Submit Official Inspection
          </button>
        )}
      </div>
      {step === items.length - 1 && done < items.length && <p className="text-center font-mono text-xs text-[#FFB800]">Photograph every item to submit ({items.length - done} left).</p>}

      {confirming && (
        <Modal title="Submit your official inspection?" onClose={() => setConfirming(false)}>
          <p className="text-[#cfc9e6]">
            Once you submit, <b className="text-foreground">nothing can be changed</b>: not by you, not by housing. Your photos and notes are stamped with the server time as your official record.
          </p>
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">{done} files · SHA-256 fingerprinted · server clock</p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setConfirming(false)} className="btn btn-outline btn-lg flex-1">Go back</button>
            <button disabled={busy} onClick={submit} className="btn btn-primary btn-lg flex-1"><Lock size={16} /> {busy ? 'Locking…' : 'Lock & submit'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
