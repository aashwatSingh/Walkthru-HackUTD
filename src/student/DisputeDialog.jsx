import { useState } from 'react';
import { EvidenceFrame, MediaView, Modal, useToast } from '../components/ui.jsx';
import { submitDispute } from '../lib/dbService.js';
import { fmtUtc, money } from '../lib/format.js';

export default function DisputeDialog({ item, onClose, onSubmitted }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = reason.trim().length >= 10;

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
      <p className="text-sm text-[#cfc9e6]">Charge: <b className="font-mono text-[#FF5C8D]">{money(item.estimated_fine)}</b>. You can dispute a charge once. Your locked move-in evidence is attached automatically.</p>
      <div className="mt-3 flex gap-3 rounded-[3px] border border-purple-500/25 bg-void/50 p-3">
        <EvidenceFrame small className="h-24 w-24 shrink-0"><MediaView path={item.before_media_path} type={item.before_media_type} className="h-24 w-24" /></EvidenceFrame>
        <div className="text-sm">
          <p className="font-medium">Your move-in photo</p>
          <p className="font-mono text-[11px] text-muted-foreground">{fmtUtc(item.before_captured_at)}</p>
          <p className="mt-1"><span className="hud-pill border-purple-500/50 bg-purple-500/15 text-[#c79bff]">[ATTACHED // LOCKED_EVIDENCE]</span></p>
          {item.before_notes && <p className="mt-1 text-[#cfc9e6]">“{item.before_notes}”</p>}
        </div>
      </div>
      <label className="mt-4 block text-sm font-medium">Why is this charge wrong?
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="e.g. This was already damaged at move-in. See my photo from Aug 18."
          className="field mt-1" />
      </label>
      <p className="mt-1 text-xs text-muted-foreground">At least 10 characters.</p>
      <div className="mt-4 flex gap-3">
        <button onClick={onClose} className="btn btn-outline btn-lg flex-1">Cancel</button>
        <button disabled={!ok || busy} onClick={submit} className="btn btn-lg flex-1 bg-[#FFB800] text-void hover:bg-[#ffcb40] hover:shadow-[0_0_18px_rgb(255_184_0/0.4)]">{busy ? 'Sending…' : 'Submit dispute'}</button>
      </div>
    </Modal>
  );
}
