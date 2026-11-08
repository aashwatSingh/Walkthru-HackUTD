import { QRCodeSVG } from 'qrcode.react';

// The printable door sheet. `print-area` is the only thing the browser prints (see index.css).
export default function DoorFlyer({ unit, url }) {
  return (
    <div className="print-area mx-auto w-full max-w-xl rounded-[3px] border-2 border-black bg-white p-8 text-center text-black shadow-[0_0_0_1px_rgb(0_240_255/0.25),0_0_40px_rgb(0_240_255/0.08)] print:bg-white print:text-black print:shadow-none">
      <p className="text-sm font-semibold uppercase tracking-widest text-black/60">University Housing</p>
      <h2 className="mt-1 font-heading text-3xl font-bold">Door Check-In</h2>
      <p className="mt-3 text-xl font-semibold">{unit.building_name} · Room {unit.room_number}</p>
      <p className="text-black/60">{unit.semester} · <span className="font-mono">{unit.unit_code}</span></p>
      <div className="print-qr mx-auto my-6 w-fit rounded-[3px] border-4 border-black bg-white p-3">
        <QRCodeSVG value={url} size={288} level="M" marginSize={1} title={`Inspection QR code for ${unit.unit_code}`} />
      </div>
      <ol className="mx-auto max-w-sm space-y-2 text-left text-lg">
        <li><b>1. Scan</b> this code with your phone camera.</li>
        <li><b>2. Photograph</b> each item as the app guides you.</li>
        <li><b>3. Lock &amp; submit</b> before you unpack.</li>
      </ol>
      <p className="mt-6 break-all font-mono text-xs text-black/60">{url}</p>
      <p className="mt-2 text-xs text-black/60">Your photos are timestamped and cannot be changed after you submit. They protect you from unfair charges.</p>
    </div>
  );
}
