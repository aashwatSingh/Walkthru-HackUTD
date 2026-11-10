import { Check } from 'lucide-react';
import { PHASES, PHASE_META } from '../lib/format.js';

const NOW = {
  MOVE_IN_OPEN: ['bg-neon shadow-[0_0_10px_#00f0ff]', 'text-neon'],
  MOVE_IN_LOCKED: ['bg-lilac shadow-[0_0_10px_rgb(201_166_255/0.8)]', 'text-lilac'],
  MOVE_OUT_OPEN: ['bg-warn shadow-[0_0_10px_rgb(255_184_0/0.8)]', 'text-warn'],
  COMPLETED: ['bg-matrix shadow-[0_0_10px_rgb(0_255_157/0.7)]', 'text-matrix'],
};

// The four stops of an inspection, lit up to where this room is: move-in → locked → move-out → complete.
export default function PhaseTrack({ phase, compact = false, className = '' }) {
  const at = Math.max(0, PHASES.indexOf(phase));
  const [bar, ink] = NOW[phase] || NOW.MOVE_IN_OPEN;
  return (
    <ol className={`grid grid-cols-4 gap-1.5 ${className}`} aria-label={`Inspection progress: ${PHASE_META[phase]?.label || phase}`} title={PHASE_META[phase]?.label}>
      {PHASES.map((p, i) => {
        const done = i < at || phase === 'COMPLETED';
        const now = i === at && !done;
        return (
          <li key={p} aria-current={i === at ? 'step' : undefined} className="min-w-0">
            <span className={`block h-1 rounded-full transition-[background-color,box-shadow] duration-500 ${done ? 'bg-matrix/80' : now ? bar : 'bg-white/10'}`} />
            {!compact && (
              <span className={`mt-1.5 flex items-center gap-1 truncate text-[11.5px] font-medium ${done ? 'text-matrix/90' : now ? ink : 'text-muted-foreground/70'}`}>
                {done && <Check size={11} aria-hidden />}
                {now && PHASE_META[p].live && <span className="live-dot bg-current" aria-hidden />}
                {PHASE_META[p].step}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
