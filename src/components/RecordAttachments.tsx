import { useRef, useState } from 'react';
import {
  Camera,
  Download,
  Eye,
  FileText,
  Images,
  Paperclip,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import type { DocCategory, DocLink, VaultDoc } from '../lib/types';
import { useApp } from '../lib/hooks';
import { actions, store } from '../lib/store';
import {
  type FilePayload,
  dataUrlToBlob,
  downloadBlob,
  readDocument,
  shareOrDownload,
} from '../lib/files';
import { formatDate } from '../lib/calc';
import { toast } from '../lib/toast';
import { Btn, IconBtn, Sheet } from './ui';
import { PdfViewer } from './PdfViewer';

const ACCEPT = '.pdf,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.doc,.docx,.xls,.xlsx';

function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const CATEGORY_TITLES: Partial<Record<DocCategory, string>> = {
  payslip: 'Payslip & salary documents',
  'loan-agreement': 'Loan agreement & documents',
  'bank-statement': 'Bank statement',
  receipt: 'Receipts & documents',
  invoice: 'Bill & subscription documents',
  'emi-schedule': 'Repayment schedule',
};

function typeText(mime: string, name: string): string {
  if (mime.startsWith('image/')) return mime.replace('image/', '').toUpperCase();
  if (mime.includes('pdf')) return 'PDF';
  return (name.split('.').pop() ?? 'file').toUpperCase();
}

function matches(doc: VaultDoc, links: DocLink[]): boolean {
  return doc.links.some((owned) => links.some((link) => link.type === owned.type && link.id === owned.id));
}

function linked(links: DocLink[]): VaultDoc[] {
  return store.state.documents.filter((doc) => matches(doc, links));
}

/** Persist staged files after the financial record has an ID. */
export function commitRecordAttachments(
  files: FilePayload[],
  links: DocLink[],
  category: DocCategory,
): number {
  const existing = new Set(linked(links).map((doc) => `${doc.name}:${doc.size}`));
  let added = 0;
  for (const file of files) {
    const key = `${file.name}:${file.size}`;
    if (existing.has(key)) continue;
    existing.add(key);
    actions.document.add({
      name: file.name,
      mime: file.mime,
      size: file.size,
      dataUrl: file.dataUrl,
      category,
      links,
    });
    added += 1;
  }
  return added;
}

export function RecordAttachments({
  links,
  category,
  staged,
  onStagedChange,
  title,
  hint,
  disabled,
  readOnly,
}: {
  links: DocLink[];
  category: DocCategory;
  staged: FilePayload[];
  onStagedChange: (files: FilePayload[]) => void;
  title?: string;
  hint?: string;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const state = useApp();
  const existing = state.documents.filter((doc) => matches(doc, links));
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ docId?: string; index?: number } | null>(null);
  const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null);
  const [preview, setPreview] = useState<{ name: string; mime: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (readOnly && existing.length === 0) return null;

  const addFiles = async (picked: FileList | null) => {
    const files = Array.from(picked ?? []);
    if (!files.length) return;
    setBusy(true);
    const accepted: FilePayload[] = [];
    for (const file of files) {
      if ([...existing, ...staged].some((item) => item.name === file.name && item.size === file.size)) {
        toast(`${file.name} is already attached`, 'error');
        continue;
      }
      try {
        setProgress({ name: file.name, percent: 0 });
        accepted.push(await readDocument(file, (percent) => setProgress({ name: file.name, percent })));
      } catch (error) {
        toast((error as Error).message, 'error');
      }
    }
    if (accepted.length) onStagedChange([...staged, ...accepted]);
    setProgress(null);
    setBusy(false);
  };

  const share = async (item: { name: string; dataUrl: string }) => {
    try {
      const outcome = await shareOrDownload(item.name, dataUrlToBlob(item.dataUrl));
      toast(outcome === 'shared' ? 'Attachment shared' : 'Attachment downloaded');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast((error as Error).message, 'error');
    }
  };

  const open = (item: { name: string; dataUrl: string }) => {
    const url = URL.createObjectURL(dataUrlToBlob(item.dataUrl));
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      URL.revokeObjectURL(url);
      downloadBlob(item.name, dataUrlToBlob(item.dataUrl));
      toast('Opening was blocked — the file has been downloaded instead.', 'error');
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const removeDoc = (doc: VaultDoc) => {
    for (const link of doc.links.filter((owned) => links.some((link) => link.type === owned.type && link.id === owned.id))) {
      actions.documents.unlink(doc.id, link);
    }
    toast('Removed from this record — the original remains in Vault');
  };

  const replaceFile = async (picked: File | undefined) => {
    const target = replaceTarget;
    setReplaceTarget(null);
    if (!picked || !target) return;
    try {
      setBusy(true);
      setProgress({ name: picked.name, percent: 0 });
      const payload = await readDocument(picked, (percent) => setProgress({ name: picked.name, percent }));
      if (target.docId) {
        actions.document.update(target.docId, {
          name: payload.name,
          mime: payload.mime,
          size: payload.size,
          dataUrl: payload.dataUrl,
        });
      } else if (target.index !== undefined) {
        onStagedChange(staged.map((file, index) => (index === target.index ? payload : file)));
      }
      toast('Attachment replaced');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setProgress(null);
      setBusy(false);
    }
  };

  const beginReplace = (target: { docId?: string; index?: number }) => {
    setReplaceTarget(target);
    replaceInput.current?.click();
  };

  const total = existing.length + staged.length;
  const heading = title ?? CATEGORY_TITLES[category] ?? 'Attachments';

  return (
    <div className="record-attachments">
      <div className="record-attachments__head">
        <span className="record-attachments__title"><Paperclip size={15} /> {heading}</span>
        <span className="tiny muted">
          {total ? `${total} file${total === 1 ? '' : 's'} · original quality` : 'Optional · stored in Vault'}
        </span>
      </div>

      {!readOnly ? (
        <>
          {total === 0 ? (
            <div className="record-attachments__empty">
              <span className="record-attachments__empty-icon"><FileText size={22} /></span>
              <span>
                <strong>Attach a receipt, slip or supporting document</strong>
                <span>Add as many files as this record needs.</span>
              </span>
            </div>
          ) : null}
          <div className="record-attachments__actions">
            <label className={`btn btn--soft btn--sm${busy || disabled ? ' btn--disabled' : ''}`}>
              <Upload size={15} /> Add files
              <input type="file" accept={ACCEPT} multiple hidden disabled={busy || disabled} onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
            </label>
            <label className={`btn btn--soft btn--sm${busy || disabled ? ' btn--disabled' : ''}`}>
              <Images size={15} /> Gallery
              <input type="file" accept="image/*" multiple hidden disabled={busy || disabled} onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
            </label>
            <label className={`btn btn--soft btn--sm${busy || disabled ? ' btn--disabled' : ''}`}>
              <Camera size={15} /> Camera
              <input type="file" accept="image/*" capture="environment" hidden disabled={busy || disabled} onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
            </label>
          </div>
          <input
            ref={replaceInput}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => { void replaceFile(e.target.files?.[0]); e.target.value = ''; }}
          />
          <p className="hint">{hint ?? 'JPG, PNG, WEBP, PDF, DOCX or XLSX · up to 12 MB per file · multiple files supported.'}</p>
        </>
      ) : null}

      {progress ? (
        <div className="attachment-progress" role="status" aria-live="polite">
          <div className="attachment-progress__top">
            <span>{progress.percent >= 100 ? 'Processing' : 'Uploading'} {progress.name}</span>
            <span>{progress.percent}%</span>
          </div>
          <div className="attachment-progress__track"><i style={{ width: `${progress.percent}%` }} /></div>
        </div>
      ) : null}

      {total ? (
        <div className="attachment-list">
          {existing.map((doc) => (
            <div className="attachment-item" key={doc.id}>
              <button className="attachment-item__thumb" type="button" onClick={() => setPreview(doc)} aria-label={`Preview ${doc.name}`}>
                {doc.mime.startsWith('image/') ? <img src={doc.dataUrl} alt="" loading="lazy" /> : <FileText size={21} />}
              </button>
              <span className="attachment-item__body">
                <button className="attachment-item__name" type="button" onClick={() => setPreview(doc)}>{doc.name}</button>
                <span className="attachment-item__meta">{typeText(doc.mime, doc.name)} · {sizeText(doc.size)} · {formatDate(doc.createdAt.slice(0, 10))}</span>
              </span>
              <span className="attachment-item__tools">
                <IconBtn label={`Preview ${doc.name}`} onClick={() => setPreview(doc)}><Eye size={15} /></IconBtn>
                <IconBtn label={`Download ${doc.name}`} onClick={() => downloadBlob(doc.name, dataUrlToBlob(doc.dataUrl))}><Download size={15} /></IconBtn>
                <IconBtn label={`Share ${doc.name}`} onClick={() => void share(doc)}><Share2 size={15} /></IconBtn>
                {!readOnly ? (
                  <>
                    <IconBtn label={`Replace ${doc.name}`} onClick={() => beginReplace({ docId: doc.id })}><RefreshCw size={15} /></IconBtn>
                    <IconBtn label={`Remove ${doc.name}`} onClick={() => removeDoc(doc)}><Trash2 size={15} /></IconBtn>
                  </>
                ) : null}
              </span>
            </div>
          ))}
          {staged.map((file, index) => (
            <div className="attachment-item attachment-item--staged" key={`${file.name}-${file.size}-${index}`}>
              <button className="attachment-item__thumb" type="button" onClick={() => setPreview(file)} aria-label={`Preview ${file.name}`}>
                {file.mime.startsWith('image/') ? <img src={file.dataUrl} alt="" /> : <FileText size={21} />}
              </button>
              <span className="attachment-item__body">
                <button className="attachment-item__name" type="button" onClick={() => setPreview(file)}>{file.name}</button>
                <span className="attachment-item__meta">{typeText(file.mime, file.name)} · {sizeText(file.size)} · Ready to save</span>
              </span>
              <span className="attachment-item__tools">
                <IconBtn label={`Preview ${file.name}`} onClick={() => setPreview(file)}><Eye size={15} /></IconBtn>
                <IconBtn label={`Download ${file.name}`} onClick={() => downloadBlob(file.name, dataUrlToBlob(file.dataUrl))}><Download size={15} /></IconBtn>
                <IconBtn label={`Share ${file.name}`} onClick={() => void share(file)}><Share2 size={15} /></IconBtn>
                {!readOnly ? (
                  <>
                    <IconBtn label={`Replace ${file.name}`} onClick={() => beginReplace({ index })}><RefreshCw size={15} /></IconBtn>
                    <IconBtn label={`Remove ${file.name}`} onClick={() => onStagedChange(staged.filter((_, i) => i !== index))}><Trash2 size={15} /></IconBtn>
                  </>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <Sheet
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.name ?? 'Attachment'}
        subtitle={preview ? `${typeText(preview.mime, preview.name)} · ${sizeText(dataUrlToBlob(preview.dataUrl).size)}` : undefined}
        footer={preview ? (
          <>
            <Btn variant="soft" onClick={() => open(preview)}>Open</Btn>
            <Btn variant="soft" icon={<Download size={15} />} onClick={() => downloadBlob(preview.name, dataUrlToBlob(preview.dataUrl))}>Download</Btn>
            <Btn icon={<Share2 size={15} />} onClick={() => void share(preview)}>Share</Btn>
          </>
        ) : undefined}
      >
        {preview?.mime.startsWith('image/') ? (
          <div className="attachment-preview"><img src={preview.dataUrl} alt={preview.name} /></div>
        ) : preview?.mime.includes('pdf') ? (
          <div className="attachment-pdf-preview"><PdfViewer dataUrl={preview.dataUrl} name={preview.name} /></div>
        ) : (
          <div className="attachment-preview attachment-preview--file">
            <FileText size={34} />
            <p className="small">This document opens in your device’s document viewer.</p>
            <Btn size="sm" variant="soft" icon={<Eye size={15} />} onClick={() => preview && open(preview)}>Open document</Btn>
          </div>
        )}
      </Sheet>
    </div>
  );
}
