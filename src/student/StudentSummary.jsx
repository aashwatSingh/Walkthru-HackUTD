import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Info } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { MediaView, StatusBadge, ZoneBadge } from '../components/ui.jsx';
import DisputeDialog from './DisputeDialog.jsx';
import { canDispute } from '../lib/rules.js';
import { fmtDateTime, money } from '../lib/format.js';

// Read-only view once a phase is locked. Move-out complete → before/after, statuses, fines, dispute button.
export default function StudentSummary({ unit, items, onItemChanged }) {
  const { profile } = useAuth();
  const [disputing, setDisputing] = useState(null);
  const completed = unit.inspection_phase === 'COMPLETED';
  const billable = items.filter((i) => i.condition_status === 'NEW_DAMAGE_BILLABLE');
  const open = items.filter((i) => i.condition_status === 'DISPUTE_UNDER_REVIEW');
  const total = billable.reduce((s, i) => s + Number(i.estimated_fine), 0);
  const waived = items.filter((i) => i.condition_status === 'PRE_EXISTING_DAMAGE').reduce((s, i) => s + Number(i.standard_charge), 0);

  return (
    <div className="space-y-4">
      {!completed && (
        <div className="flex gap-3 rounded-2xl border border-indigo-400/30 bg-indigo-400/10 p-4 text-indigo-200">
          <Info className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-semibold">Move-in submitted and locked</p>
            <p className="text-sm">Locked at {fmtDateTime(unit.move_in_locked_at)} (server time). Nobody can change it. Housing will open move-out when it's time.</p>
          </div>
        </div>
      )}

      {completed && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-card p-3 shadow-sm ring-1 ring-white/10"><p className="text-xs text-muted-foreground">Charges</p><p className="text-lg font-bold text-rose-400">{money(total)}</p></div>
          <div className="rounded-xl bg-card p-3 shadow-sm ring-1 ring-white/10"><p className="text-xs text-muted-foreground">Waived for you</p><p className="text-lg font-bold text-sky-400">{money(waived)}</p></div>
          <div className="rounded-xl bg-card p-3 shadow-sm ring-1 ring-white/10"><p className="text-xs text-muted-foreground">Under review</p><p className="text-lg font-bold text-amber-400">{open.length}</p></div>
        </div>
      )}

      {items.map((item) => (
        <article key={item.id} className="space-y-3 rounded-2xl border border-white/10 bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <ZoneBadge zone={item.zone_category} />
            <h3 className="font-semibold">{item.item_name}</h3>
            {completed && <span className="ml-auto"><StatusBadge status={item.condition_status} /></span>}
          </div>
          <div className={`grid gap-3 ${completed ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <figure>
              <MediaView path={item.before_media_path} type={item.before_media_type} className="aspect-[4/3] w-full" alt="Move-in" />
              <figcaption className="mt-1 text-xs text-muted-foreground"><b>Move-in</b> · {fmtDateTime(item.before_captured_at)}{item.before_notes && <span className="block text-white/75">“{item.before_notes}”</span>}</figcaption>
            </figure>
            {completed && (
              <figure>
                <MediaView path={item.after_media_path} type={item.after_media_type} className="aspect-[4/3] w-full" alt="Move-out" />
                <figcaption className="mt-1 text-xs text-muted-foreground"><b>Move-out</b> · {fmtDateTime(item.after_captured_at)}{item.after_notes && <span className="block text-white/75">“{item.after_notes}”</span>}</figcaption>
              </figure>
            )}
          </div>

          {completed && (
            <div className="space-y-2 border-t border-white/10 pt-3 text-sm">
              {item.condition_status === 'NEW_DAMAGE_BILLABLE' && <p>Charge: <b className="text-rose-400">{money(item.estimated_fine)}</b></p>}
              {item.condition_status === 'PRE_EXISTING_DAMAGE' && <p className="text-sky-200">Already damaged at move-in. {money(item.standard_charge)} charge waived.</p>}
              {item.condition_status === 'DISPUTE_UNDER_REVIEW' && <p className="text-amber-200">Under review: housing is checking your dispute.</p>}
              {item.admin_comments && <p className="rounded-lg bg-white/5 p-2 text-white/75"><b>Housing:</b> {item.admin_comments}</p>}
              {item.dispute_reason && <p className="rounded-lg bg-amber-400/10 p-2 text-amber-200"><b>Your dispute</b> ({fmtDateTime(item.disputed_at)}): {item.dispute_reason}</p>}
              {canDispute(profile, unit, item) && (
                <button onClick={() => setDisputing(item)} className="btn btn-sm border-amber-400/50 text-amber-200 hover:bg-amber-400/15">Dispute this charge</button>
              )}
            </div>
          )}
        </article>
      ))}

      {completed && (
        <Link to={`/report/${unit.unit_code}`} className="btn btn-outline btn-lg w-full"><FileText size={18} /> View &amp; download PDF report</Link>
      )}

      {disputing && <DisputeDialog item={disputing} onClose={() => setDisputing(null)} onSubmitted={(row) => { onItemChanged(row); setDisputing(null); }} />}
    </div>
  );
}
