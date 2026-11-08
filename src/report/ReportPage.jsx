import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import AppShell from '../components/AppShell.jsx';
import { MediaView, Spinner, StatusBadge } from '../components/ui.jsx';
import { getAiReviews, getInspectionItems, getUnitByCode } from '../lib/dbService.js';
import { fmtDateTime, money, shortHash } from '../lib/format.js';

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
  if (unit === null) return <AppShell><p className="mt-10 text-center text-slate-600">Report not available. This room isn't assigned to you.</p></AppShell>;

  const billable = items.filter((i) => i.condition_status === 'NEW_DAMAGE_BILLABLE').reduce((s, i) => s + Number(i.estimated_fine), 0);
  const waived = items.filter((i) => i.condition_status === 'PRE_EXISTING_DAMAGE').reduce((s, i) => s + Number(i.standard_charge), 0);

  return (
    <AppShell wide>
      <div className="no-print mb-4 flex justify-end">
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white"><Printer size={18} /> Download PDF</button>
      </div>
      <article className="print-area mx-auto max-w-4xl space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <header className="border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Walkthrough · Official inspection record</p>
          <h1 className="text-2xl font-bold">{unit.building_name} · Room {unit.room_number}</h1>
          <p className="text-sm text-slate-600">{unit.assigned_student_name} · {unit.assigned_student_email} · {unit.semester}</p>
          <p className="mt-1 text-sm text-slate-600">Move-in locked: <b>{fmtDateTime(unit.move_in_locked_at)}</b> · Move-out locked: <b>{fmtDateTime(unit.move_out_locked_at)}</b> (server time)</p>
        </header>

        {items.map((i) => {
          const review = ai[i.id]?.DAMAGE_DIFF?.result;
          return (
            <section key={i.id} className="break-inside-avoid space-y-2 border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{i.step_order}. {i.item_name}</h2><span className="text-xs text-slate-500">{i.zone_category}</span><span className="ml-auto"><StatusBadge status={i.condition_status} /></span></div>
              <div className="grid grid-cols-2 gap-3">
                {['before', 'after'].map((p) => (
                  <figure key={p}>
                    <MediaView path={i[`${p}_media_path`]} type={i[`${p}_media_type`]} className="aspect-[4/3] w-full" alt={p} />
                    <figcaption className="mt-1 text-xs text-slate-600">
                      <b>{p === 'before' ? 'Move-in' : 'Move-out'}</b> · {fmtDateTime(i[`${p}_captured_at`])}
                      {i[`${p}_sha256`] && <> · SHA-256 <code>{shortHash(i[`${p}_sha256`])}</code></>}
                      {i[`${p}_notes`] && <span className="block">“{i[`${p}_notes`]}”</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className="text-sm">
                {i.condition_status === 'NEW_DAMAGE_BILLABLE' && <>Charge: <b>{money(i.estimated_fine)}</b>. </>}
                {i.condition_status === 'PRE_EXISTING_DAMAGE' && <>Pre-existing; {money(i.standard_charge)} waived. </>}
                {i.admin_comments && <>Housing: {i.admin_comments}</>}
              </p>
              {i.dispute_reason && <p className="text-sm text-amber-900">Student dispute ({fmtDateTime(i.disputed_at)}): {i.dispute_reason}</p>}
              {review && !review.error && !review.skipped && <p className="text-xs italic text-slate-500">AI-assisted · admin-approved: Nemotron suggested “{review.suggested_status.replaceAll('_', ' ').toLowerCase()}” ({Math.round(review.confidence * 100)}% confidence). {review.rationale}</p>}
            </section>
          );
        })}

        <footer className="flex flex-wrap gap-6 text-sm">
          <p>Total charges: <b className="text-rose-700">{money(billable)}</b></p>
          <p>Waived (pre-existing): <b className="text-sky-700">{money(waived)}</b></p>
          <p className="ml-auto text-xs text-slate-400">Generated {fmtDateTime(new Date().toISOString())}</p>
        </footer>
      </article>
    </AppShell>
  );
}
