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
      <figcaption className="flex flex-wrap items-center gap-2"><b>{title}</b><span className="text-sm text-slate-500">{fmtDateTime(row[`${phase}_captured_at`])}</span></figcaption>
      <MediaView path={row[`${phase}_media_path`]} type={row[`${phase}_media_type`]} alt={title} className="aspect-[4/3] w-full" />
      <IntegrityBadge path={row[`${phase}_media_path`]} sha={row[`${phase}_sha256`]} capturedAt={row[`${phase}_captured_at`]} />
      {row[`${phase}_notes`] && <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700"><b className="text-xs uppercase text-slate-500">Student note:</b> “{row[`${phase}_notes`]}”</p>}
    </figure>
  );

  return (
    <Modal title={`${row.item_name} · ${row.unit_code} · ${row.assigned_student_name}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={row.condition_status} />
        <span className="text-sm text-slate-500">Fee schedule: {money(row.standard_charge)} · Current fine: <b>{money(row.estimated_fine)}</b></span>
        {bothImages && (
          <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5 text-sm" role="tablist">
            {[['side', 'Side by side'], ['slider', 'Slider']].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-md px-3 py-1 ${view === k ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {view === 'slider' && bothImages ? (
        <div className="mx-auto max-w-2xl">
          <CompareSlider beforePath={row.before_media_path} afterPath={row.after_media_path} />
          <div className="mt-2 flex justify-between gap-3 text-xs text-slate-500">
            <IntegrityBadge path={row.before_media_path} sha={row.before_sha256} capturedAt={row.before_captured_at} />
            <IntegrityBadge path={row.after_media_path} sha={row.after_sha256} capturedAt={row.after_captured_at} />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{side('before', 'Move-in (Before)')}{side('after', 'Move-out (After)')}</div>
      )}

      {row.dispute_reason && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Student dispute</b> ({fmtDateTime(row.disputed_at)}): {row.dispute_reason}
        </div>
      )}

      {ai && <div className="mt-4"><AiItemCard result={ai} row={row} onApply={async (r) => resolve(r.suggested_status, r.suggested_fine || 0, 'Suggestion applied')} applying={busy} /></div>}

      <section className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="flex items-center gap-2 font-semibold"><Scale size={17} /> Resolution</h3>
        {!assess && <p className="rounded-lg bg-white p-2 text-sm text-slate-600">Items can be assessed after the student submits move-out (this unit is {row.inspection_phase.replaceAll('_', ' ').toLowerCase()}).</p>}
        <label className="block text-sm font-medium">Comment{disputed && <span className="text-red-600"> (required for disputes)</span>}
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} disabled={!assess} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100" placeholder="Visible to the student." />
        </label>
        <label className="block max-w-[200px] text-sm font-medium">Fine if billable ($)
          <input type="number" min="0" step="0.01" value={fine} onChange={(e) => setFine(e.target.value)} disabled={!assess} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button disabled={!assess || busy} onClick={() => resolve('PRE_EXISTING_DAMAGE', 0, 'Fine waived')} className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white"><CheckCircle2 size={16} /> Waive Fine (Pre-Existing Proof)</button>
          <button disabled={!assess || busy} onClick={() => resolve('NEW_DAMAGE_BILLABLE', Number(fine) || 0, 'Billable fine approved')} className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white"><Ban size={16} /> Approve Billable Fine</button>
          <button disabled={!assess || busy} onClick={() => resolve('NO_CHANGE', 0, 'Marked no change')} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"><Equal size={16} /> Mark No Change</button>
        </div>
      </section>
    </Modal>
  );
}
