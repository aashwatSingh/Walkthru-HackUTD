import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Columns2, FileText, Lock, MessageSquareWarning, Scale, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EvidenceFrame, MediaView, Seal, Segmented, StatusBadge, Ticker, ZoneBadge } from '../components/ui.jsx';
import CompareSlider from '../admin/CompareSlider.jsx';
import DisputeDialog from './DisputeDialog.jsx';
import { canDispute } from '../lib/rules.js';
import { fmtUtc, money } from '../lib/format.js';

const LIT = { NEW_DAMAGE_BILLABLE: 'rose', DISPUTE_UNDER_REVIEW: 'amber', NO_CHANGE: 'matrix' };
const VIEWS = [['side', 'Side by side', Columns2], ['slide', 'Slide', SlidersHorizontal]];

// Read-only view once a phase is locked. Move-out complete → before/after, statuses, fines, dispute button.
export default function StudentSummary({ unit, items, onItemChanged }) {
  const { profile } = useAuth();
  const [disputing, setDisputing] = useState(null);
  const [views, setViews] = useState({}); // item id → 'side' | 'slide'
  const completed = unit.inspection_phase === 'COMPLETED';
  const billable = items.filter((i) => i.condition_status === 'NEW_DAMAGE_BILLABLE');
  const open = items.filter((i) => i.condition_status === 'DISPUTE_UNDER_REVIEW');
  const total = billable.reduce((s, i) => s + Number(i.estimated_fine), 0);
  const waived = items.filter((i) => i.condition_status === 'PRE_EXISTING_DAMAGE').reduce((s, i) => s + Number(i.standard_charge), 0);

  const shot = (item, p, title) => (
    <figure className="min-w-0">
      <EvidenceFrame small label={title.toUpperCase()}>
        <MediaView path={item[`${p}_media_path`]} type={item[`${p}_media_type`]} className="aspect-[4/3] w-full" alt={`${item.item_name}, ${title.toLowerCase()}`} zoom />
      </EvidenceFrame>
      <figcaption className="mt-2 space-y-1.5 text-xs text-muted-foreground">
        <span className="fact block"><b className="font-sans text-[12.5px] font-semibold text-foreground">{title}</b> · {fmtUtc(item[`${p}_captured_at`])}</span>
        <Seal sha={item[`${p}_sha256`]} />
        {item[`${p}_notes`] && <span className="block text-[13px] text-soft">“{item[`${p}_notes`]}”</span>}
      </figcaption>
    </figure>
  );

  return (
    <div className="space-y-4">
      {!completed && (
        <div className="animate-rise flex gap-3.5 rounded-xl border border-violet/40 bg-violet/10 p-4 text-[#e4d6ff]">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-violet/50 bg-violet/20 text-lilac"><Lock size={19} aria-hidden /></span>
          <div>
            <p className="font-semibold text-foreground">Move-in submitted and locked</p>
            <p className="mt-0.5 text-sm">Locked at <span className="font-mono text-xs">{fmtUtc(unit.move_in_locked_at)}</span> (server time). Nobody can change it. Housing will open move-out when it's time.</p>
          </div>
        </div>
      )}

      {completed && (
        <dl className="panel grid grid-cols-3 divide-x divide-line overflow-hidden text-center">
          <div className="p-3.5"><dt className="text-[12px] font-medium text-muted-foreground">Charges</dt><dd className="mt-1 font-mono text-xl font-bold text-blush"><Ticker value={money(total)} /></dd></div>
          <div className="p-3.5"><dt className="text-[12px] font-medium text-muted-foreground">Waived for you</dt><dd className="mt-1 font-mono text-xl font-bold text-neon"><Ticker value={money(waived)} /></dd></div>
          <div className="p-3.5"><dt className="text-[12px] font-medium text-muted-foreground">In review</dt><dd className="mt-1 font-mono text-xl font-bold text-warn"><Ticker value={open.length} /></dd></div>
        </dl>
      )}

      {items.map((item, n) => {
        const both = completed && item.before_media_type === 'image' && item.after_media_type === 'image' && item.before_media_path && item.after_media_path;
        const view = both ? views[item.id] || 'side' : 'side';
        return (
          <article key={item.id} data-lit={completed ? LIT[item.condition_status] || '' : ''} className="panel animate-rise space-y-3.5 p-4" style={{ animationDelay: `${n * 60}ms` }}>
            <div className="flex flex-wrap items-center gap-2">
              <ZoneBadge zone={item.zone_category} />
              <h3 className="font-semibold">{item.item_name}</h3>
              {completed && <span className="ml-auto"><StatusBadge status={item.condition_status} /></span>}
            </div>
            {both && (
              <Segmented options={VIEWS} value={view} onChange={(v) => setViews((s) => ({ ...s, [item.id]: v }))} label={`How to compare ${item.item_name}`} />
            )}
            {view === 'slide' ? (
              <div className="animate-fade"><CompareSlider beforePath={item.before_media_path} afterPath={item.after_media_path} /></div>
            ) : (
              <div className={`grid gap-3 ${completed ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {shot(item, 'before', 'Move-in')}
                {completed && shot(item, 'after', 'Move-out')}
              </div>
            )}

            {completed && (
              <div className="space-y-2 border-t border-dashed border-line pt-3 text-sm empty:hidden">
                {item.condition_status === 'NEW_DAMAGE_BILLABLE' && <p>Charge: <b className="font-mono text-blush">{money(item.estimated_fine)}</b></p>}
                {item.condition_status === 'PRE_EXISTING_DAMAGE' && <p className="text-cyan-50">Already damaged at move-in. <span className="font-mono text-neon">{money(item.standard_charge)}</span> charge waived.</p>}
                {item.condition_status === 'DISPUTE_UNDER_REVIEW' && <p className="animate-tick flex items-center gap-2 text-[#ffe3a1]"><Scale size={15} className="shrink-0 text-warn" aria-hidden /> Under review: housing is checking your dispute.</p>}
                {item.admin_comments && <p className="well p-2.5 text-soft"><b className="text-foreground">Housing:</b> {item.admin_comments}</p>}
                {item.dispute_reason && <p className="rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-[#ffe3a1]"><b>Your dispute</b> (<span className="font-mono text-xs">{fmtUtc(item.disputed_at)}</span>): {item.dispute_reason}</p>}
                {canDispute(profile, unit, item) && (
                  <button onClick={() => setDisputing(item)} className="btn btn-sm border-warn/50 bg-warn/[0.08] text-warn hover:border-warn hover:bg-warn/20 hover:shadow-[0_0_18px_-4px_rgb(255_184_0/0.6)]"><MessageSquareWarning size={14} /> Dispute this charge</button>
                )}
              </div>
            )}
          </article>
        );
      })}

      {completed && (
        <Link to={`/report/${unit.unit_code}`} className="btn btn-outline btn-lg w-full"><FileText size={18} /> View &amp; download PDF report</Link>
      )}

      {disputing && <DisputeDialog item={disputing} onClose={() => setDisputing(null)} onSubmitted={(row) => { onItemChanged(row); setDisputing(null); }} />}
    </div>
  );
}
