import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crop, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { validateImage, type FilePayload } from '../lib/files';
import { registerBackCloser } from '../lib/backStack';

/**
 * Local, dependency-free photo cropper.
 *
 * The picked file never leaves the device: it is decoded with the browser,
 * panned and zoomed on a canvas-backed stage, then re-encoded at a sensible
 * size. Used for the profile photo (round) and account imagery.
 */
export function ImageCropper({
  file,
  aspect = 1,
  round = false,
  title = 'Crop photo',
  outputSize = 720,
  onCancel,
  onDone,
}: {
  file: File;
  aspect?: number;
  round?: boolean;
  title?: string;
  outputSize?: number;
  onCancel: () => void;
  onDone: (payload: FilePayload) => void;
}) {
  const [error, setError] = useState('');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let url = '';
    let cancelled = false;
    try {
      validateImage(file);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setError('This photo could not be opened. Try a JPG or PNG.');
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => registerBackCloser(onCancel), [onCancel]);

  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => setStage({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [image]);

  const baseScale = image && stage.width > 0
    ? Math.max(stage.width / image.naturalWidth, stage.height / image.naturalHeight)
    : 1;
  const scale = baseScale * zoom;

  const clampOffset = useCallback(
    (next: { x: number; y: number }, nextScale: number) => {
      if (!image) return next;
      const maxX = Math.max(0, (image.naturalWidth * nextScale - stage.width) / 2);
      const maxY = Math.max(0, (image.naturalHeight * nextScale - stage.height) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [image, stage.width, stage.height],
  );

  useEffect(() => {
    setOffset((current) => clampOffset(current, scale));
  }, [scale, clampOffset]);

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const confirm = () => {
    if (!image || !stage.width) return;
    setBusy(true);
    try {
      const sourceWidth = stage.width / scale;
      const sourceHeight = stage.height / scale;
      const sourceX = image.naturalWidth / 2 - (stage.width / 2 + offset.x) / scale;
      const sourceY = image.naturalHeight / 2 - (stage.height / 2 + offset.y) / scale;
      const outWidth = aspect >= 1 ? outputSize : Math.round(outputSize * aspect);
      const outHeight = aspect >= 1 ? Math.round(outputSize / aspect) : outputSize;
      const canvas = document.createElement('canvas');
      canvas.width = outWidth;
      canvas.height = outHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cropping is not supported on this device.');
      ctx.imageSmoothingQuality = 'high';
      if (round) {
        ctx.beginPath();
        ctx.arc(outWidth / 2, outHeight / 2, Math.min(outWidth, outHeight) / 2, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outWidth, outHeight);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      onDone({
        name: file.name.replace(/\.[^.]+$/, '') + '-cropped.jpg',
        mime: 'image/jpeg',
        size: Math.round((dataUrl.length * 3) / 4),
        dataUrl,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="cropper" role="dialog" aria-modal="true" aria-label={title}>
      <header className="cropper__head">
        <button className="icon-btn icon-btn--dark" onClick={onCancel} aria-label="Cancel">
          <X size={20} />
        </button>
        <div className="cropper__title">
          <span className="cropper__eyebrow"><Crop size={12} /> Adjust</span>
          <h2>{title}</h2>
        </div>
        <button className="icon-btn icon-btn--dark" onClick={reset} aria-label="Reset crop">
          <RotateCcw size={18} />
        </button>
      </header>

      <div className="cropper__body">
        {error ? (
          <div className="cropper__error" role="alert">{error}</div>
        ) : (
          <div
            ref={stageRef}
            className={`cropper__stage ${round ? 'cropper__stage--round' : ''}`}
            style={{ aspectRatio: String(aspect) }}
            onPointerDown={(event) => {
              drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const next = {
                x: drag.current.ox + (event.clientX - drag.current.x),
                y: drag.current.oy + (event.clientY - drag.current.y),
              };
              setOffset(clampOffset(next, scale));
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          >
            {image ? (
              <img
                src={image.src}
                alt=""
                draggable={false}
                style={{
                  width: image.naturalWidth * scale,
                  height: image.naturalHeight * scale,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            ) : (
              <div className="cropper__loading">Loading photo…</div>
            )}
            <span className="cropper__grid" aria-hidden />
          </div>
        )}

        <div className="cropper__zoom">
          <Minus size={16} />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            aria-label="Zoom"
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <Plus size={16} />
        </div>
        <p className="cropper__hint">Drag to reposition · pinch-free zoom slider below</p>
      </div>

      <footer className="cropper__foot">
        <button className="btn btn--ghost btn--sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn--primary" onClick={confirm} disabled={!image || busy || Boolean(error)}>
          {busy ? 'Cropping…' : 'Use photo'}
        </button>
      </footer>
    </div>,
    document.body,
  );
}
