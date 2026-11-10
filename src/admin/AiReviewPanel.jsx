import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check, Cpu, Database, FileSearch, Loader2, Play, Receipt, Send, Sparkles, TriangleAlert, X } from 'lucide-react';
import { CopyButton, StatusBadge, useToast } from '../components/ui.jsx';
import { getAiReviews, getLatestUnitReport, runAiReview, updateAdminAssessment } from '../lib/dbService.js';
import { fmtUtc, money } from '../lib/format.js';

// Spec Section 8.4. Nothing is applied automatically: every change is an admin click.

const TOOL_META = {
  list_items: { icon: Database, label: 'list_items' },
  compare_photos: { icon: FileSearch, label: 'compare_photos' },
  calculate_fee: { icon: Receipt, label: 'calculate_fee' },
  get_dispute_evidence: { icon: FileSearch, label: 'get_dispute_evidence' },
  submit_review: { icon: Send, label: 'submit_review' },
};
const PLAN = ['List the items', 'Compare every photo pair', 'Price damage from the fee schedule', 'Pull dispute evidence', 'Write the review'];

// Segmented confidence meter: 10 cells, cyan fading to violet. Below 60% the cells turn grey (needs a human).
function ConfidenceMeter({ pct }) {
  const lit = Math.round(pct / 10);
  return (
    <span className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="animate-tick h-2.5 w-2 rounded-[2px]"
          style={{
            animationDelay: `${i * 35}ms`,
            ...(i < lit
              ? { background: pct < 60 ? '#6b6585' : `color-mix(in oklab, #00F0FF ${100 - i * 9}%, #9D4EDD)`, boxShadow: pct < 60 ? 'none' : '0 0 6px rgb(0 240 255 / 0.45)' }
              : { background: 'rgb(170 150 255 / 0.15)' }),
          }} />
      ))}
    </span>
  );
}

