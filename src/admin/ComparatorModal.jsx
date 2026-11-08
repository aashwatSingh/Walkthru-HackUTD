import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, Equal, Scale } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { MediaView, Modal, StatusBadge, useToast } from '../components/ui.jsx';
import CompareSlider from './CompareSlider.jsx';
import IntegrityBadge from './IntegrityBadge.jsx';
import { AiItemCard } from './AiReviewPanel.jsx';
import { getAiReviews, updateAdminAssessment } from '../lib/dbService.js';
import { canAssess } from '../lib/rules.js';
import { fmtDateTime, money } from '../lib/format.js';

// Side-by-side Move-in / Move-out evidence + admin resolution controls.
export default function ComparatorModal({ row, onClose, onChanged }) {
  const { profile } = useAuth();
  const toast = useToast();
  const unit = { inspection_phase: row.inspection_phase };
  const assess = canAssess(profile, unit);
  const bothImages = row.before_media_type === 'image' && row.after_media_type === 'image' && row.before_media_path && row.after_media_path;
  const [view, setView] = useState('side');
  const [comment, setComment] = useState(row.admin_comments || '');
  const [fine, setFine] = useState(row.condition_status === 'NEW_DAMAGE_BILLABLE' ? row.estimated_fine : row.standard_charge);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(null);
  const disputed = row.condition_status === 'DISPUTE_UNDER_REVIEW';

  useEffect(() => {
    getAiReviews([row.id]).then((r) => {
      const hit = r[row.id]?.DAMAGE_DIFF;
      setAi(hit ? { item_id: row.id, item_name: row.item_name, ...hit.result } : null);
    }).catch(() => {});
  }, [row.id, row.item_name]);

  const resolve = async (status, fineValue, label) => {
    if (disputed && !comment.trim()) { toast('Add a comment explaining your decision. It is required for disputes.', 'error'); return; }
    setBusy(true);
    try {
      await updateAdminAssessment(row.id, { status, fine: fineValue, comments: comment.trim() || undefined });
      toast(`${label}.`, 'success');
      await onChanged();
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const side = (phase, title) => (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-center gap-2"><b>{title}</b><span className="text-sm text-muted-foreground">{fmtDateTime(row[`${phase}_captured_at`])}</span></figcaption>
      <MediaView path={row[`${phase}_media_path`]} type={row[`${phase}_media_type`]} alt={title} className="aspect-[4/3] w-full" />
      <IntegrityBadge path={row[`${phase}_media_path`]} sha={row[`${phase}_sha256`]} capturedAt={row[`${phase}_captured_at`]} />
      {row[`${phase}_notes`] && <p className="rounded-lg bg-white/5 p-2 text-sm text-white/85"><b className="text-xs uppercase text-muted-foreground">Student note:</b> “{row[`${phase}_notes`]}”</p>}
    </figure>
  );

  return (
    <Modal title={`${row.item_name} · ${row.unit_code} · ${row.assigned_student_name}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={row.condition_status} />
        <span className="text-sm text-muted-foreground">Fee schedule: {money(row.standard_charge)} · Current fine: <b>{money(row.estimated_fine)}</b></span>
        {bothImages && (
          <div className="ml-auto flex rounded-lg bg-white/10 p-0.5 text-sm" role="tablist">
            {[['side', 'Side by side'], ['slider', 'Slider']].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-md px-3 py-1 ${view === k ? 'bg-card font-medium shadow-sm' : 'text-white/75'}`}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {view === 'slider' && bothImages ? (
        <div className="mx-auto max-w-2xl">
          <CompareSlider beforePath={row.before_media_path} afterPath={row.after_media_path} />
          <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground">
            <IntegrityBadge path={row.before_media_path} sha={row.before_sha256} capturedAt={row.before_captured_at} />
            <IntegrityBadge path={row.after_media_path} sha={row.after_sha256} capturedAt={row.after_captured_at} />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{side('before', 'Move-in (Before)')}{side('after', 'Move-out (After)')}</div>
      )}

      {row.dispute_reason && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          <b>Student dispute</b> ({fmtDateTime(row.disputed_at)}): {row.dispute_reason}
        </div>
      )}

      {ai && <div className="mt-4"><AiItemCard result={ai} row={row} onApply={async (r) => resolve(r.suggested_status, r.suggested_fine || 0, 'Suggestion applied')} applying={busy} /></div>}

      <section className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="flex items-center gap-2 font-semibold"><Scale size={17} /> Resolution</h3>
        {!assess && <p className="rounded-lg bg-card p-2 text-sm text-white/75">Items can be assessed after the student submits move-out (this unit is {row.inspection_phase.replaceAll('_', ' ').toLowerCase()}).</p>}
        <label className="block text-sm font-medium">Comment{disputed && <span className="text-red-400"> (required for disputes)</span>}
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} disabled={!assess} className="field mt-1" placeholder="Visible to the student." />
        </label>
        <label className="block max-w-[200px] text-sm font-medium">Fine if billable ($)
          <input type="number" min="0" step="0.01" value={fine} onChange={(e) => setFine(e.target.value)} disabled={!assess} className="field mt-1" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button disabled={!assess || busy} onClick={() => resolve('PRE_EXISTING_DAMAGE', 0, 'Fine waived')} className="btn btn-lg border-sky-400/40 bg-sky-400/15 text-sky-200 hover:bg-sky-400/30"><CheckCircle2 size={16} /> Waive Fine (Pre-Existing Proof)</button>
          <button disabled={!assess || busy} onClick={() => resolve('NEW_DAMAGE_BILLABLE', Number(fine) || 0, 'Billable fine approved')} className="btn btn-lg border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/30"><Ban size={16} /> Approve Billable Fine</button>
          <button disabled={!assess || busy} onClick={() => resolve('NO_CHANGE', 0, 'Marked no change')} className="btn btn-lg border-primary/40 bg-primary/15 text-primary hover:bg-primary/30"><Equal size={16} /> Mark No Change</button>
        </div>
      </section>
    </Modal>
  );
}
