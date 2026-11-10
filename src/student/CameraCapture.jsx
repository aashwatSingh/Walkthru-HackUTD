// src/student/CameraCapture.jsx  (used inside MediaCapture)
// Live-camera-only capture for Walkthrough.
// There is NO <input type="file"> anywhere, so students cannot pick from the camera roll.
// Photos are grabbed from the live video stream; videos are recorded with MediaRecorder.
//
// Requires HTTPS (or http://localhost). Vercel/Netlify deploys are HTTPS automatically.
//
// Usage:
//   <CameraCapture
//     stampText="Founders Hall 304-B • Window Blinds • MOVE-IN"
//     onCapture={({ blob, kind, mimeType, capturedAt }) => uploadMedia(blob, ...)}
//   />

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, RotateCcw, SwitchCamera, Video } from "lucide-react";
import { HudClock } from "../components/ui.jsx";

const pickVideoMime = () => {
  const types = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
};

export default function CameraCapture({
  onCapture,
  stampText = "",          // burned into photos (room / item / phase)
  unitCode = "",           // shown in the viewfinder HUD
  phaseLabel = "",
  allowVideo = true,
  maxVideoSeconds = 15,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const tickRef = useRef(null);
  const stopTimeoutRef = useRef(null);

  const [mode, setMode] = useState("photo");          // "photo" | "video"
  const [facing, setFacing] = useState("environment"); // back camera by default
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);        // { blob, url, kind, mimeType, capturedAt }

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Start the camera whenever we're not reviewing a capture
  useEffect(() => {
    if (preview) return;
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Your browser can't open the camera. Use Safari or Chrome on your phone.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setError("");
      } catch (e) {
        setError(
          e.name === "NotAllowedError"
            ? "Camera permission denied. Allow camera access in your browser settings and reload."
            : "Couldn't start the camera: " + e.message
        );
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facing, preview]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      clearInterval(tickRef.current);
      clearTimeout(stopTimeoutRef.current);
      stopStream();
    },
    []
  );

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const capturedAt = new Date().toISOString();

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    // Burn a visible evidence stamp into the image
    if (stampText) {
      const fontSize = Math.max(16, Math.round(canvas.width * 0.025));
      const pad = Math.round(fontSize * 0.5);
      const text = `${stampText} • ${new Date(capturedAt).toLocaleString()}`;
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.textBaseline = "top";
      const w = ctx.measureText(text).width;
      const y = canvas.height - fontSize - pad * 3;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(pad, y, w + pad * 2, fontSize + pad * 2);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, pad * 2, y + pad);
    }

    canvas.toBlob(
      (blob) =>
        setPreview({ blob, url: URL.createObjectURL(blob), kind: "photo", mimeType: "image/jpeg", capturedAt }),
      "image/jpeg",
      0.9
    );
  };

  const stopRecording = () => {
    clearInterval(tickRef.current);
    clearTimeout(stopTimeoutRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  };

  const startRecording = () => {
    if (!window.MediaRecorder || !streamRef.current) {
      setError("Video recording isn't supported in this browser.");
      return;
    }
    const capturedAt = new Date().toISOString();
    const preferred = pickVideoMime();
    const rec = new MediaRecorder(streamRef.current, preferred ? { mimeType: preferred } : undefined);
    chunksRef.current = [];

    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const mimeType = rec.mimeType || preferred || "video/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setPreview({ blob, url: URL.createObjectURL(blob), kind: "video", mimeType, capturedAt });
    };

    rec.start();
    recorderRef.current = rec;
    setRecording(true);
    setSeconds(0);
    tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    stopTimeoutRef.current = setTimeout(stopRecording, maxVideoSeconds * 1000);
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const confirm = () => {
    const { blob, kind, mimeType, capturedAt } = preview;
    onCapture?.({ blob, kind, mimeType, capturedAt, source: "live-camera" });
    retake();
  };

  // ---------- UI ----------
  // Viewfinder: corner brackets, scanlines and a caption bar. All overlays ignore pointer events.
  const hudBar = (status) => (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] bg-gradient-to-b from-black/85 to-transparent px-3 pb-6 pt-2.5 font-mono text-[10px] tracking-[0.05em] text-cyan-100/90">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">UNIT {unitCode || "----"}{phaseLabel ? ` · ${phaseLabel}` : ""}</span>
        <span className="flex shrink-0 items-center gap-1.5">{status}</span>
      </div>
      <HudClock className="mt-0.5 block text-cyan-100/65" />
    </div>
  );

  if (error) {
    return (
      <div className="viewfinder scanlines relative flex aspect-[4/3] flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-alert/40 bg-[#0b0710] p-6 text-center">
        {hudBar(<><span className="size-1.5 rounded-full bg-alert" aria-hidden /> NO SIGNAL</>)}
        <span className="flex size-11 items-center justify-center rounded-xl border border-alert/50 bg-alert/10 text-blush"><CameraOff size={22} aria-hidden /></span>
        <p className="text-sm font-semibold text-blush">Camera unavailable</p>
        <p className="max-w-xs text-sm text-[#ffd0dd]">{error}</p>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="animate-fade flex flex-col gap-3">
        <div className="viewfinder scanlines relative overflow-hidden rounded-lg border border-cyan-400/50 bg-black shadow-[0_0_30px_-8px_rgb(0_240_255/0.5)]">
          {preview.kind === "photo" ? (
            <img src={preview.url} alt="Captured" className="w-full" />
          ) : (
            <video src={preview.url} controls playsInline className="w-full" />
          )}
          {hudBar(<><span className="size-1.5 rounded-full bg-matrix" aria-hidden /> FRAME HELD</>)}
          {preview.kind === "photo" && <span aria-hidden className="animate-shutter pointer-events-none absolute inset-0 z-[5] bg-white opacity-0" />}
        </div>
        <div className="flex gap-3">
          <button onClick={retake} className="btn btn-outline btn-lg flex-1">
            <RotateCcw size={16} /> Retake
          </button>
          <button onClick={confirm} className="btn btn-primary btn-lg flex-1">
            <Check size={17} /> Use this {preview.kind}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`viewfinder scanlines relative overflow-hidden rounded-lg border bg-black transition-[border-color,box-shadow] duration-300 ${recording ? "border-alert/70 shadow-[0_0_30px_-8px_rgb(255_42_109/0.6)]" : "border-cyan-400/30"}`}>
        <video ref={videoRef} playsInline muted autoPlay className="aspect-[3/4] w-full object-cover" />
        {hudBar(recording
          ? <><span className="live-dot bg-alert" aria-hidden /> <span className="text-blush">REC {String(seconds).padStart(2, "0")}s / {maxVideoSeconds}s</span></>
          : <><span className="live-dot bg-alert" aria-hidden /> LIVE</>)}
        {/* center reticle */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[3] size-10 -translate-x-1/2 -translate-y-1/2">
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-300/40" />
          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-300/40" />
        </div>
        {recording && <span aria-hidden className="absolute inset-x-0 bottom-0 z-[4] h-1 origin-left bg-alert" style={{ animation: `fill-x ${maxVideoSeconds}s linear both` }} />}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div>
          {allowVideo && (
            <div className="inline-flex rounded-lg border border-line bg-void/60 p-0.5 text-[13px]" role="group" aria-label="Capture mode">
              {[["photo", Camera], ["video", Video]].map(([m, Icon]) => (
                <button
                  key={m}
                  disabled={recording}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium capitalize transition-[background-color,color,box-shadow] duration-150 disabled:opacity-50 ${mode === m ? "bg-cyan-400/15 text-neon shadow-[0_0_16px_-6px_rgb(0_240_255/0.7)]" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"}`}
                >
                  <Icon size={14} aria-hidden />{m}
                </button>
              ))}
            </div>
          )}
        </div>

        {mode === "photo" ? (
          <button onClick={takePhoto} aria-label="Take photo" className="group relative flex size-[68px] items-center justify-center rounded-full border-2 border-cyan-300 shadow-[0_0_22px_rgb(0_240_255/0.45)] transition-[transform,box-shadow] duration-150 hover:shadow-[0_0_34px_rgb(0_240_255/0.75)] active:scale-90">
            <span className="size-12 rounded-full bg-neon transition-colors group-hover:bg-white" />
          </button>
        ) : (
          <button
            onClick={recording ? stopRecording : startRecording}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className="flex size-[68px] items-center justify-center rounded-full border-2 border-alert/80 shadow-[0_0_22px_rgb(255_42_109/0.45)] transition-[transform,box-shadow] duration-150 hover:shadow-[0_0_34px_rgb(255_42_109/0.75)] active:scale-90"
          >
            <span className={`bg-alert transition-all duration-200 ${recording ? "size-6 rounded-md" : "size-12 rounded-full"}`} />
          </button>
        )}

        <div className="flex justify-end">
          <button
            disabled={recording}
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            aria-label={`Flip camera (now ${facing === "environment" ? "rear" : "front"})`}
            className="btn btn-outline"
          >
            <SwitchCamera size={16} /> Flip
          </button>
        </div>
      </div>
    </div>
  );
}
