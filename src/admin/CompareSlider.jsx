import { useEffect, useState } from 'react';
import { getMediaUrl } from '../lib/dbService.js';

// Drag the handle to wipe between move-in (left) and move-out (right). Images only.
export default function CompareSlider({ beforePath, afterPath }) {
  const [urls, setUrls] = useState({});
  const [pos, setPos] = useState(50);
  useEffect(() => {
    let live = true;
    Promise.all([getMediaUrl(beforePath), getMediaUrl(afterPath)]).then(([b, a]) => live && setUrls({ b, a }));
    return () => { live = false; };
  }, [beforePath, afterPath]);
  if (!urls.b || !urls.a) return <div className="aspect-[4/3] animate-pulse rounded-xl bg-white/10" />;
  return (
    <div>
      <div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-xl bg-black">
        <img src={urls.a} alt="Move-out" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <img src={urls.b} alt="Move-in" className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }}>
          <span className="absolute top-1/2 -ml-4 -mt-4 flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold shadow">↔</span>
        </div>
        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Move-in</span>
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Move-out</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Comparison slider" className="mt-2 w-full" />
    </div>
  );
}
