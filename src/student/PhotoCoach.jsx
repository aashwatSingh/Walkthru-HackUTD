import { CheckCircle2, Loader2, Sparkles, TriangleAlert } from 'lucide-react';

// Nemotron "Capture Coach" result under the photo preview. Advisory only: it never blocks the student.
export default function PhotoCoach({ state }) {
  if (!state) return null;
  if (state.status === 'checking') {
    return <p className="flex items-center gap-2 rounded-[3px] border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm text-[#d9c6ff]"><Loader2 size={16} className="animate-spin text-violet-400" /> Nemotron is checking your photo…</p>;
  }
  if (state.status === 'error') {
    return <p className="flex items-center gap-2 rounded-[3px] border border-purple-500/20 px-3 py-2 text-sm text-muted-foreground"><Sparkles size={16} /> Photo coach unavailable. Your photo is saved.</p>;
  }
  if (state.status === 'skipped') return null;
  const r = state.result;
  if (r?.ok) {
    return <p className="flex items-center gap-2 rounded-[3px] border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-[#a8ffd9]"><CheckCircle2 size={16} className="shrink-0 text-[#00FF9D]" /> Looks good. Nemotron says the framing, light, and focus are fine.</p>;
  }
  return (
    <div className="flex items-start gap-2 rounded-[3px] border border-amber-400/45 bg-amber-400/10 px-3 py-2 text-sm text-[#ffe3a1]" role="status">
      <TriangleAlert size={16} className="mt-0.5 shrink-0 text-[#FFB800]" />
      <div>
        <b>Nemotron suggests a retake:</b> {r?.retake_tip || 'Try again with the whole item in frame, in good light.'}
        <span className="mt-1 block font-mono text-[11px] text-[#ffd36b]/80">This is advice only. You can keep your photo.</span>
      </div>
    </div>
  );
}
