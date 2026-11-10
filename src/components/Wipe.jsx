import { useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';

// Before/after wipe: drag anywhere on the photo (or use the arrow keys) to move the divider.
// The whole surface is a real range input, invisible, laid over the images: dragging, touch, keyboard and
// screen readers all work the way a slider always does. Move-in is on the left, move-out on the right.
export default function Wipe({
  beforeUrl, afterUrl, beforeAlt = 'Move-in', afterAlt = 'Move-out',
  beforeLabel = 'Move-in', afterLabel = 'Move-out',
  label = 'Comparison slider', initial = 50, aspect = 'aspect-[4/3]', className = '', onMove,
}) {
  const [pos, setPos] = useState(initial);
  const change = (e) => {
    const v = Number(e.target.value);
    setPos(v);
    onMove?.(v);
  };
  return (
    <div className={`viewfinder scanlines group/wipe relative w-full select-none overflow-hidden rounded-lg border border-cyan-400/30 bg-black ${aspect} ${className}`}>
      <img src={afterUrl} alt={afterAlt} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <img src={beforeUrl} alt={beforeAlt} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
      <span className={`pointer-events-none absolute left-3 top-3 z-[5] rounded-md border border-cyan-400/30 bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-cyan-50 transition-opacity ${pos < 12 ? 'opacity-0' : ''}`}>{beforeLabel}</span>
      <span className={`pointer-events-none absolute right-3 top-3 z-[5] rounded-md border border-alert/40 bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-[#ffd0dd] transition-opacity ${pos > 88 ? 'opacity-0' : ''}`}>{afterLabel}</span>
      {/* the divider and its handle */}
      <div className="laser pointer-events-none absolute inset-y-0 z-[5] w-0.5 -translate-x-1/2" style={{ left: `${pos}%` }}>
        <span className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-cyan-200 bg-void text-neon shadow-[0_0_18px_#00f0ff] transition-transform duration-150 group-hover/wipe:scale-110 group-has-[input:focus-visible]/wipe:scale-110 group-has-[input:focus-visible]/wipe:outline group-has-[input:focus-visible]/wipe:outline-2 group-has-[input:focus-visible]/wipe:outline-offset-2 group-has-[input:focus-visible]/wipe:outline-white">
          <ChevronsLeftRight size={16} aria-hidden />
        </span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={change} aria-label={label}
        className="absolute inset-0 z-[6] m-0 h-full w-full cursor-ew-resize opacity-0" />
    </div>
  );
}
