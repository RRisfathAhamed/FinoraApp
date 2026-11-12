import JSZip from 'jszip';
import type { AppState, BackupManifest } from './types';
import { dataUrlToBlob, extFor, sha256 } from './files';
import { store } from './store';
import { salaryReceived, salaryNet, generateSchedule, emiPaid } from './calc';

const BACKUP_MEDIA_PREFIX = 'media/';
const BACKUP_DOCS_PREFIX = 'documents/';
const STATE_PATH = 'data/finora.json';
const MANIFEST_PATH = 'manifest.json';

export interface BackupProgress {
  phase: string;
  percent: number;
}

function countRecords(state: AppState): Record<string, number> {
  return {
    accounts: state.accounts.length,
    transactions: state.transactions.length,
    jobs: state.jobs.length,
    salaryRecords: state.salaryRecords.length,
    salaryPayments: state.salaryRecords.reduce((n, r) => n + r.payments.length, 0),
    loans: state.loans.length,
    emiPayments: state.emiPayments.length,
    budgets: state.budgets.length,
    goals: state.goals.length,
    investments: state.investments.length,
    bills: state.bills.length,
    billPayments: state.billPayments.length,
    documents: state.documents.length,
    media: Object.keys(state.media).length,
    smsDrafts: state.smsDrafts.length,
  };
}

/**
 * Create a real ZIP containing the user's financial records and the actual
 * media bytes (not just URLs), with per-file SHA-256 checksums in the manifest.
 * No credentials or secrets are present anywhere in the app state.
 */
export async function createBackup(
  state: AppState,
  onProgress?: (p: BackupProgress) => void,
): Promise<Blob> {
  const zip = new JSZip();
  const manifest: BackupManifest = {
    app: 'finora',
    schemaVersion: state.schemaVersion,
    createdAt: new Date().toISOString(),
    counts: countRecords(state),
    currency: state.settings.currency,
    files: [],
    documentFiles: [],
  };

  const clone: AppState = JSON.parse(JSON.stringify(state));
  clone.media = {};
  for (const [id, media] of Object.entries(state.media)) {
    const path = `${BACKUP_MEDIA_PREFIX}${id}.${extFor(media.mime)}`;
    const blob = dataUrlToBlob(media.dataUrl);
    const buffer = await blob.arrayBuffer();
    zip.file(path, buffer);
    manifest.files.push({
      path,
      size: buffer.byteLength,
      checksum: await sha256(buffer),
      mime: media.mime,
    });
    clone.media[id] = { ...media, dataUrl: `@${path}` };
    onProgress?.({ phase: 'Packing media', percent: Math.round((manifest.files.length / Math.max(1, Object.keys(state.media).length)) * 40) });
  }

  clone.documents = [];
  const totalDocs = state.documents.length;
  for (let i = 0; i < totalDocs; i += 1) {
    const doc = state.documents[i];
    const path = `${BACKUP_DOCS_PREFIX}${doc.id}.${extFor(doc.mime)}`;
    const blob = dataUrlToBlob(doc.dataUrl);
    const buffer = await blob.arrayBuffer();
    zip.file(path, buffer);
    manifest.documentFiles.push({
      path,
      size: buffer.byteLength,
      checksum: await sha256(buffer),
      mime: doc.mime,
    });
    clone.documents.push({ ...doc, dataUrl: `@${path}` });
    onProgress?.({ phase: 'Packing documents', percent: 40 + Math.round(((i + 1) / Math.max(1, totalDocs)) * 35) });
  }

  onProgress?.({ phase: 'Writing records', percent: 80 });
  const stateJSON = JSON.stringify(clone, null, 2);
  zip.file(STATE_PATH, stateJSON);
  const stateBytes = new TextEncoder().encode(stateJSON);
  manifest.files.push({
    path: STATE_PATH,
    size: stateBytes.byteLength,
    checksum: await sha256(stateBytes.buffer as ArrayBuffer),
    mime: 'application/json',
  });
  zip.file(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  onProgress?.({ phase: 'Compressing archive', percent: 90 });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  onProgress?.({ phase: 'Backup ready', percent: 100 });
  return blob;
}

export interface RestorePreview {
  createdAt: string;
  counts: Record<string, number>;
  state: AppState;
}

function countLabel(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
    .join(', ');
}

export function restoreSummary(preview: RestorePreview): string {
  return countLabel(preview.counts) || 'No records';
}

/** Read, verify and rebuild a backup without touching stored state. */
export async function readBackup(file: File, onProgress?: (p: BackupProgress) => void): Promise<RestorePreview> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a valid ZIP archive.');
  }
  const manifestFile = zip.file(MANIFEST_PATH);
  if (!manifestFile) throw new Error('manifest.json is missing — this is not a Finora backup.');
  const manifest = JSON.parse(await manifestFile.async('string')) as BackupManifest;
  if (manifest.app !== 'finora') throw new Error('This archive belongs to another application.');
  if (manifest.schemaVersion > 1) throw new Error('This backup was created by a newer version of Finora.');

  onProgress?.({ phase: 'Verifying archive', percent: 20 });
  for (const entry of [...manifest.files, ...manifest.documentFiles]) {
    const zipped = zip.file(entry.path);
    if (!zipped) throw new Error(`Backup is incomplete: ${entry.path} is missing.`);
    const buffer = await zipped.async('arraybuffer');
    if (buffer.byteLength !== entry.size) throw new Error(`File size mismatch for ${entry.path}.`);
    const digest = await sha256(buffer);
    if (digest !== entry.checksum) throw new Error(`Checksum mismatch for ${entry.path}. The backup is corrupted.`);
  }

  onProgress?.({ phase: 'Reading records', percent: 70 });
  const stateFile = zip.file(STATE_PATH);
  if (!stateFile) throw new Error('Financial records are missing from the backup.');
  const state = JSON.parse(await stateFile.async('string')) as AppState;

  for (const [id, media] of Object.entries(state.media ?? {})) {
    if (!media.dataUrl.startsWith('@')) continue;
    const path = media.dataUrl.slice(1);
    const entry = zip.file(path);
    if (!entry) throw new Error(`Missing media file for ${id}.`);
    const blob = await entry.async('blob');
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    media.dataUrl = `data:${media.mime};base64,${btoa(binary)}`;
  }

  state.documents = state.documents ?? [];
  for (const doc of state.documents) {
    if (!doc.dataUrl.startsWith('@')) continue;
    const path = doc.dataUrl.slice(1);
    const entry = zip.file(path);
    if (!entry) throw new Error(`Missing document file for ${doc.id}.`);
    const blob = await entry.async('blob');
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    doc.dataUrl = `data:${doc.mime};base64,${btoa(binary)}`;
  }

  onProgress?.({ phase: 'Verified', percent: 100 });
  return { createdAt: manifest.createdAt, counts: manifest.counts, state };
}

