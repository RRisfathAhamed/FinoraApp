import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { toast } from './toast';

/** File ingestion helpers: real bytes in, persistent data URLs out. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_DOC_BYTES = 12 * 1024 * 1024;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const DOC_TYPES = [
  ...IMAGE_TYPES,
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
];

export interface FilePayload {
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
}

export function validateImage(file: File): void {
  if (!IMAGE_TYPES.includes(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
    throw new Error('Choose a JPG, PNG, WEBP or HEIC image.');
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image is larger than 6 MB. Choose a smaller file.');
}

export function validateDocument(file: File): void {
  if (!DOC_TYPES.includes(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif|pdf|docx?|xlsx?)$/i.test(file.name)) {
    throw new Error('Choose a PDF, image, Word or Excel document.');
  }
  if (file.size > MAX_DOC_BYTES) throw new Error('File is larger than 12 MB.');
}

export function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/** Downscale photos for storage while keeping the document/gallery original intact. */
export async function compressImage(file: File, maxDimension = 1200, quality = 0.82): Promise<FilePayload> {
  validateImage(file);
  const dataUrl = await readAsDataURL(file);
  if (/image\/heic|image\/heif|image\/gif/i.test(file.type)) {
    // Canvas cannot decode HEIC/GIF reliably everywhere; keep the original bytes.
    return { name: file.name, mime: file.type || 'image/jpeg', size: file.size, dataUrl };
  }
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image could not be decoded.'));
    img.src = dataUrl;
  });
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  if (scale === 1 && file.size < 700_000) {
    return { name: file.name, mime: file.type, size: file.size, dataUrl };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { name: file.name, mime: file.type, size: file.size, dataUrl };
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const compressed = canvas.toDataURL('image/jpeg', quality);
  return {
    name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    mime: 'image/jpeg',
    size: Math.round((compressed.length * 3) / 4),
    dataUrl: compressed,
  };
}

export function readAsDataURLWithProgress(
  file: Blob,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    reader.onload = () => {
      onProgress?.(100);
      resolve(String(reader.result));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export async function readDocument(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<FilePayload> {
  validateDocument(file);
  const dataUrl = await readAsDataURLWithProgress(file, onProgress);
  return { name: file.name, mime: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'), size: file.size, dataUrl };
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'application/octet-stream';
  const binary = atob(body ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return readAsDataURL(blob);
}

function safeFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'finora-file';
}

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not prepare this file.'));
    reader.readAsDataURL(blob);
  });
}

async function writeNativeFile(filename: string, blob: Blob): Promise<{ uri: string; isPublic: boolean }> {
  const data = await blobBase64(blob);
  try {
    const result = await Filesystem.writeFile({
      path: `Finora/${safeFilename(filename)}`,
      data,
      directory: Directory.Documents,
      recursive: true,
    });
    return { uri: result.uri, isPublic: true };
  } catch {
    const result = await Filesystem.writeFile({
      path: safeFilename(filename),
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    return { uri: result.uri, isPublic: false };
  }
}

/** Save on desktop browsers and inside the native shell. Android WebView ignores anchor downloads. */
export function downloadBlob(filename: string, blob: Blob) {
  if (Capacitor.isNativePlatform()) {
    void (async () => {
      try {
        const saved = await writeNativeFile(filename, blob);
        if (saved.isPublic) {
          toast(`Saved ${safeFilename(filename)} to Documents/Finora`);
        } else {
          await Share.share({ title: filename, url: saved.uri, dialogTitle: 'Save or share this file' });
        }
      } catch (error) {
        toast((error as Error).message || 'Could not save this file.', 'error');
      }
    })();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename(filename);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function shareOrCopyText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (Capacitor.getPlatform() === 'android') {
    await Share.share({ title, text, dialogTitle: 'Share from Finora' });
    return 'shared';
  }
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title, text });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export async function shareOrDownload(filename: string, blob: Blob): Promise<'shared' | 'downloaded'> {
  if (Capacitor.isNativePlatform()) {
    const data = await blobBase64(blob);
    const written = await Filesystem.writeFile({
      path: safeFilename(filename),
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({ title: filename, url: written.uri, dialogTitle: 'Share from Finora' });
    return 'shared';
  }
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
    }
  }
  downloadBlob(filename, blob);
  return 'downloaded';
}

export function extFor(mime: string): string {
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('wordprocessingml')) return 'docx';
  if (mime.includes('spreadsheetml')) return 'xlsx';
  if (mime.includes('msword')) return 'doc';
  if (mime.includes('ms-excel')) return 'xls';
  return 'jpg';
}

export async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
