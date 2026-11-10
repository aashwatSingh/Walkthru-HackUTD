import { useEffect, useState } from 'react';
import Wipe from '../components/Wipe.jsx';
import { getMediaUrl } from '../lib/dbService.js';

// Drag the divider to wipe between move-in (left) and move-out (right). Images only.
export default function CompareSlider({ beforePath, afterPath, aspect }) {
  const [urls, setUrls] = useState({});
  const [pos, setPos] = useState(50);
  useEffect(() => {
    let live = true;
    Promise.all([getMediaUrl(beforePath), getMediaUrl(afterPath)]).then(([b, a]) => live && setUrls({ b, a }));
    return () => { live = false; };
  }, [beforePath, afterPath]);
  if (!urls.b || !urls.a) return <div className={`animate-pulse rounded-lg bg-violet/10 ${aspect || 'aspect-[4/3]'}`} />;
  return (
    <div>
      <Wipe beforeUrl={urls.b} afterUrl={urls.a} aspect={aspect} onMove={setPos} />
      <p className="fact mt-2 flex justify-between tabular-nums"><span>← move-in</span><span className="text-neon">{String(pos).padStart(3, '0')}%</span><span>move-out →</span></p>
    </div>
  );
}