export function applyRestore(preview: RestorePreview) {
  store.replaceState(preview.state);
}

/** Files referenced by any record — used to avoid deleting shared media. */
export function referencedMediaIds(state: AppState): Set<string> {
  const ids = new Set<string>();
  if (state.profile.avatarId) ids.add(state.profile.avatarId);
  for (const a of state.accounts) if (a.imageId) ids.add(a.imageId);
  for (const t of state.transactions) if (t.attachmentId) ids.add(t.attachmentId);
  for (const i of state.investments) if (i.attachmentId) ids.add(i.attachmentId);
  return ids;
}

/**
 * Remove only this user's financial records and the media exclusively owned by
 * them. Settings, profile identity and the avatar are explicitly retained.
 * Returns counts so the UI can report exactly what happened.
 */
export function clearAllFinancialData(state: AppState): { state: AppState; removed: Record<string, number> } {
  const removed = countRecords(state);
  const keepMedia: Record<string, AppState['media'][string]> = {};
  if (state.profile.avatarId && state.media[state.profile.avatarId]) {
    keepMedia[state.profile.avatarId] = state.media[state.profile.avatarId];
  }
  const next: AppState = {
    ...state,
    accounts: [],
    transactions: [],
    jobs: [],
    salaryRecords: [],
    loans: [],
    emiPayments: [],
    budgets: [],
    goals: [],
    investments: [],
    bills: [],
    billPayments: [],
    documents: [],
    media: keepMedia,
    smsDrafts: [],
    readNotifKeys: [],
    recentSearches: [],
  };
  return { state: next, removed };
}

export function financialTotalsForVerification(state: AppState): {
  outstanding: number;
  received: number;
} {
  let outstanding = 0;
  for (const loan of state.loans) {
    for (const emi of generateSchedule(loan)) {
      outstanding += Math.max(0, emi.totalDue - emiPaid(state.emiPayments, emi.id).amount);
    }
  }
  const received = state.salaryRecords.reduce((total, record) => {
    const job = state.jobs.find((j) => j.id === record.jobId);
    if (!job) return total;
    return total + Math.min(salaryReceived(record), salaryNet(record, job));
  }, 0);
  return { outstanding, received };
}
