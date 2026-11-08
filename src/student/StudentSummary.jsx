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
        <div className="flex gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-900">
          <Info className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-semibold">Move-in submitted and locked</p>
            <p className="text-sm">Locked at {fmtDateTime(unit.move_in_locked_at)} (server time). Nobody can change it. Housing will open move-out when it's time.</p>
          </div>
        </div>
      )}

      {completed && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Charges</p><p className="text-lg font-bold text-rose-600">{money(total)}</p></div>
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Waived for you</p><p className="text-lg font-bold text-sky-600">{money(waived)}</p></div>
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Under review</p><p className="text-lg font-bold text-amber-600">{open.length}</p></div>
        </div>
      )}

      {items.map((item) => (
        <article key={item.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <ZoneBadge zone={item.zone_category} />
            <h3 className="font-semibold">{item.item_name}</h3>
            {completed && <span className="ml-auto"><StatusBadge status={item.condition_status} /></span>}
          </div>
          <div className={`grid gap-3 ${completed ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <figure>
              <MediaView path={item.before_media_path} type={item.before_media_type} className="aspect-[4/3] w-full" alt="Move-in" />
              <figcaption className="mt-1 text-xs text-slate-500"><b>Move-in</b> · {fmtDateTime(item.before_captured_at)}{item.before_notes && <span className="block text-slate-600">“{item.before_notes}”</span>}</figcaption>
            </figure>
            {completed && (
              <figure>
                <MediaView path={item.after_media_path} type={item.after_media_type} className="aspect-[4/3] w-full" alt="Move-out" />
                <figcaption className="mt-1 text-xs text-slate-500"><b>Move-out</b> · {fmtDateTime(item.after_captured_at)}{item.after_notes && <span className="block text-slate-600">“{item.after_notes}”</span>}</figcaption>
              </figure>
            )}
          </div>

          {completed && (
            <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
              {item.condition_status === 'NEW_DAMAGE_BILLABLE' && <p>Charge: <b className="text-rose-600">{money(item.estimated_fine)}</b></p>}
              {item.condition_status === 'PRE_EXISTING_DAMAGE' && <p className="text-sky-700">Already damaged at move-in. {money(item.standard_charge)} charge waived.</p>}
              {item.condition_status === 'DISPUTE_UNDER_REVIEW' && <p className="text-amber-700">Under review: housing is checking your dispute.</p>}
              {item.admin_comments && <p className="rounded-lg bg-slate-50 p-2 text-slate-600"><b>Housing:</b> {item.admin_comments}</p>}
              {item.dispute_reason && <p className="rounded-lg bg-amber-50 p-2 text-amber-900"><b>Your dispute</b> ({fmtDateTime(item.disputed_at)}): {item.dispute_reason}</p>}
              {canDispute(profile, unit, item) && (
                <button onClick={() => setDisputing(item)} className="rounded-lg border border-amber-500 px-3 py-1.5 font-medium text-amber-800 hover:bg-amber-50">Dispute this charge</button>
              )}
            </div>
          )}
        </article>
      ))}

      {completed && (
        <Link to={`/report/${unit.unit_code}`} className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-3 font-medium"><FileText size={18} /> View &amp; download PDF report</Link>
      )}

      {disputing && <DisputeDialog item={disputing} onClose={() => setDisputing(null)} onSubmitted={(row) => { onItemChanged(row); setDisputing(null); }} />}
    </div>
  );
}
