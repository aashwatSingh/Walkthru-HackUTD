import { CheckCircle2, Loader2, Sparkles, TriangleAlert } from 'lucide-react';

// Nemotron "Capture Coach" result under the photo preview. Advisory only: it never blocks the student.
export default function PhotoCoach({ state }) {
  if (!state) return null;
  const base = 'animate-rise flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm';
  if (state.status === 'checking') {
    return <p className={`${base} border-violet/35 bg-violet/10 text-[#e4d6ff]`} role="status"><Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-lilac" /> Nemotron is checking your photo…</p>;
  }
  if (state.status === 'error') {
    return <p className={`${base} border-line text-muted-foreground`}><Sparkles size={16} className="mt-0.5 shrink-0" /> Photo coach unavailable. Your photo is saved.</p>;
  }
  if (state.status === 'skipped') return null;
  const r = state.result;
  if (r?.ok) {
    return <p className={`${base} border-matrix/40 bg-matrix/10 text-[#b9ffe2]`} role="status"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-matrix" /> Looks good. Nemotron says the framing, light, and focus are fine.</p>;
  }
  return (
    <div className={`${base} border-warn/45 bg-warn/10 text-[#ffe3a1]`} role="status">
      <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" />
      <div>
        <b>Nemotron suggests a retake:</b> {r?.retake_tip || 'Try again with the whole item in frame, in good light.'}
        <span className="mt-1 block text-[12px] text-[#ffd36b]/85">This is advice only. You can keep your photo.</span>
      </div>
    </div>
  );
}
