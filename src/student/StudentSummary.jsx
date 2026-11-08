import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Lock } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EvidenceFrame, MediaView, StatusBadge, ZoneBadge } from '../components/ui.jsx';
import DisputeDialog from './DisputeDialog.jsx';
import { canDispute } from '../lib/rules.js';
import { fmtUtc, money, shortHash } from '../lib/format.js';

// Read-only view once a phase is locked. Move-out complete → before/after, statuses, fines, dispute button.
export default function StudentSummary({ unit, items, onItemChanged }) {
  const { profile } = useAuth();
  const [disputing, setDisputing] = useState(null);
  const completed = unit.inspection_phase === 'COMPLETED';
  const billable = items.filter((i) => i.condition_status === 'NEW_DAMAGE_BILLABLE');
  const open = items.filter((i) => i.condition_status === 'DISPUTE_UNDER_REVIEW');
  const total = billable.reduce((s, i) => s + Number(i.estimated_fine), 0);
  const waived = items.filter((i) => i.condition_status === 'PRE_EXISTING_DAMAGE').reduce((s, i) => s + Number(i.standard_charge), 0);

  const shot = (item, p, title, alt) => (
    <figure>
      <EvidenceFrame small label={title.toUpperCase().replace('-', '_')}>
        <MediaView path={item[`${p}_media_path`]} type={item[`${p}_media_type`]} className="aspect-[4/3] w-full" alt={alt} />
      </EvidenceFrame>
      <figcaption className="mt-1.5 text-xs text-muted-foreground">
        <span className="font-mono text-[10.5px]"><b className="font-semibold text-foreground">{title}</b> · {fmtUtc(item[`${p}_captured_at`])}</span>
        {item[`${p}_sha256`] && <span className="mt-1 block"><span className="hud-pill border-cyan-400/40 bg-cyan-400/10 text-neon" title={item[`${p}_sha256`]}>[SHA256 // {shortHash(item[`${p}_sha256`])}]</span></span>}
        {item[`${p}_notes`] && <span className="mt-1 block text-[#cfc9e6]">“{item[`${p}_notes`]}”</span>}
      </figcaption>
    </figure>
  );

  return (
    <div className="space-y-4">
      {!completed && (
        <div className="flex gap-3 rounded-md border border-purple-500/40 bg-purple-500/10 p-4 text-[#e4d6ff]">
          <Lock className="mt-0.5 shrink-0 text-[#c79bff]" size={20} />
          <div>
            <p className="font-semibold text-foreground">Move-in submitted and locked</p>
            <p className="mt-0.5 text-sm">Locked at <span className="font-mono text-xs">{fmtUtc(unit.move_in_locked_at)}</span> (server time). Nobody can change it. Housing will open move-out when it's time.</p>
          </div>
        </div>
      )}

      {completed && (
        <dl className="hud-panel grid grid-cols-3 divide-x divide-purple-500/20 text-center">
          <div className="p-3"><dt className="hud-label">Charges</dt><dd className="mt-1 font-mono text-lg font-bold text-[#FF5C8D]">{money(total)}</dd></div>
          <div className="p-3"><dt className="hud-label">Waived for you</dt><dd className="mt-1 font-mono text-lg font-bold text-neon">{money(waived)}</dd></div>
          <div className="p-3"><dt className="hud-label">Under review</dt><dd className="mt-1 font-mono text-lg font-bold text-[#FFB800]">{open.length}</dd></div>
        </dl>
      )}

      {items.map((item) => (
        <article key={item.id} className="hud-panel space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ZoneBadge zone={item.zone_category} />
            <h3 className="font-semibold">{item.item_name}</h3>
            {completed && <span className="ml-auto"><StatusBadge status={item.condition_status} /></span>}
          </div>
          <div className={`grid gap-3 ${completed ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {shot(item, 'before', 'Move-in', 'Move-in')}
            {completed && shot(item, 'after', 'Move-out', 'Move-out')}
          </div>

          {completed && (
            <div className="space-y-2 border-t border-dashed border-purple-500/25 pt-3 text-sm">
              {item.condition_status === 'NEW_DAMAGE_BILLABLE' && <p>Charge: <b className="font-mono text-[#FF5C8D]">{money(item.estimated_fine)}</b></p>}
              {item.condition_status === 'PRE_EXISTING_DAMAGE' && <p className="text-cyan-100">Already damaged at move-in. <span className="font-mono text-neon">{money(item.standard_charge)}</span> charge waived.</p>}
              {item.condition_status === 'DISPUTE_UNDER_REVIEW' && <p className="text-[#ffe3a1]">Under review: housing is checking your dispute.</p>}
              {item.admin_comments && <p className="rounded-[3px] border border-purple-500/20 bg-void/50 p-2 text-[#cfc9e6]"><b className="text-foreground">Housing:</b> {item.admin_comments}</p>}
              {item.dispute_reason && <p className="rounded-[3px] border border-amber-400/40 bg-amber-400/10 p-2 text-[#ffe3a1]"><b>Your dispute</b> (<span className="font-mono text-xs">{fmtUtc(item.disputed_at)}</span>): {item.dispute_reason}</p>}
              {canDispute(profile, unit, item) && (
                <button onClick={() => setDisputing(item)} className="btn btn-sm border-amber-400/50 text-[#FFB800] hover:bg-amber-400/15">Dispute this charge</button>
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
