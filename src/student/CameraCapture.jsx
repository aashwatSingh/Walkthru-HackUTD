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
  // Security-camera viewfinder: corner brackets, scanlines and a HUD bar. All overlays ignore pointer events.
  const hudBar = (status) => (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] bg-gradient-to-b from-black/80 to-transparent px-3 pb-6 pt-2.5 font-mono text-[10px] tracking-[0.06em] text-cyan-100/90">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">CAM_01 // UNIT {unitCode || "----"}</span>
        <span className="flex shrink-0 items-center gap-1.5">{status}</span>
      </div>
      <HudClock className="mt-0.5 block text-cyan-100/65" />
    </div>
  );
  const footBar = (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-6 font-mono text-[10px] tracking-[0.06em] text-cyan-100/80">
      <span>{phaseLabel || "EVIDENCE"} · {facing === "environment" ? "REAR" : "FRONT"}</span>
      <span>{mode === "photo" ? "[MODE // STILL]" : `[REC // ${maxVideoSeconds}s MAX]`}</span>
    </div>
  );

  if (error) {
    return (
      <div className="hud-frame scanlines relative flex aspect-[4/3] flex-col items-center justify-center gap-2 overflow-hidden rounded-[3px] border border-rose-500/40 bg-[#0b0710] p-6 text-center">
        {hudBar(<><span className="live-dot bg-[#FF2A6D]" aria-hidden /> NO_SIGNAL</>)}
        <p className="font-mono text-xs tracking-[0.08em] text-[#FF2A6D]">[CAMERA // OFFLINE]</p>
        <p className="max-w-xs text-sm text-[#ffc2d4]">{error}</p>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="flex flex-col gap-3">
        <div className="hud-frame scanlines relative overflow-hidden rounded-[3px] border border-cyan-400/40 bg-black">
          {preview.kind === "photo" ? (
            <img src={preview.url} alt="Captured" className="w-full" />
          ) : (
            <video src={preview.url} controls playsInline className="w-full" />
          )}
          {hudBar(<><span className="live-dot bg-[#00FF9D]" aria-hidden /> FRAME_HELD</>)}
        </div>
        <div className="flex gap-3">
          <button onClick={retake} className="btn btn-outline btn-lg flex-1">
            Retake
          </button>
          <button onClick={confirm} className="btn btn-primary btn-lg flex-1">
            Use this {preview.kind}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="hud-frame scanlines relative overflow-hidden rounded-[3px] border border-cyan-400/30 bg-black">
        <video ref={videoRef} playsInline muted autoPlay className="aspect-[3/4] w-full object-cover" />
        {hudBar(recording
          ? <><span className="live-dot bg-[#FF2A6D]" aria-hidden /> <span className="text-[#ff8fb0]">REC {String(seconds).padStart(2, "0")}s / {maxVideoSeconds}s</span></>
          : <><span className="live-dot bg-[#FF2A6D]" aria-hidden /> LIVE CAPTURE</>)}
        {/* center reticle */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[3] size-10 -translate-x-1/2 -translate-y-1/2">
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-300/40" />
          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-300/40" />
        </div>
        {footBar}
      </div>

      {allowVideo && (
        <div className="flex justify-center gap-1 font-mono text-xs" role="group" aria-label="Capture mode">
          {["photo", "video"].map((m) => (
            <button
              key={m}
              disabled={recording}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-[2px] border px-4 py-1.5 uppercase tracking-[0.08em] transition-colors ${mode === m ? "border-cyan-400/60 bg-cyan-400/10 text-neon" : "border-purple-500/25 text-muted-foreground hover:text-foreground"}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-6">
        <button
          disabled={recording}
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          className="btn btn-outline"
        >
          Flip
        </button>

        {mode === "photo" ? (
          <button onClick={takePhoto} aria-label="Take photo" className="group relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-cyan-400/80 shadow-[0_0_18px_rgb(0_240_255/0.35)] transition-transform active:scale-90">
            <span className="h-11 w-11 rounded-full bg-neon transition-colors group-hover:bg-[#5ff6ff]" />
          </button>
        ) : (
          <button
            onClick={recording ? stopRecording : startRecording}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-rose-500/70 shadow-[0_0_18px_rgb(255_42_109/0.35)]"
          >
            <span className={`bg-[#FF2A6D] transition-all ${recording ? "h-6 w-6 rounded-[3px]" : "h-11 w-11 rounded-full"}`} />
          </button>
        )}

        <span className="w-[52px]" />
      </div>
    </div>
  );
}
