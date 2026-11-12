/** File ingestion helpers: real bytes in, persistent data URLs out. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_DOC_BYTES = 12 * 1024 * 1024;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf'];

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
  if (!DOC_TYPES.includes(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif|pdf)$/i.test(file.name)) {
    throw new Error('Only PDF, JPG, PNG or WEBP files are supported.');
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

export async function readDocument(file: File): Promise<FilePayload> {
  validateDocument(file);
  const dataUrl = await readAsDataURL(file);
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

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function shareOrDownload(filename: string, blob: Blob): Promise<'shared' | 'downloaded'> {
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
  return 'jpg';
}

export async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
