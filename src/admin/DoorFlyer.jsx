import { QRCodeSVG } from 'qrcode.react';

// The printable door sheet. `print-area` is the only thing the browser prints (see index.css).
export default function DoorFlyer({ unit, url }) {
  return (
    <div className="print-area mx-auto w-full max-w-xl rounded-2xl border-2 border-slate-900 bg-white p-8 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">University Housing</p>
      <h2 className="mt-1 text-3xl font-extrabold">Door Check-In</h2>
      <p className="mt-3 text-xl font-semibold">{unit.building_name} · Room {unit.room_number}</p>
      <p className="text-slate-500">{unit.semester}</p>
      <div className="mx-auto my-6 w-fit rounded-xl bg-white p-3 ring-4 ring-slate-900">
        <QRCodeSVG value={url} size={288} level="M" marginSize={1} title={`Inspection QR code for ${unit.unit_code}`} />
      </div>
      <ol className="mx-auto max-w-sm space-y-2 text-left text-lg">
        <li><b>1. Scan</b> this code with your phone camera.</li>
        <li><b>2. Photograph</b> each item as the app guides you.</li>
        <li><b>3. Lock &amp; submit</b> before you unpack.</li>
      </ol>
      <p className="mt-6 break-all text-xs text-slate-400">{url}</p>
      <p className="mt-2 text-xs text-slate-500">Your photos are timestamped and cannot be changed after you submit. They protect you from unfair charges.</p>
    </div>
  );
}
