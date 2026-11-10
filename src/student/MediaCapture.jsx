import { useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import CameraCapture from './CameraCapture.jsx';
import { isMockMode } from '../lib/dbService.js';

// Wraps the live camera (no file picker: students cannot upload from the camera roll).
// In MOCK mode only, a "sample photo" button lets you demo on a laptop without a camera.
const sampleFor = (item, phase) =>
  ({ 1: 'door', 2: 'desk', 3: phase === 'after' ? 'blinds-broken' : 'blinds', 4: 'sink' })[item.step_order] || 'door';

export default function MediaCapture({ item, unit, phase, onCapture }) {
  const [loading, setLoading] = useState(false);
  const stamp = `${unit.building_name} ${unit.room_number} • ${item.item_name} • ${phase === 'before' ? 'MOVE-IN' : 'MOVE-OUT'}`;

  const useSample = async () => {
    setLoading(true);
    try {
      const sample = sampleFor(item, phase);
      const blob = await (await fetch(`/seed/${sample}.jpg`)).blob();
      onCapture({ blob, kind: 'photo', mimeType: 'image/jpeg', capturedAt: new Date().toISOString(), sample });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <CameraCapture stampText={stamp} unitCode={unit.unit_code} phaseLabel={phase === 'before' ? 'MOVE-IN' : 'MOVE-OUT'} onCapture={onCapture} />
      {isMockMode && (
        <button type="button" onClick={useSample} disabled={loading} data-lit="amber"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-warn/60 bg-warn/[0.07] py-3 text-sm font-semibold text-[#ffd36b] transition-[background-color,border-color] duration-150 hover:border-warn hover:bg-warn/15 active:scale-[0.99] disabled:opacity-60">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />} Demo mode: use a sample photo (no camera needed)
        </button>
      )}
    </div>
  );
}
