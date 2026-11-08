import { ImagePlus } from 'lucide-react';
import CameraCapture from './CameraCapture.jsx';
import { isMockMode } from '../lib/dbService.js';

// Wraps the live camera (no file picker: students cannot upload from the camera roll).
// In MOCK mode only, a "sample photo" button lets you demo on a laptop without a camera.
const sampleFor = (item, phase) =>
  ({ 1: 'door', 2: 'desk', 3: phase === 'after' ? 'blinds-broken' : 'blinds', 4: 'sink' })[item.step_order] || 'door';

export default function MediaCapture({ item, unit, phase, onCapture }) {
  const stamp = `${unit.building_name} ${unit.room_number} • ${item.item_name} • ${phase === 'before' ? 'MOVE-IN' : 'MOVE-OUT'}`;

  const useSample = async () => {
    const sample = sampleFor(item, phase);
    const blob = await (await fetch(`/seed/${sample}.jpg`)).blob();
    onCapture({ blob, kind: 'photo', mimeType: 'image/jpeg', capturedAt: new Date().toISOString(), sample });
  };

  return (
    <div className="space-y-3">
      <CameraCapture stampText={stamp} onCapture={onCapture} />
      {isMockMode && (
        <button type="button" onClick={useSample} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-amber-400 bg-amber-50 py-2.5 text-sm font-medium text-amber-900">
          <ImagePlus size={16} /> Demo mode: use a sample photo (no camera needed)
        </button>
      )}
    </div>
  );
}
