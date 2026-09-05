'use client';

/**
 * In-app 3-second verification recorder.
 *
 * Opens the front camera, shows a live preview, records for ~3 seconds, then
 * automatically stops — the student never has to trim or compress anything.
 * The resulting small Blob (WebM, low bitrate) is handed to `onRecorded` so the
 * caller can upload it straight to the private verification bucket.
 *
 * If MediaRecorder or getUserMedia is unavailable (e.g. older iOS Safari), we
 * gracefully fall back to a `capture="user"` file input so the flow still works
 * via the phone's native camera + file picker.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, Video, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

const RECORD_MS = 3000;

type Props = {
  /** Called with the finished recording or null on cancel. */
  onRecorded: (blob: Blob | null) => void;
  /** Turns red/disabled when a submission is in flight. */
  disabled?: boolean;
};

export default function VerificationRecorder({ onRecorded, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hasBlob, setHasBlob] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices && 'MediaRecorder' in window;

  const stopAll = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPreviewing(false);
    setRecording(false);
  };

  const startPreview = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      streamRef.current = stream;
      // The <video> preview only exists once `previewing` renders it, so attach
      // the stream in the effect below rather than here.
      setPreviewing(true);
    } catch (err) {
      console.error('[recorder] camera error', err);
      setError('Could not open your camera. Please allow camera access and try again, or use the file upload below.');
      stopAll();
    }
  };

  const beginRecording = () => {
    if (!streamRef.current || recording) return;
    let mime = 'video/webm';
    // Prefer a format the server/admin can play broadly. Safari supports mp4;
    // Chrome/Firefox typically only record webm. Pick whichever the browser can
    // record, defaulting to webm.
    const candidates = ['video/mp4;codecs=avc1.64001e,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const chosen = candidates.find((c) => MediaRecorder.isTypeSupported?.(c));
    if (chosen) mime = chosen;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(streamRef.current, {
        mimeType: mime,
        videoBitsPerSecond: 300_000,
        audioBitsPerSecond: 32_000,
      });
    } catch {
      recorder = new MediaRecorder(streamRef.current, { videoBitsPerSecond: 300_000 });
    }

    chunksRef.current = [];
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      setHasBlob(blob.size > 0);
      onRecorded(blob.size > 0 ? blob : null);
      stopAll();
    };

    recorder.start();
    setRecording(true);
    setElapsed(0);
    const startedAt = Date.now();

    // Auto-stop after ~3 seconds.
    timerRef.current = setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }, RECORD_MS);

    // Progress ticker.
    const tick = setInterval(() => {
      setElapsed(Math.min(3, (Date.now() - startedAt) / 1000));
    }, 100);
    const originalStop = recorder.onstop;
    recorder.onstop = () => {
      clearInterval(tick);
      originalStop?.call(recorder, null as unknown as BlobEvent);
    };
  };

  const cancelRecording = () => {
    onRecorded(null);
    setHasBlob(false);
    stopAll();
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!previewing || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {});
  }, [previewing]);

  if (!supported) {
    // Fallback: native camera via capture + file picker.
    return (
      <label
        className={`block cursor-pointer bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-amber-500/50 transition-all ${disabled ? 'opacity-60' : ''}`}
      >
        <div className="flex items-center gap-2 text-neutral-300">
          <Video size={16} className="text-amber-500" />
          <span className="text-xs font-bold">Verification Video (~3s selfie)</span>
        </div>
        <p className="text-[10px] text-neutral-500 mt-1 mb-2">Your camera will record. MP4 / MOV, keep it short.</p>
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          capture="user"
          className="hidden"
          disabled={disabled}
        />
        <span className="text-[11px] text-neutral-400">Tap to open your camera and record</span>
      </label>
    );
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-neutral-300">
        <Video size={16} className="text-amber-500" />
        <span className="text-xs font-bold">Verification Video (~3s selfie)</span>
      </div>

      {!previewing && !hasBlob ? (
        <button
          type="button"
          onClick={startPreview}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 text-xs font-bold bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-800 text-white py-3 rounded-xl transition-all cursor-pointer"
        >
          <Camera size={15} />
          <span>Start Camera &amp; Record</span>
        </button>
      ) : null}

      {previewing && (
        <div className="space-y-2">
          <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            {recording && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2.5 py-1">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-mono text-white">{elapsed.toFixed(1)}s / 3s</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {!recording ? (
              <button
                type="button"
                onClick={beginRecording}
                disabled={disabled}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-bold bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 text-white py-2.5 rounded-xl transition-all cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-white" />
                <span>Record 3s</span>
              </button>
            ) : (
              <span className="flex-1 flex items-center justify-center text-[11px] font-mono text-neutral-300 py-2.5">
                Recording… stops automatically at 3s
              </span>
            )}
            <button
              type="button"
              onClick={cancelRecording}
              disabled={disabled}
              className="flex items-center gap-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              <XCircle size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {hasBlob && !previewing && (
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle size={16} />
          <span className="text-[11px]">Video recorded. Ready to submit.</span>
          <button
            type="button"
            onClick={() => {
              onRecorded(null);
              setHasBlob(false);
            }}
            disabled={disabled}
            className="ml-auto flex items-center gap-1 text-[11px] text-neutral-300 hover:text-white font-semibold disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={13} /> Re-record
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}