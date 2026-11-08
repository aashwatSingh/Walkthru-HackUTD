import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import AppShell from '../components/AppShell.jsx';
import { EvidenceFrame, MediaView, Spinner, StatusBadge } from '../components/ui.jsx';
import { getAiReviews, getInspectionItems, getUnitByCode } from '../lib/dbService.js';
import { fmtUtc, money, shortHash } from '../lib/format.js';

// /report/:unitCode: a print-optimised record of the whole room. "Download PDF" = the browser's Save as PDF.
export default function ReportPage() {
  const { unitCode } = useParams();
  const { profile } = useAuth();
  const [unit, setUnit] = useState(undefined);
  const [items, setItems] = useState([]);
  const [ai, setAi] = useState({});

  useEffect(() => {
    (async () => {
      const u = await getUnitByCode(unitCode);
      setUnit(u);
      if (!u) return;
      const list = await getInspectionItems(u.id);
      setItems(list);
      if (profile.role === 'admin') setAi(await getAiReviews(list.map((i) => i.id)));
    })().catch(() => setUnit(null));
  }, [unitCode, profile.role]);

  if (unit === undefined) return <AppShell><Spinner label="Building report…" /></AppShell>;
  if (unit === null) return <AppShell><p className="mt-10 text-center text-muted-foreground">Report not available. This room isn't assigned to you.</p></AppShell>;

  const billable = items.filter((i) => i.condition_status === 'NEW_DAMAGE_BILLABLE').reduce((s, i) => s + Number(i.estimated_fine), 0);
  const waived = items.filter((i) => i.condition_status === 'PRE_EXISTING_DAMAGE').reduce((s, i) => s + Number(i.standard_charge), 0);

  return (
    <AppShell wide>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground">EXPORT // OFFICIAL_RECORD · prints black-on-white</p>
        <button onClick={() => window.print()} className="btn btn-primary btn-lg"><Printer size={18} /> Download PDF</button>
      </div>
      <article className="print-area hud-panel mx-auto max-w-4xl space-y-5 p-6 print:bg-white print:text-black">
        <header className="border-b border-purple-500/25 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Walkthrough · Official inspection record</p>
            <p className="font-mono text-[11px] text-neon">CASE // {unit.unit_code}</p>
          </div>
          <h1 className="mt-1 font-heading text-2xl font-bold">{unit.building_name} · Room {unit.room_number}</h1>
          <p className="text-sm text-[#cfc9e6]">{unit.assigned_student_name} · <span className="font-mono text-xs">{unit.assigned_student_email}</span> · {unit.semester}</p>
          <p className="mt-1 font-mono text-[11px] text-[#cfc9e6]">Move-in locked: <b>{fmtUtc(unit.move_in_locked_at)}</b> · Move-out locked: <b>{fmtUtc(unit.move_out_locked_at)}</b> (server time)</p>
        </header>

        {items.map((i) => {
          const review = ai[i.id]?.DAMAGE_DIFF?.result;
          return (
            <section key={i.id} className="break-inside-avoid space-y-2 border-b border-purple-500/20 pb-4">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-heading font-semibold">{i.step_order}. {i.item_name}</h2><span className="font-mono text-[10.5px] uppercase text-muted-foreground">{i.zone_category}</span><span className="ml-auto"><StatusBadge status={i.condition_status} /></span></div>
              <div className="grid grid-cols-2 gap-3">
                {['before', 'after'].map((p) => (
                  <figure key={p}>
                    <EvidenceFrame small label={p === 'before' ? 'MOVE_IN' : 'MOVE_OUT'}>
                      <MediaView path={i[`${p}_media_path`]} type={i[`${p}_media_type`]} className="aspect-[4/3] w-full" alt={p} />
                    </EvidenceFrame>
                    <figcaption className="mt-1.5 font-mono text-[10.5px] text-[#cfc9e6]">
                      <b className="font-sans text-xs">{p === 'before' ? 'Move-in' : 'Move-out'}</b> · {fmtUtc(i[`${p}_captured_at`])}
                      {i[`${p}_sha256`] && <> · SHA-256 <code className="text-neon">{shortHash(i[`${p}_sha256`])}</code></>}
                      {i[`${p}_notes`] && <span className="mt-0.5 block font-sans text-xs">“{i[`${p}_notes`]}”</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className="text-sm">
                {i.condition_status === 'NEW_DAMAGE_BILLABLE' && <>Charge: <b className="font-mono">{money(i.estimated_fine)}</b>. </>}
                {i.condition_status === 'PRE_EXISTING_DAMAGE' && <>Pre-existing; <span className="font-mono">{money(i.standard_charge)}</span> waived. </>}
                {i.admin_comments && <>Housing: {i.admin_comments}</>}
              </p>
              {i.dispute_reason && <p className="text-sm text-[#ffe3a1]">Student dispute (<span className="font-mono text-xs">{fmtUtc(i.disputed_at)}</span>): {i.dispute_reason}</p>}
              {review && !review.error && !review.skipped && <p className="text-xs italic text-muted-foreground">AI-assisted · admin-approved: Nemotron suggested “{review.suggested_status.replaceAll('_', ' ').toLowerCase()}” ({Math.round(review.confidence * 100)}% confidence). {review.rationale}</p>}
            </section>
          );
        })}

        <footer className="flex flex-wrap items-baseline gap-6 text-sm">
          <p>Total charges: <b className="font-mono text-[#FF5C8D]">{money(billable)}</b></p>
          <p>Waived (pre-existing): <b className="font-mono text-neon">{money(waived)}</b></p>
          <p className="ml-auto font-mono text-[10.5px] text-muted-foreground">Generated {fmtUtc(new Date().toISOString())}</p>
        </footer>
      </article>
    </AppShell>
  );
}
