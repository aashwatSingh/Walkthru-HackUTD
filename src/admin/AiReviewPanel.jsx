import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check, ClipboardCopy, Cpu, Database, FileSearch, Loader2, Play, Receipt, Send, Sparkles, TriangleAlert } from 'lucide-react';
import { StatusBadge, useToast } from '../components/ui.jsx';
import { getAiReviews, getLatestUnitReport, runAiReview, updateAdminAssessment } from '../lib/dbService.js';
import { fmtDateTime, money } from '../lib/format.js';

// Spec Section 8.4. Nothing is applied automatically: every change is an admin click.

const TOOL_META = {
  list_items: { icon: Database, label: 'list_items' },
  compare_photos: { icon: FileSearch, label: 'compare_photos' },
  calculate_fee: { icon: Receipt, label: 'calculate_fee' },
  get_dispute_evidence: { icon: FileSearch, label: 'get_dispute_evidence' },
  submit_review: { icon: Send, label: 'submit_review' },
};
const PLAN = ['list items', 'compare photos', 'fee schedule', 'dispute evidence', 'submit review'];

// ───────── per-item suggestion card (used in the unit drawer and in the ComparatorModal) ─────────
export function AiItemCard({ result, row, brief, onApply, applying }) {
  if (!result) return null;
  const manual = result.error || result.skipped || result.suggested_status === 'NEEDS_HUMAN_REVIEW';
  const pct = Math.round((result.confidence ?? 0) * 100);
  const applied = row && row.condition_status === result.suggested_status && Number(row.estimated_fine) === Number(result.suggested_fine || 0);
  return (
    <div className="space-y-2 rounded-xl border border-violet-400/30 bg-violet-400/10 p-3 text-sm" data-testid="ai-item-card">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={15} className="text-violet-400" />
        <b>{result.item_name || 'Nemotron suggestion'}</b>
        <span className="ml-auto"><StatusBadge status={result.suggested_status} /></span>
      </div>
      {(result.error || result.skipped) ? (
        <p className="flex items-start gap-1.5 text-white/75"><TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-400" /> Review manually: {result.error || result.skipped}</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="h-2 w-28 overflow-hidden rounded-full bg-white/15"><div className={`h-full ${pct < 60 ? 'bg-white/40' : 'bg-violet-500'}`} style={{ width: `${pct}%` }} /></div>
            <span className="text-xs text-white/75">{pct}% confident{pct < 60 && ' · needs human review'}</span>
          </div>
          {result.findings?.length > 0 && (
            <ul className="space-y-1">
              {result.findings.map((f, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-card px-1.5 py-0.5 text-xs ring-1 ring-white/10">{f.severity}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${f.present_at_move_in ? 'bg-sky-400/15 text-sky-200' : 'bg-rose-400/15 text-rose-200'}`}>{f.present_at_move_in ? 'at move-in' : 'new'}</span>
                  <span>{f.description}{f.location && <span className="text-muted-foreground"> ({f.location})</span>}</span>
                </li>
              ))}
            </ul>
          )}
          {result.rationale && <blockquote className="border-l-2 border-violet-400/30 pl-2 text-white/85">“{result.rationale}” <span className="text-xs text-white/50">: Nemotron</span></blockquote>}
          <p className="font-medium">
            {result.suggested_fine > 0 && <>Suggested fine <b className="text-rose-200">{money(result.suggested_fine)}</b> <span className="font-normal text-muted-foreground">(fee schedule, minus nothing from the AI)</span></>}
            {result.waived_if_pre_existing > 0 && <><b className="text-sky-200">{money(result.waived_if_pre_existing)}</b> waived (pre-existing)</>}
            {!result.suggested_fine && !result.waived_if_pre_existing && <span className="text-muted-foreground">No charge suggested</span>}
          </p>
        </>
      )}
      {brief && <p className="rounded-lg bg-amber-400/10 p-2 text-amber-200"><b>AI recommendation:</b> {brief}</p>}
      {row && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">Current:</span><StatusBadge status={row.condition_status} />
          {applied ? <span className="ml-auto flex items-center gap-1 text-xs text-primary"><Check size={14} /> Applied</span> : (
            <button disabled={manual || applying} onClick={() => onApply(result)} className="btn btn-sm btn-lime ml-auto">
              {applying ? 'Applying…' : 'Apply suggestion'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ───────── unit-level panel ─────────
export default function AiReviewPanel({ unit, rows, onApplied }) {
  const toast = useToast();
  const [state, setState] = useState('idle'); // idle | running | done | error
  const [data, setData] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [applying, setApplying] = useState(null);
  const timer = useRef(null);

  // Show the last saved run instantly, if there is one.
  useEffect(() => {
    let live = true;
    (async () => {
      const [report, reviews] = await Promise.all([getLatestUnitReport(unit.id), getAiReviews(rows.map((r) => r.id))]);
      if (!live) return;
      const items = rows.filter((r) => reviews[r.id]?.DAMAGE_DIFF).map((r) => ({ item_id: r.id, item_name: r.item_name, ...reviews[r.id].DAMAGE_DIFF.result }));
      if (!report && !items.length) return;
      const res = report?.result || {};
      setData({
        mode: res.mode || 'pipeline', vision_mode: res.vision_mode, models: { vision: reviews[rows[0]?.id]?.DAMAGE_DIFF?.model, text: report?.model }, items,
        memo: res.admin_summary ? { admin_summary: res.admin_summary, student_note: res.student_note, dispute_briefs: res.dispute_briefs || [] } : null,
        memo_error: res.memo_error, agent: res.agent || { rounds: 0, tool_calls: 0, trace: [] },
      });
      setSavedAt(report?.created_at || null);
      setState('done');
    })().catch(() => {});
    return () => { live = false; };
  }, [unit.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearInterval(timer.current), []);

  const run = useCallback(async () => {
    setState('running');
    setError('');
    setElapsed(0);
    clearInterval(timer.current);
    timer.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    try {
      const res = await runAiReview(unit.id);
      setData(res);
      setSavedAt(new Date().toISOString());
      setState('done');
    } catch (e) {
      setError(e.message);
      setState('error');
    } finally {
      clearInterval(timer.current);
    }
  }, [unit.id]);

  const apply = async (result) => {
    setApplying(result.item_id);
    try {
      await updateAdminAssessment(result.item_id, {
        status: result.suggested_status,
        fine: result.suggested_fine || 0,
        comments: `AI-assisted (Nemotron), admin-approved: ${result.rationale || ''}`.trim(),
      });
      toast('Suggestion applied.', 'success');
      await onApplied?.();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setApplying(null);
    }
  };

  const rowOf = (id) => rows.find((r) => r.id === id);
  const rounds = data ? [...new Set(data.agent.trace.map((s) => s.round))].sort((a, b) => a - b) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={state === 'running'} className="btn btn-lime btn-lg">
          {state === 'running' ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} {state === 'running' ? 'Reviewing…' : data ? 'Run again' : 'Run Nemotron Review'}
        </button>
        {state === 'idle' && <span className="text-sm text-muted-foreground">Nemotron plans the review and calls tools. Usually 10–40 s.</span>}
        {state !== 'running' && savedAt && <span className="text-sm text-muted-foreground">Last run: {fmtDateTime(savedAt)} · {data?.mode}{data?.elapsed_ms ? ` · ${(data.elapsed_ms / 1000).toFixed(1)} s` : ''}</span>}
      </div>

      {state === 'running' && (
        <div className="rounded-xl border border-violet-400/30 bg-violet-400/10 p-4" role="status">
          <p className="mb-2 flex items-center gap-2 font-medium text-violet-200"><Loader2 size={16} className="animate-spin" /> Nemotron agent working… {elapsed}s</p>
          <ol className="flex flex-wrap gap-2 text-xs text-muted-foreground">{PLAN.map((p, i) => <li key={p} className="rounded-full bg-card px-2.5 py-1 ring-1 ring-white/10">{i + 1}. {p}</li>)}</ol>
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200" role="alert">
          <p className="font-semibold">AI review unavailable: manual review still works.</p>
          <p className="mt-1">{error}</p>
          <button onClick={run} className="btn btn-sm btn-danger mt-2">Retry</button>
        </div>
      )}

      {state === 'done' && data && (
        <>
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-sm ${data.mode === 'agent' ? 'bg-primary/15 text-primary' : 'bg-white/10 text-white/85'}`} data-testid="ai-mode">
            {data.mode === 'agent' ? <Bot size={18} /> : <Cpu size={18} />}
            <b>{data.mode === 'agent' ? 'Nemotron agent' : 'Pipeline mode'}</b>
            {data.mode === 'agent' && <span>· {data.agent.rounds} rounds · {data.agent.tool_calls} tool calls{data.elapsed_ms ? ` · ${(data.elapsed_ms / 1000).toFixed(1)} s` : ''}</span>}
            {data.vision_mode === 'single-image' && <span title="This model accepts one image per request, so each comparison runs as two vision calls.">· 2-step vision</span>}
            {data.mode !== 'agent' && data.agent.fallback_reason && <span title={data.agent.fallback_reason}>· fallback: {String(data.agent.fallback_reason).slice(0, 80)}</span>}
            <span className="ml-auto text-xs opacity-70">{[data.models?.vision, data.models?.text].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' + ')}</span>
          </div>

          {data.memo ? (
            <section className="rounded-xl border border-white/10 bg-card p-4">
              <h3 className="mb-2 font-semibold">Summary for housing</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">{data.memo.admin_summary.map((b, i) => <li key={i}>{b}</li>)}</ul>
              {data.memo.student_note && (
                <div className="mt-3 rounded-lg bg-white/5 p-3 text-sm">
                  <p className="mb-1 flex items-center justify-between font-medium">Note to the student
                    <button onClick={() => { navigator.clipboard?.writeText(data.memo.student_note); toast('Copied.', 'success'); }} className="flex items-center gap-1 text-xs font-normal text-primary"><ClipboardCopy size={13} /> Copy</button>
                  </p>
                  <p className="text-white/85">{data.memo.student_note}</p>
                </div>
              )}
            </section>
          ) : (
            <p className="rounded-xl bg-white/10 p-3 text-sm text-white/75">Summary unavailable{data.memo_error ? ` (${data.memo_error})` : ''}. The item cards below still work.</p>
          )}

          {data.agent.trace.length > 0 && (
            <section className="rounded-xl border border-white/10 bg-card p-4" data-testid="ai-timeline">
              <h3 className="mb-3 font-semibold">Agent timeline</h3>
              <ol className="space-y-3">
                {rounds.map((round) => {
                  const steps = data.agent.trace.filter((s) => s.round === round);
                  return (
                    <li key={round}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {round === 0 ? 'Checked by code (coverage)' : `Round ${round}${steps.length > 1 ? ` · ${steps.length} tools in parallel` : ''}`}
                      </p>
                      <ul className="space-y-1">
                        {steps.map((s, i) => {
                          const Icon = (TOOL_META[s.tool] || TOOL_META.list_items).icon;
                          return (
                            <li key={i} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${s.ok ? 'bg-white/5' : 'bg-red-400/10 text-red-200'}`}>
                              <Icon size={15} className="shrink-0 text-violet-400" />
                              <code className="text-xs font-semibold">{s.tool}</code>
                              <span className="min-w-0 flex-1 truncate">{s.summary}</span>
                              <span className="shrink-0 text-xs text-white/50">{s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`}</span>
                              <span aria-label={s.ok ? 'ok' : 'failed'}>{s.ok ? '✓' : '✗'}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="font-semibold">Suggestions by item</h3>
            {data.items.map((it) => (
              <AiItemCard key={it.item_id} result={it} row={rowOf(it.item_id)} applying={applying === it.item_id} onApply={apply}
                brief={data.memo?.dispute_briefs?.find((d) => d.item_id === it.item_id)?.brief} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
