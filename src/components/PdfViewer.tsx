import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function dataUrlBytes(dataUrl: string): Uint8Array {
  const body = dataUrl.split(',')[1] ?? '';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function PdfViewer({ dataUrl, name }: { dataUrl: string; name: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof pdfjs.getDocument>;
    try {
      task = pdfjs.getDocument({ data: dataUrlBytes(dataUrl) });
    } catch (err) {
      setError((err as Error).message || 'This PDF could not be opened.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setDocument(null);
    setPageNumber(1);
    task.promise
      .then((pdf) => {
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        setDocument(pdf);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'This PDF could not be opened.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [dataUrl]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => setWidth(stage.clientWidth));
    observer.observe(stage);
    setWidth(stage.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    void (async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const natural = page.getViewport({ scale: 1 });
        const available = Math.max(260, (width || stageRef.current?.clientWidth || 640) - 28);
        const fit = Math.min(2, Math.max(0.4, available / natural.width));
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        let viewport = page.getViewport({ scale: fit * zoom });
        // Keep giant pages inside a safe GPU/canvas budget on low-memory phones.
        const maxSide = 4096;
        const maxPixels = 14_000_000;
        let safeRatio = ratio;
        if (viewport.height * safeRatio > maxSide) safeRatio = maxSide / viewport.height;
        if (viewport.width * safeRatio > maxSide) safeRatio = maxSide / viewport.width;
        if (viewport.width * viewport.height * safeRatio * safeRatio > maxPixels) {
          safeRatio = Math.sqrt(maxPixels / (viewport.width * viewport.height));
        }
        if (safeRatio < ratio) {
          viewport = page.getViewport({ scale: fit * zoom });
        }
        const canvas = canvasRef.current;
        canvas.width = Math.max(1, Math.floor(viewport.width * safeRatio));
        canvas.height = Math.max(1, Math.floor(viewport.height * safeRatio));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('This device could not render the PDF page.');
        context.clearRect(0, 0, canvas.width, canvas.height);
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: safeRatio === 1 ? undefined : [safeRatio, 0, 0, safeRatio, 0, 0],
        });
        await renderTask.promise;
      } catch (err) {
        if (cancelled || (err as { name?: string }).name === 'RenderingCancelledException') return;
        setError((err as Error).message || 'This page could not be rendered.');
      }
    })();

    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* renderer already finished */ }
    };
  }, [document, pageNumber, zoom, width]);

  const goToPage = (next: number) => {
    if (!document) return;
    setPageNumber(Math.min(document.numPages, Math.max(1, next)));
    stageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer__toolbar">
        <div className="pdf-viewer__zoom">
          <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>
            <ZoomOut size={17} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>
            <ZoomIn size={17} />
          </button>
        </div>
        <div className="pdf-viewer__pages">
          <button type="button" className="icon-btn" aria-label="Previous page" disabled={pageNumber <= 1} onClick={() => goToPage(pageNumber - 1)}>
            <ChevronLeft size={18} />
          </button>
          <span>{document ? `${pageNumber} / ${document.numPages}` : '—'}</span>
          <button type="button" className="icon-btn" aria-label="Next page" disabled={!document || pageNumber >= document.numPages} onClick={() => goToPage(pageNumber + 1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="pdf-viewer__scroll" ref={stageRef}>
        {loading ? (
          <div className="pdf-viewer__state"><Loader2 size={22} className="spin" /> Preparing PDF…</div>
        ) : error ? (
          <div className="pdf-viewer__state pdf-viewer__state--error">
            <AlertCircle size={24} />
            <strong>PDF could not be displayed</strong>
            <span>{error}</span>
            <span className="tiny">Download the original file and try another PDF reader.</span>
          </div>
        ) : (
          <canvas ref={canvasRef} aria-label={`${name}, page ${pageNumber}`} />
        )}
      </div>
    </div>
  );
}
