import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check, ClipboardCopy, Cpu, Database, FileSearch, Loader2, Play, Receipt, Send, Sparkles, TriangleAlert } from 'lucide-react';
import { StatusBadge, useToast } from '../components/ui.jsx';
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
const PLAN = ['list items', 'compare photos', 'fee schedule', 'dispute evidence', 'submit review'];

// Segmented neon confidence meter: 10 cells, cyan fading to violet. Below 60% the cells turn grey (needs a human).
function ConfidenceMeter({ pct }) {
  const lit = Math.round(pct / 10);
  return (
    <span className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="h-2.5 w-2 rounded-[1px]"
          style={i < lit
            ? { background: pct < 60 ? '#6b6585' : `color-mix(in oklab, #00F0FF ${100 - i * 9}%, #9D4EDD)`, boxShadow: pct < 60 ? 'none' : '0 0 6px rgb(0 240 255 / 0.45)' }
            : { background: 'rgb(168 85 247 / 0.15)' }} />
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
    <div className="space-y-2.5 rounded-[3px] border border-purple-500/35 bg-purple-500/[0.07] p-3 text-sm" data-testid="ai-item-card">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={15} className="text-violet-400" />
        <b>{result.item_name || 'Nemotron suggestion'}</b>
        <span className="font-mono text-[10px] text-[#c79bff]/80">NEMOTRON // SUGGESTION</span>
        <span className="ml-auto"><StatusBadge status={result.suggested_status} /></span>
      </div>
      {(result.error || result.skipped) ? (
        <p className="flex items-start gap-1.5 text-[#cfc9e6]"><TriangleAlert size={15} className="mt-0.5 shrink-0 text-[#FFB800]" /> Review manually: {result.error || result.skipped}</p>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <ConfidenceMeter pct={pct} />
            <span className="font-mono text-[11px] text-[#cfc9e6]">CONF {pct}%{pct < 60 && ' · needs human review'}</span>
          </div>
          {result.findings?.length > 0 && (
            <ul className="space-y-1">
              {result.findings.map((f, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5">
                  <span className="hud-pill border-purple-500/30 text-[#cfc9e6]">{String(f.severity).toUpperCase()}</span>
                  <span className={`hud-pill ${f.present_at_move_in ? 'border-cyan-400/40 bg-cyan-400/10 text-neon' : 'border-rose-500/45 bg-rose-500/10 text-[#FF5C8D]'}`}>{f.present_at_move_in ? 'AT_MOVE_IN' : 'NEW'}</span>
                  <span>{f.description}{f.location && <span className="text-muted-foreground"> ({f.location})</span>}</span>
                </li>
              ))}
            </ul>
          )}
          {result.rationale && <blockquote className="rounded-[3px] border border-purple-500/20 bg-void/60 px-2.5 py-2 font-mono text-[12px] leading-relaxed text-[#d9c6ff]"><span className="text-violet-400">&gt; </span>“{result.rationale}” <span className="text-muted-foreground">: Nemotron</span></blockquote>}
          <p className="font-medium">
            {result.suggested_fine > 0 && <>Suggested fine <b className="font-mono text-[#FF5C8D]">{money(result.suggested_fine)}</b> <span className="font-normal text-muted-foreground">(fee schedule, minus nothing from the AI)</span></>}
            {result.waived_if_pre_existing > 0 && <><b className="font-mono text-neon">{money(result.waived_if_pre_existing)}</b> waived (pre-existing)</>}
            {!result.suggested_fine && !result.waived_if_pre_existing && <span className="text-muted-foreground">No charge suggested</span>}
          </p>
        </>
      )}
      {brief && <p className="rounded-[3px] border border-amber-400/40 bg-amber-400/10 p-2 text-[#ffe3a1]"><b>AI recommendation:</b> {brief}</p>}
      {row && (
        <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-purple-500/25 pt-2.5">
          <span className="hud-label">Current:</span><StatusBadge status={row.condition_status} />
          {applied ? <span className="ml-auto flex items-center gap-1 font-mono text-xs text-[#00FF9D]"><Check size={14} /> Applied</span> : (
            <button disabled={manual || applying} onClick={() => onApply(result)} className="btn btn-sm btn-primary ml-auto">
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
  const pad = (n) => String(n).padStart(2, '0');
  // compare_photos(desk): the argument shown is the item it looked at, by its short name.
  const argOf = (s) => {
    const id = s.args?.item_id;
    const name = id && rowOf(id)?.item_name;
    return name ? name.toLowerCase().split(/[^a-z]+/).filter(Boolean).slice(-1)[0] : '';
  };
  const fmtMs = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={state === 'running'} className="btn btn-primary btn-lg">
          {state === 'running' ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} {state === 'running' ? 'Reviewing…' : data ? 'Run again' : 'Run Nemotron Review'}
        </button>
        {state === 'idle' && <span className="text-sm text-muted-foreground">Nemotron plans the review and calls tools. Usually 10–40 s.</span>}
        {state !== 'running' && savedAt && <span className="font-mono text-[11px] text-muted-foreground">LAST_RUN // {fmtUtc(savedAt)} · {data?.mode}{data?.elapsed_ms ? ` · ${(data.elapsed_ms / 1000).toFixed(1)} s` : ''}</span>}
      </div>

      {state === 'running' && (
        <div className="term p-4" role="status">
          <p className="mb-3 flex items-center gap-2 text-[12px] text-neon"><span className="live-dot bg-neon" aria-hidden /> Nemotron agent working… <span className="tabular-nums text-cyan-100/70">T+{pad(elapsed)}s</span></p>
          <ol className="space-y-1 text-[#a29bbd]">
            {PLAN.map((p, i) => (
              <li key={p} className="animate-line" style={{ animationDelay: `${i * 120}ms` }}>
                <span className="text-violet-400">{i === PLAN.length - 1 ? '└─' : '├─'}</span> {pad(i + 1)} {p.replaceAll(' ', '_')} <span className="text-muted-foreground/70">… queued</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-cyan-100/60">&gt; <span className="inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-neon" aria-hidden /></p>
        </div>
      )}

      {state === 'error' && (
        <div className="term border-rose-500/50 p-4 text-[#ffc2d4]" role="alert">
          <p className="font-semibold text-[#FF2A6D]">[FAULT] AI review unavailable: manual review still works.</p>
          <p className="mt-1">{error}</p>
          <button onClick={run} className="btn btn-sm btn-danger mt-3 font-sans">Retry</button>
        </div>
      )}

      {state === 'done' && data && (
        <>
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[3px] border px-4 py-3 font-mono text-xs ${data.mode === 'agent' ? 'border-cyan-400/40 bg-cyan-400/[0.07] text-cyan-100' : 'border-purple-500/30 bg-purple-500/10 text-[#d9c6ff]'}`} data-testid="ai-mode">
            {data.mode === 'agent' ? <Bot size={16} className="text-neon" /> : <Cpu size={16} className="text-violet-400" />}
            <b className={data.mode === 'agent' ? 'text-neon' : ''}>{data.mode === 'agent' ? 'Nemotron agent' : 'Pipeline mode'}</b>
            {data.mode === 'agent' && <span>· {data.agent.rounds} rounds · {data.agent.tool_calls} tool calls{data.elapsed_ms ? ` · ${(data.elapsed_ms / 1000).toFixed(1)} s` : ''}</span>}
            {data.vision_mode === 'single-image' && <span title="This model accepts one image per request, so each comparison runs as two vision calls.">· 2-step vision</span>}
            {data.mode !== 'agent' && data.agent.fallback_reason && <span title={data.agent.fallback_reason}>· fallback: {String(data.agent.fallback_reason).slice(0, 80)}</span>}
            <span className="ml-auto text-[10.5px] opacity-70">{[data.models?.vision, data.models?.text].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' + ')}</span>
          </div>

          {data.memo ? (
            <section className="hud-panel p-4">
              <h3 className="mb-2 flex items-center justify-between font-semibold">Summary for housing <span className="font-mono text-[10.5px] font-normal text-muted-foreground">MEMO // submit_review</span></h3>
              <ul className="space-y-1.5 text-sm">{data.memo.admin_summary.map((b, i) => <li key={i} className="flex gap-2"><span className="font-mono text-violet-400">▸</span><span>{b}</span></li>)}</ul>
              {data.memo.student_note && (
                <div className="mt-3 rounded-[3px] border border-purple-500/20 bg-void/50 p-3 text-sm">
                  <p className="mb-1 flex items-center justify-between font-medium">Note to the student
                    <button onClick={() => { navigator.clipboard?.writeText(data.memo.student_note); toast('Copied.', 'success'); }} className="flex items-center gap-1 font-mono text-[11px] font-normal text-neon hover:underline"><ClipboardCopy size={13} /> Copy</button>
                  </p>
                  <p className="text-[#cfc9e6]">{data.memo.student_note}</p>
                </div>
              )}
            </section>
          ) : (
            <p className="rounded-[3px] border border-purple-500/25 p-3 text-sm text-muted-foreground">Summary unavailable{data.memo_error ? ` (${data.memo_error})` : ''}. The item cards below still work.</p>
          )}

          {data.agent.trace.length > 0 && (
            <section className="term overflow-hidden" data-testid="ai-timeline">
              <h3 className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-400/[0.04] px-4 py-2 text-[11px] font-semibold tracking-[0.06em] text-cyan-100">
                <span className="flex items-center gap-2"><span className="flex gap-1" aria-hidden><span className="size-2 rounded-full bg-[#FF2A6D]/70" /><span className="size-2 rounded-full bg-[#FFB800]/70" /><span className="size-2 rounded-full bg-[#00FF9D]/70" /></span> Agent timeline</span>
                <span className="font-normal text-muted-foreground">nemotron.trace</span>
              </h3>
              <ol className="space-y-3 overflow-x-auto p-4">
                {rounds.map((round) => {
                  const steps = data.agent.trace.filter((s) => s.round === round);
                  const kind = round === 0 ? 'CODE_CHECK' : steps.length > 1 ? 'PARALLEL_EXEC' : 'SEQ_EXEC';
                  return (
                    <li key={round}>
                      <p className="flex flex-wrap items-baseline gap-x-3 text-[11px]">
                        <span className="font-semibold text-violet-400">[ROUND {pad(round)} // {kind}]</span>
                        <span className="text-muted-foreground"># {round === 0 ? 'Checked by code (coverage)' : `Round ${round}${steps.length > 1 ? ` · ${steps.length} tools in parallel` : ''}`}</span>
                      </p>
                      <ul className="mt-1">
                        {steps.map((s, i) => {
                          const Icon = (TOOL_META[s.tool] || TOOL_META.list_items).icon;
                          const arg = argOf(s);
                          return (
                            <li key={i} className={`animate-line flex items-center gap-2 whitespace-nowrap py-0.5 ${s.ok ? 'text-[#d6d1ea]' : 'text-[#ff8fb0]'}`} style={{ animationDelay: `${(round * 4 + i) * 60}ms` }}>
                              <span className="text-violet-400/80" aria-hidden>{i === steps.length - 1 ? '└─►' : '├─►'}</span>
                              <Icon size={13} className="shrink-0 text-cyan-300/70" aria-hidden />
                              <span><code className="font-semibold text-neon">{s.tool}</code><span className="text-cyan-100/70">({arg})</span></span>
                              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={s.summary}>{s.summary}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">{fmtMs(s.ms)}</span>
                              <span className={`shrink-0 font-semibold ${s.ok ? 'text-[#00FF9D]' : 'text-[#FF2A6D]'}`} aria-label={s.ok ? 'ok' : 'failed'}>{s.ok ? '[OK]' : '[ERR]'}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
                <li className="text-[11px] text-[#00FF9D]">&gt; review complete · {data.agent.tool_calls} calls · exit 0</li>
              </ol>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="flex items-center justify-between font-semibold">Suggestions by item <span className="font-mono text-[10.5px] font-normal text-muted-foreground">HUMAN_APPROVAL // REQUIRED</span></h3>
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