// ───────── per-item suggestion card (used in the unit drawer and in the ComparatorModal) ─────────
export function AiItemCard({ result, row, brief, onApply, applying }) {
  if (!result) return null;
  const manual = result.error || result.skipped || result.suggested_status === 'NEEDS_HUMAN_REVIEW';
  const pct = Math.round((result.confidence ?? 0) * 100);
  const applied = row && row.condition_status === result.suggested_status && Number(row.estimated_fine) === Number(result.suggested_fine || 0);
  return (
    <div data-lit="violet" className="space-y-2.5 rounded-xl border border-violet/35 bg-violet/[0.08] p-3.5 text-sm" data-testid="ai-item-card">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={15} className="text-lilac" />
        <b>{result.item_name || 'Nemotron suggestion'}</b>
        <span className="text-[12px] text-lilac/80">suggested by Nemotron</span>
        <span className="ml-auto"><StatusBadge status={result.suggested_status} /></span>
      </div>
      {(result.error || result.skipped) ? (
        <p className="flex items-start gap-1.5 text-soft"><TriangleAlert size={15} className="mt-0.5 shrink-0 text-warn" /> Review manually: {result.error || result.skipped}</p>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <ConfidenceMeter pct={pct} />
            <span className="fact text-soft">{pct}% confident{pct < 60 && ' · needs human review'}</span>
          </div>
          {result.findings?.length > 0 && (
            <ul className="space-y-1.5">
              {result.findings.map((f, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5">
                  <span className={`chip ${f.present_at_move_in ? 'border-cyan-400/40 bg-cyan-400/10 text-neon' : 'border-alert/45 bg-alert/10 text-blush'}`}><span className="chip-dot" aria-hidden />{f.present_at_move_in ? 'At move-in' : 'New'}</span>
                  <span className="rounded-md border border-line px-1.5 py-[3px] text-[11.5px] font-medium capitalize leading-4 text-soft">{String(f.severity)}</span>
                  <span>{f.description}{f.location && <span className="text-muted-foreground"> ({f.location})</span>}</span>
                </li>
              ))}
            </ul>
          )}
          {result.rationale && <blockquote className="well px-3 py-2 text-[13px] leading-relaxed text-[#e4d6ff]">“{result.rationale}” <span className="text-muted-foreground">Nemotron</span></blockquote>}
          <p className="font-medium">
            {result.suggested_fine > 0 && <>Suggested fine <b className="font-mono text-blush">{money(result.suggested_fine)}</b> <span className="font-normal text-muted-foreground">(fee schedule, minus nothing from the AI)</span></>}
            {result.waived_if_pre_existing > 0 && <><b className="font-mono text-neon">{money(result.waived_if_pre_existing)}</b> waived (pre-existing)</>}
            {!result.suggested_fine && !result.waived_if_pre_existing && <span className="text-muted-foreground">No charge suggested</span>}
          </p>
        </>
      )}
      {brief && <p className="rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-[#ffe3a1]"><b>AI recommendation:</b> {brief}</p>}
      {row && (
        <div className="relative z-[2] flex flex-wrap items-center gap-2 border-t border-dashed border-violet/30 pt-2.5">
          <span className="text-[12px] font-medium text-muted-foreground">Current</span><StatusBadge status={row.condition_status} />
          {applied ? <span className="animate-tick ml-auto flex items-center gap-1 text-[13px] font-semibold text-matrix"><Check size={14} /> Applied</span> : (
            <button disabled={manual || applying} onClick={() => onApply(result)} className="btn btn-sm btn-primary ml-auto">
              {applying ? <><Loader2 size={13} className="animate-spin" /> Applying…</> : 'Apply suggestion'}
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
  const pad = (n) => String(n).padStart(2, '0');
  // compare_photos(desk): the argument shown is the item it looked at, by its short name.
  const argOf = (s) => {
    const id = s.args?.item_id;
    const name = id && rowOf(id)?.item_name;
    return name ? name.toLowerCase().split(/[^a-z]+/).filter(Boolean).slice(-1)[0] : '';
  };
  const fmtMs = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

  const slowest = data ? Math.max(1, ...data.agent.trace.map((t) => t.ms || 0)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={state === 'running'} className="btn btn-primary btn-lg">
          {state === 'running' ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} {state === 'running' ? 'Reviewing…' : data ? 'Run again' : 'Run Nemotron Review'}
        </button>
        {state === 'idle' && <span className="text-sm text-muted-foreground">Nemotron plans the review and calls tools. Usually 10–40 s.</span>}
        {state !== 'running' && savedAt && <span className="fact">Last run {fmtUtc(savedAt)} · {data?.mode}{data?.elapsed_ms ? ` · ${(data.elapsed_ms / 1000).toFixed(1)} s` : ''}</span>}
      </div>

      {state === 'running' && (
        <div className="term relative overflow-hidden p-4" role="status">
          <span aria-hidden className="animate-scan pointer-events-none absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-transparent via-cyan-400/20 to-transparent" />
          <p className="mb-3 flex items-center gap-2 text-[12.5px] text-neon"><span className="live-dot bg-neon" aria-hidden /> Nemotron agent working… <span className="tabular-nums text-cyan-100/70">{pad(elapsed)}s</span></p>
          <ol className="space-y-1.5 font-sans text-[13px] text-soft">
            {PLAN.map((p, i) => (
              <li key={p} className="animate-line flex items-center gap-2" style={{ animationDelay: `${i * 120}ms` }}>
                <span className="flex size-5 items-center justify-center rounded-full border border-violet/40 font-mono text-[10px] text-lilac">{i + 1}</span> {p}
              </li>
            ))}
          </ol>
        </div>
      )}

      {state === 'error' && (
        <div className="animate-shake rounded-xl border border-alert/50 bg-alert/10 p-4 text-sm text-[#ffd0dd]" role="alert">
          <p className="flex items-center gap-2 font-semibold text-blush"><X size={16} aria-hidden /> AI review unavailable: manual review still works.</p>
          <p className="mt-1">{error}</p>
          <button onClick={run} className="btn btn-sm btn-danger mt-3">Retry</button>
        </div>
      )}

      {state === 'done' && data && (
        <>
          <div className={`animate-rise flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-[13px] ${data.mode === 'agent' ? 'border-cyan-400/40 bg-cyan-400/[0.07] text-cyan-50' : 'border-violet/35 bg-violet/10 text-[#e4d6ff]'}`} data-testid="ai-mode">
            {data.mode === 'agent' ? <Bot size={16} className="text-neon" /> : <Cpu size={16} className="text-lilac" />}
            <b className={data.mode === 'agent' ? 'text-neon' : ''}>{data.mode === 'agent' ? 'Nemotron agent' : 'Pipeline mode'}</b>
            {data.mode === 'agent' && <span>· {data.agent.rounds} rounds · {data.agent.tool_calls} tool calls{data.elapsed_ms ? ` · ${(data.elapsed_ms / 1000).toFixed(1)} s` : ''}</span>}
            {data.vision_mode === 'single-image' && <span title="This model accepts one image per request, so each comparison runs as two vision calls.">· 2-step vision</span>}
            {data.mode !== 'agent' && data.agent.fallback_reason && <span title={data.agent.fallback_reason}>· fallback: {String(data.agent.fallback_reason).slice(0, 80)}</span>}
            <span className="fact ml-auto">{[data.models?.vision, data.models?.text].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' + ')}</span>
          </div>

          {data.memo ? (
            <section className="panel animate-rise p-4">
              <h3 className="mb-2 font-semibold">Summary for housing</h3>
              <ul className="space-y-1.5 text-sm">{data.memo.admin_summary.map((b, i) => <li key={i} className="flex gap-2.5"><span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-lilac shadow-[0_0_6px_rgb(201_166_255/0.8)]" /><span>{b}</span></li>)}</ul>
              {data.memo.student_note && (
                <div className="well mt-3 p-3 text-sm">
                  <p className="mb-1 flex items-center justify-between font-semibold">Note to the student <CopyButton text={data.memo.student_note} /></p>
                  <p className="text-soft">{data.memo.student_note}</p>
                </div>
              )}
            </section>
          ) : (
            <p className="rounded-lg border border-line p-3 text-sm text-muted-foreground">Summary unavailable{data.memo_error ? ` (${data.memo_error})` : ''}. The item cards below still work.</p>
          )}

          {data.agent.trace.length > 0 && (
            <section className="term overflow-hidden" data-testid="ai-timeline">
              <h3 className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-400/[0.04] px-4 py-2 font-sans text-[13px] font-semibold text-cyan-50">
                Agent timeline <span className="fact font-normal">{data.agent.tool_calls} calls · bars show how long each took</span>
              </h3>
              <ol className="space-y-3.5 overflow-x-auto p-4">
                {rounds.map((round) => {
                  const steps = data.agent.trace.filter((s) => s.round === round);
                  return (
                    <li key={round}>
                      <p className="font-sans text-[12.5px] font-semibold text-lilac">{round === 0 ? 'Checked by code (coverage)' : `Round ${round}${steps.length > 1 ? ` · ${steps.length} tools in parallel` : ''}`}</p>
                      <ul className="mt-1">
                        {steps.map((s, i) => {
                          const Icon = (TOOL_META[s.tool] || TOOL_META.list_items).icon;
                          const arg = argOf(s);
                          return (
                            <li key={i} className={`animate-line grid grid-cols-[auto_minmax(0,1fr)_90px_52px_auto] items-center gap-2.5 whitespace-nowrap rounded-md px-1.5 py-1 transition-colors hover:bg-cyan-400/[0.06] ${s.ok ? 'text-[#d6d1ea]' : 'text-blush'}`} style={{ animationDelay: `${(round * 4 + i) * 60}ms` }}>
                              <Icon size={13} className="text-cyan-300/70" aria-hidden />
                              <span className="min-w-0 truncate" title={s.summary}><code className="font-semibold text-neon">{s.tool}</code><span className="text-cyan-100/70">({arg})</span> <span className="text-muted-foreground">{s.summary}</span></span>
                              <span aria-hidden className="h-1 overflow-hidden rounded-full bg-white/[0.07]"><span className={`block h-full origin-left rounded-full ${s.ok ? 'bg-neon/80' : 'bg-alert'}`} style={{ width: `${Math.max(4, ((s.ms || 0) / slowest) * 100)}%`, animation: 'fill-x 0.7s var(--ease-expo) both', animationDelay: `${(round * 4 + i) * 60}ms` }} /></span>
                              <span className="text-right tabular-nums text-muted-foreground">{fmtMs(s.ms)}</span>
                              {s.ok ? <Check size={13} className="text-matrix" aria-label="ok" /> : <X size={13} className="text-alert" aria-label="failed" />}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
                <li className="font-sans text-[12.5px] font-medium text-matrix">Review complete · {data.agent.tool_calls} calls</li>
              </ol>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="flex items-baseline justify-between gap-3 font-semibold">Suggestions by item <span className="fact font-normal">nothing changes until you approve it</span></h3>
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
