import { CheckCircle2, Loader2, Sparkles, TriangleAlert } from 'lucide-react';

// Nemotron "Capture Coach" result under the photo preview. Advisory only: it never blocks the student.
export default function PhotoCoach({ state }) {
  if (!state) return null;
  if (state.status === 'checking') {
    return <p className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-white/75"><Loader2 size={16} className="animate-spin" /> Nemotron is checking your photo…</p>;
  }
  if (state.status === 'error') {
    return <p className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-muted-foreground"><Sparkles size={16} /> Photo coach unavailable. Your photo is saved.</p>;
  }
  if (state.status === 'skipped') return null;
  const r = state.result;
  if (r?.ok) {
    return <p className="flex items-center gap-2 rounded-xl bg-primary/15 px-3 py-2 text-sm text-primary"><CheckCircle2 size={16} /> Looks good. Nemotron says the framing, light, and focus are fine.</p>;
  }
  return (
    <div className="flex items-start gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-sm text-amber-200" role="status">
      <TriangleAlert size={16} className="mt-0.5 shrink-0" />
      <div>
        <b>Nemotron suggests a retake:</b> {r?.retake_tip || 'Try again with the whole item in frame, in good light.'}
        <span className="mt-1 block text-xs text-amber-200">This is advice only. You can keep your photo.</span>
      </div>
    </div>
  );
}
