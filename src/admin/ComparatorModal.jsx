import { useEffect, useRef, useState } from 'react';
import { Ban, CheckCircle2, ChevronLeft, ChevronRight, Columns2, Equal, Loader2, MessageSquareWarning, Scale, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EvidenceFrame, MediaView, Modal, Segmented, StatusBadge, useToast } from '../components/ui.jsx';
import CompareSlider from './CompareSlider.jsx';
import IntegrityBadge from './IntegrityBadge.jsx';
import { AiItemCard } from './AiReviewPanel.jsx';
import { getAiReviews, updateAdminAssessment } from '../lib/dbService.js';
import { canAssess } from '../lib/rules.js';
import { fmtUtc, money } from '../lib/format.js';

const VIEWS = [['side', 'Side by side', Columns2], ['slider', 'Slider', SlidersHorizontal]];

// Side-by-side Move-in / Move-out evidence + admin resolution controls.
// `rows` is the list the table is showing: ← and → step through it without closing.
export default function ComparatorModal({ row, rows = [], onNavigate, onClose, onChanged }) {
  const { profile } = useAuth();
  const toast = useToast();
  const unit = { inspection_phase: row.inspection_phase };
  const assess = canAssess(profile, unit);
  const bothImages = row.before_media_type === 'image' && row.after_media_type === 'image' && row.before_media_path && row.after_media_path;
  const [view, setView] = useState('side');
  const [comment, setComment] = useState(row.admin_comments || '');
  const [fine, setFine] = useState(row.condition_status === 'NEW_DAMAGE_BILLABLE' ? row.estimated_fine : row.standard_charge);
  const [busy, setBusy] = useState('');
  const [ai, setAi] = useState(null);
  const commentRef = useRef(null);
  const disputed = row.condition_status === 'DISPUTE_UNDER_REVIEW';

  const at = rows.findIndex((r) => r.id === row.id);
  const prev = at > 0 ? rows[at - 1] : null;
  const next = at >= 0 && at < rows.length - 1 ? rows[at + 1] : null;

  useEffect(() => {
    getAiReviews([row.id]).then((r) => {
      const hit = r[row.id]?.DAMAGE_DIFF;
      setAi(hit ? { item_id: row.id, item_name: row.item_name, ...hit.result } : null);
    }).catch(() => {});
  }, [row.id, row.item_name]);

  // ← and → move to the neighbouring item (not while typing or dragging the slider).
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft' && prev) onNavigate?.(prev.id);
      if (e.key === 'ArrowRight' && next) onNavigate?.(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onNavigate]);

  const resolve = async (status, fineValue, label, key) => {
    if (disputed && !comment.trim()) {
      toast('Add a comment explaining your decision. It is required for disputes.', 'error');
      commentRef.current?.focus();
      return;
    }
    setBusy(key);
    try {
      await updateAdminAssessment(row.id, { status, fine: fineValue, comments: comment.trim() || undefined });
      toast(`${label}.`, 'success');
      await onChanged();
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const side = (phase, title) => (
    <figure className="min-w-0 space-y-2">
      <figcaption className="flex flex-wrap items-baseline gap-2"><b>{title}</b><span className="fact">{fmtUtc(row[`${phase}_captured_at`])}</span></figcaption>
      <EvidenceFrame
        label={<>{row.unit_code} · {phase === 'before' ? 'MOVE-IN' : 'MOVE-OUT'}</>}
        right={<span className="flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${phase === 'before' ? 'bg-neon' : 'bg-alert'}`} aria-hidden /> ARCHIVED</span>}>
        <MediaView path={row[`${phase}_media_path`]} type={row[`${phase}_media_type`]} alt={title} className="aspect-[4/3] w-full" zoom />
      </EvidenceFrame>
      <IntegrityBadge path={row[`${phase}_media_path`]} sha={row[`${phase}_sha256`]} capturedAt={row[`${phase}_captured_at`]} />
      {row[`${phase}_notes`] && <p className="well p-2.5 text-sm text-soft"><b className="text-[12px] font-semibold text-muted-foreground">Student note</b><br />“{row[`${phase}_notes`]}”</p>}
    </figure>
  );

  const stepper = rows.length > 1 && at >= 0 && (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" disabled={!prev} onClick={() => onNavigate?.(prev.id)} aria-label="Previous item" title="Previous item (←)" className="btn btn-outline btn-icon size-8"><ChevronLeft size={16} /></button>
      <span className="fact min-w-[3.2rem] text-center tabular-nums">{at + 1} / {rows.length}</span>
      <button type="button" disabled={!next} onClick={() => onNavigate?.(next.id)} aria-label="Following item" title="Following item (→)" className="btn btn-outline btn-icon size-8"><ChevronRight size={16} /></button>
    </div>
  );

  return (
    <Modal title={`${row.item_name} · ${row.unit_code} · ${row.assigned_student_name}`} onClose={onClose} wide actions={stepper}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={row.condition_status} />
        <span className="text-[13px] text-muted-foreground">Fee schedule <b className="font-mono font-medium text-soft">{money(row.standard_charge)}</b> · current fine <b className="font-mono text-foreground">{money(row.estimated_fine)}</b></span>
        {bothImages && <Segmented options={VIEWS} value={view} onChange={setView} label="How to compare the photos" tabs className="ml-auto" />}
      </div>

      {view === 'slider' && bothImages ? (
        <div className="animate-fade mx-auto max-w-2xl">
          <CompareSlider beforePath={row.before_media_path} afterPath={row.after_media_path} />
          <div className="mt-2 flex flex-wrap justify-between gap-2">
            <IntegrityBadge path={row.before_media_path} sha={row.before_sha256} capturedAt={row.before_captured_at} />
            <IntegrityBadge path={row.after_media_path} sha={row.after_sha256} capturedAt={row.after_captured_at} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{side('before', 'Move-in (Before)')}{side('after', 'Move-out (After)')}</div>
      )}

      {row.dispute_reason && (
        <div className="mt-4 flex gap-2.5 rounded-lg border border-warn/45 bg-warn/10 p-3 text-sm text-[#ffe3a1]">
          <MessageSquareWarning size={17} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <p><b>Student dispute</b> (<span className="font-mono text-xs">{fmtUtc(row.disputed_at)}</span>): {row.dispute_reason}</p>
        </div>
      )}

      {ai && <div className="mt-4"><AiItemCard result={ai} row={row} onApply={async (r) => resolve(r.suggested_status, r.suggested_fine || 0, 'Suggestion applied', 'ai')} applying={busy === 'ai'} /></div>}

      <section className="well mt-4 space-y-3 p-4">
        <h3 className="flex items-center gap-2 font-semibold"><Scale size={17} className="text-lilac" /> Resolution <span className="fact ml-auto font-normal">every decision is logged</span></h3>
        {!assess && <p className="rounded-lg border border-line p-2.5 text-sm text-muted-foreground">Items can be assessed after the student submits move-out (this unit is {row.inspection_phase.replaceAll('_', ' ').toLowerCase()}).</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <label className="label">Comment{disputed && <span className="text-blush"> (required for disputes)</span>}
            <textarea ref={commentRef} value={comment} onChange={(e) => setComment(e.target.value)} rows={2} disabled={!assess} className="field mt-1.5" placeholder="Visible to the student." />
          </label>
          <label className="label">Fine if billable ($)
            <input type="number" min="0" step="0.01" value={fine} onChange={(e) => setFine(e.target.value)} disabled={!assess} className="field mt-1.5 font-mono" />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!assess || !!busy} onClick={() => resolve('PRE_EXISTING_DAMAGE', 0, 'Fine waived', 'waive')} className="btn btn-lg btn-tone-cyan">{busy === 'waive' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Waive Fine (Pre-Existing Proof)</button>
          <button disabled={!assess || !!busy} onClick={() => resolve('NEW_DAMAGE_BILLABLE', Number(fine) || 0, 'Billable fine approved', 'bill')} className="btn btn-lg btn-tone-rose">{busy === 'bill' ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Approve Billable Fine</button>
          <button disabled={!assess || !!busy} onClick={() => resolve('NO_CHANGE', 0, 'Marked no change', 'same')} className="btn btn-lg btn-tone-matrix">{busy === 'same' ? <Loader2 size={16} className="animate-spin" /> : <Equal size={16} />} Mark No Change</button>
        </div>
      </section>
    </Modal>
  );
}
