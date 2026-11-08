import { useEffect, useState } from 'react';
import { getMediaUrl } from '../lib/dbService.js';

// Drag the laser to wipe between move-in (left) and move-out (right). Images only.
export default function CompareSlider({ beforePath, afterPath }) {
  const [urls, setUrls] = useState({});
  const [pos, setPos] = useState(50);
  useEffect(() => {
    let live = true;
    Promise.all([getMediaUrl(beforePath), getMediaUrl(afterPath)]).then(([b, a]) => live && setUrls({ b, a }));
    return () => { live = false; };
  }, [beforePath, afterPath]);
  if (!urls.b || !urls.a) return <div className="aspect-[4/3] animate-pulse rounded-[3px] bg-purple-500/10" />;
  return (
    <div>
      <div className="hud-frame scanlines relative aspect-[4/3] w-full select-none overflow-hidden rounded-[3px] border border-cyan-400/30 bg-black">
        <img src={urls.a} alt="Move-out" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <img src={urls.b} alt="Move-in" className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
        {/* the laser line + diamond thumb */}
        <div className="laser pointer-events-none absolute inset-y-0 z-[5] w-0.5 -translate-x-1/2" style={{ left: `${pos}%` }}>
          <span className="absolute left-1/2 top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center rounded-[2px] border-2 border-cyan-300 bg-void shadow-[0_0_14px_#00F0FF]">
            <span className="size-2 bg-neon" />
          </span>
        </div>
        <span className="absolute left-3 top-3 z-[5] rounded-[2px] border border-cyan-400/30 bg-black/70 px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] text-cyan-100">T0 // MOVE-IN</span>
        <span className="absolute right-3 top-3 z-[5] rounded-[2px] border border-cyan-400/30 bg-black/70 px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] text-cyan-100">T1 // MOVE-OUT</span>
        <span className="absolute bottom-3 left-1/2 z-[5] -translate-x-1/2 rounded-[2px] bg-black/70 px-2 py-0.5 font-mono text-[10px] tabular-nums text-neon">WIPE {String(pos).padStart(3, '0')}%</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Comparison slider" className="mt-3 w-full" />
    </div>
  );
}
