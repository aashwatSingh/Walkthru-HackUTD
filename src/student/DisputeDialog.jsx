import { useState } from 'react';
import { Loader2, Lock, Scale } from 'lucide-react';
import { EvidenceFrame, MediaView, Modal, useToast } from '../components/ui.jsx';
import { submitDispute } from '../lib/dbService.js';
import { fmtUtc, money } from '../lib/format.js';

const MIN = 10;

export default function DisputeDialog({ item, onClose, onSubmitted }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const length = reason.trim().length;
  const ok = length >= MIN;

  const submit = async () => {
    setBusy(true);
    try {
      const row = await submitDispute(item.id, reason);
      toast('Dispute submitted. Housing will review it.', 'success');
      onSubmitted(row);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Dispute: ${item.item_name}`} onClose={onClose}>
      <p className="text-sm text-soft">Charge: <b className="font-mono text-blush">{money(item.estimated_fine)}</b>. You can dispute a charge once. Your locked move-in evidence is attached automatically.</p>
      <div className="well mt-3 flex gap-3 p-3">
        <EvidenceFrame small className="size-24 shrink-0"><MediaView path={item.before_media_path} type={item.before_media_type} alt="Your move-in photo" className="size-24" zoom /></EvidenceFrame>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Your move-in photo</p>
          <p className="fact">{fmtUtc(item.before_captured_at)}</p>
          <p className="mt-1.5"><span className="chip border-violet/50 bg-violet/15 text-lilac"><Lock size={11} aria-hidden /> Attached, locked</span></p>
          {item.before_notes && <p className="mt-1.5 text-soft">“{item.before_notes}”</p>}
        </div>
      </div>
      <label className="label mt-4" htmlFor="dispute-reason">Why is this charge wrong?</label>
      <textarea id="dispute-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={2000} placeholder="e.g. This was already damaged at move-in. See my photo from Aug 18."
        className="field mt-1.5" />
      {/* the bar fills, then turns green, as the reason reaches the minimum length */}
      <div className="mt-2 flex items-center gap-3">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <span className={`block h-full origin-left rounded-full transition-[transform,background-color] duration-200 ${ok ? 'bg-matrix shadow-[0_0_8px_#00ff9d]' : 'bg-warn'}`} style={{ transform: `scaleX(${Math.min(1, length / MIN)})` }} />
        </span>
        <span className={`fact ${ok ? 'text-matrix' : ''}`}>{ok ? 'Ready to send' : `At least ${MIN} characters (${length}/${MIN})`}</span>
      </div>
      <div className="mt-4 flex gap-3">
        <button onClick={onClose} className="btn btn-outline btn-lg flex-1">Cancel</button>
        <button disabled={!ok || busy} onClick={submit} className="btn btn-amber btn-lg flex-1">{busy ? <Loader2 size={16} className="animate-spin" /> : <Scale size={16} />} {busy ? 'Sending…' : 'Submit dispute'}</button>
      </div>
    </Modal>
  );
}
