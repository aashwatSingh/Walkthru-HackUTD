import { CheckCircle2, Loader2, Sparkles, TriangleAlert } from 'lucide-react';

// Nemotron "Capture Coach" result under the photo preview. Advisory only: it never blocks the student.
export default function PhotoCoach({ state }) {
  if (!state) return null;
  if (state.status === 'checking') {
    return <p className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" /> Nemotron is checking your photo…</p>;
  }
  if (state.status === 'error') {
    return <p className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-500"><Sparkles size={16} /> Photo coach unavailable. Your photo is saved.</p>;
  }
  if (state.status === 'skipped') return null;
  const r = state.result;
  if (r?.ok) {
    return <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><CheckCircle2 size={16} /> Looks good. Nemotron says the framing, light, and focus are fine.</p>;
  }
  return (
    <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
      <TriangleAlert size={16} className="mt-0.5 shrink-0" />
      <div>
        <b>Nemotron suggests a retake:</b> {r?.retake_tip || 'Try again with the whole item in frame, in good light.'}
        <span className="mt-1 block text-xs text-amber-700">This is advice only. You can keep your photo.</span>
      </div>
    </div>
  );
}
