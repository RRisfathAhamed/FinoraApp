import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  Download,
  FileText,
  Link2,
  Printer,
  RotateCw,
  Share2,
  Star,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';
import type { AppState, DocCategory, DocLink, VaultDoc } from '../lib/types';
import { useApp, navigate, goBack } from '../lib/hooks';
import { formatDate } from '../lib/calc';
import {
  type FilePayload,
  dataUrlToBlob,
  downloadBlob,
  extFor,
  readDocument,
  shareOrDownload,
} from '../lib/files';
import { PdfViewer } from '../components/PdfViewer';
import { actions, DOC_CATEGORIES } from '../lib/store';
import { toast } from '../lib/toast';
import {
  Btn,
  Card,
  Confirm,
  Empty,
  Field,
  IconBtn,
  Input,
  Screen,
  Select,
  Sheet,
  Textarea,
} from '../components/ui';

function sizeText(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function docLabel(category: DocCategory): string {
  return DOC_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

function describeLink(state: AppState, link: DocLink): string {
  switch (link.type) {
    case 'account':
      return state.accounts.find((a) => a.id === link.id)?.name ?? 'Account';
    case 'txn': {
      const txn = state.transactions.find((t) => t.id === link.id);
      return txn ? `${formatDate(txn.date)} · ${txn.merchant ?? txn.category ?? 'Transaction'}` : 'Transaction';
    }
    case 'loan':
      return state.loans.find((l) => l.id === link.id)?.name ?? 'Loan';
    case 'salary': {
      const record = state.salaryRecords.find((r) => r.id === link.id);
      const job = state.jobs.find((j) => j.id === record?.jobId);
      return job ? `${job.company} · ${record?.periodKey}` : 'Salary record';
    }
    case 'salary-payment': {
      const record = state.salaryRecords.find((r) => r.payments.some((p) => p.id === link.id));
      const payment = record?.payments.find((p) => p.id === link.id);
      const job = state.jobs.find((j) => j.id === record?.jobId);
      return payment ? `Salary payment · ${job?.company ?? ''} · ${formatDate(payment.date)}` : 'Salary payment';
    }
    case 'bill':
      return state.bills.find((b) => b.id === link.id)?.name ?? 'Bill';
    case 'bill-payment': {
      const payment = state.billPayments.find((p) => p.id === link.id);
      const bill = state.bills.find((b) => b.id === payment?.billId);
      return payment ? `${bill?.name ?? 'Bill'} · ${formatDate(payment.date)}` : 'Bill payment';
    }
    case 'goal':
      return state.goals.find((g) => g.id === link.id)?.name ?? 'Savings goal';
    case 'contribution': {
      const goal = state.goals.find((g) => g.contributions.some((c) => c.id === link.id));
      const contribution = goal?.contributions.find((c) => c.id === link.id);
      return contribution ? `${goal?.name ?? 'Savings'} · ${formatDate(contribution.date)}` : 'Savings contribution';
    }
    case 'investment':
      return state.investments.find((i) => i.id === link.id)?.name ?? 'Investment';
    case 'emi': {
      const payment = state.emiPayments.find((p) => p.id === link.id);
      const loan = state.loans.find((l) => l.id === payment?.loanId);
      return payment ? `${loan?.name ?? 'Loan'} · ${formatDate(payment.date)}` : 'Loan payment';
    }
    default:
      return 'Record';
  }
}

function linkHref(state: AppState, link: DocLink): string | null {
  switch (link.type) {
    case 'account': return `/money/account/${link.id}`;
    case 'txn': return `/money/txn/${link.id}`;
    case 'loan': return `/loans/${link.id}`;
    case 'emi': {
      const payment = state.emiPayments.find((p) => p.id === link.id);
      return payment ? `/loans/${payment.loanId}` : null;
    }
    case 'salary': {
      const record = state.salaryRecords.find((r) => r.id === link.id);
      return record ? `/salary/record/${record.jobId}/${encodeURIComponent(record.periodKey)}` : null;
    }
    case 'salary-payment': {
      const record = state.salaryRecords.find((r) => r.payments.some((p) => p.id === link.id));
      return record ? `/salary/record/${record.jobId}/${encodeURIComponent(record.periodKey)}` : null;
    }
    case 'bill': return '/bills';
    case 'bill-payment': return '/bills';
    case 'goal': return '/savings';
    case 'contribution': return '/savings';
    case 'investment': return '/investments';
    default: return null;
  }
}

type DocumentCollection = 'income' | 'expense' | 'transfer' | 'salary' | 'loan' | 'gold' | 'credit-card' | 'bill' | 'savings' | 'other';

function collectionFor(state: AppState, doc: VaultDoc): DocumentCollection {
  for (const link of doc.links) {
    if (link.type === 'txn') {
      const txn = state.transactions.find((t) => t.id === link.id);
      if (!txn) continue;
      if (/credit card/i.test(`${txn.category ?? ''} ${txn.merchant ?? ''}`)) return 'credit-card';
      return txn.kind === 'transfer' ? 'transfer' : txn.kind;
    }
    if (link.type === 'salary' || link.type === 'salary-payment') return 'salary';
    if (link.type === 'loan') {
      return state.loans.find((l) => l.id === link.id)?.category === 'gold' ? 'gold' : 'loan';
    }
    if (link.type === 'emi') {
      const payment = state.emiPayments.find((p) => p.id === link.id);
      const loan = state.loans.find((l) => l.id === payment?.loanId);
      return loan?.category === 'gold' ? 'gold' : 'loan';
    }
    if (link.type === 'bill' || link.type === 'bill-payment') {
      const payment = link.type === 'bill-payment' ? state.billPayments.find((p) => p.id === link.id) : undefined;
      const bill = state.bills.find((b) => b.id === (link.type === 'bill' ? link.id : payment?.billId));
      return /credit card/i.test(`${bill?.name ?? ''} ${bill?.category ?? ''}`) ? 'credit-card' : 'bill';
    }
    if (link.type === 'goal' || link.type === 'contribution') return 'savings';
  }
  return 'other';
}

const COLLECTIONS: { value: 'all' | DocumentCollection; label: string }[] = [
  { value: 'all', label: 'All records' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expenses' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'salary', label: 'Salary' },
  { value: 'loan', label: 'Loans' },
  { value: 'gold', label: 'Gold pawning' },
  { value: 'credit-card', label: 'Credit cards' },
  { value: 'bill', label: 'Bills' },
  { value: 'savings', label: 'Savings' },
  { value: 'other', label: 'Other' },
];

function linkOptions(state: AppState, type: DocLink['type']): { id: string; label: string }[] {
  switch (type) {
    case 'account':
      return state.accounts.map((a) => ({ id: a.id, label: `${a.name} · ${a.currency}` }));
    case 'txn':
      return [...state.transactions]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 80)
        .map((t) => ({ id: t.id, label: `${t.date} · ${t.merchant ?? t.category ?? t.kind} · ${t.currency}` }));
    case 'loan':
      return state.loans.map((l) => ({ id: l.id, label: `${l.name} · ${l.lender}` }));
    case 'salary':
      return state.salaryRecords.map((r) => {
        const job = state.jobs.find((j) => j.id === r.jobId);
        return { id: r.id, label: `${job?.company ?? 'Job'} · ${r.periodKey}` };
      });
    case 'salary-payment':
      return state.salaryRecords.flatMap((record) => {
        const job = state.jobs.find((j) => j.id === record.jobId);
        return record.payments.map((payment) => ({
          id: payment.id,
          label: `${job?.company ?? 'Job'} · payment ${formatDate(payment.date)}`,
        }));
      });
    case 'bill-payment':
      return state.billPayments.map((payment) => ({
        id: payment.id,
        label: `${state.bills.find((b) => b.id === payment.billId)?.name ?? 'Bill'} · ${formatDate(payment.date)}`,
      }));
    case 'contribution':
      return state.goals.flatMap((goal) =>
        goal.contributions.map((contribution) => ({
          id: contribution.id,
          label: `${goal.name} · ${formatDate(contribution.date)}`,
        })),
      );
    case 'emi':
      return state.emiPayments.map((payment) => ({
        id: payment.id,
        label: `${state.loans.find((l) => l.id === payment.loanId)?.name ?? 'Loan'} · ${formatDate(payment.date)}`,
      }));
    case 'bill':
      return state.bills.map((b) => ({ id: b.id, label: b.name }));
    case 'goal':
      return state.goals.map((g) => ({ id: g.id, label: g.name }));
    case 'investment':
      return state.investments.map((i) => ({ id: i.id, label: i.name }));
    default:
      return [];
  }
}

export function VaultScreen() {
  const state = useApp();
  const [category, setCategory] = useState<'all' | DocCategory>('all');
  const [collection, setCollection] = useState<'all' | DocumentCollection>('all');
  const [fileKind, setFileKind] = useState<'all' | 'pdf' | 'image' | 'document' | 'favorite'>('all');
  const [term, setTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [file, setFile] = useState<FilePayload | null>(null);
  const [name, setName] = useState('');
  const [docCategory, setDocCategory] = useState<DocCategory>('other');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const docs = state.documents.filter((doc) => {
    if (category !== 'all' && doc.category !== category) return false;
    if (collection !== 'all' && collectionFor(state, doc) !== collection) return false;
    if (fromDate && doc.createdAt.slice(0, 10) < fromDate) return false;
    if (toDate && doc.createdAt.slice(0, 10) > toDate) return false;
    if (fileKind === 'pdf' && !doc.mime.includes('pdf')) return false;
    if (fileKind === 'image' && !doc.mime.startsWith('image/')) return false;
    if (fileKind === 'document' && (doc.mime.startsWith('image/') || doc.mime.includes('pdf'))) return false;
    if (fileKind === 'favorite' && !doc.favorite) return false;
    if (!term.trim()) return true;
    const needle = term.trim().toLowerCase();
    return [doc.name, doc.notes ?? '', ...doc.links.map((link) => describeLink(state, link))]
      .some((value) => value.toLowerCase().includes(needle));
  });
  const totalSize = state.documents.reduce((t, d) => t + d.size, 0);

  const pickFile = async (picked: File | undefined) => {
    if (!picked) return;
    setError('');
    setReading(true);
    try {
      const payload = await readDocument(picked);
      setFile(payload);
      setName(payload.name);
      setSheetOpen(true);
    } catch (err) {
      setError((err as Error).message);
      toast((err as Error).message, 'error');
    } finally {
      setReading(false);
    }
  };

  const save = () => {
    setError('');
    if (!file) { setError('Choose a file first.'); return; }
    setSaving(true);
    try {
      actions.document.add({
        name: name.trim() || file.name,
        mime: file.mime,
        size: file.size,
        dataUrl: file.dataUrl,
        category: docCategory,
        links: [],
        notes: notes.trim() || undefined,
      });
      toast('Document saved to Vault');
      setSheetOpen(false);
      setFile(null);
      setName('');
      setNotes('');
      setDocCategory('other');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title="Vault"
      subtitle={`${state.documents.length} ${state.documents.length === 1 ? 'document' : 'documents'} · ${sizeText(totalSize)}`}
      back
      actions={
        <label className="icon-btn" aria-label="Upload document" style={{ cursor: 'pointer' }}>
          {reading ? <span className="spin"><Upload size={19} /></span> : <Upload size={19} />}
          <input
            type="file"
            accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
            hidden
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      }
    >
      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <Field label="Search documents">
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="File name, transaction, category or notes" inputMode="search" />
      </Field>

      <div className="row">
        <Field label="Added from">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="Added to">
          <Input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
        </Field>
      </div>

      <div className="chip-row">
        {COLLECTIONS.map((item) => (
          <button
            key={item.value}
            className={`chip ${collection === item.value ? 'chip--active' : ''}`}
            onClick={() => setCollection(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="chip-row">
        <button className={`chip ${fileKind === 'all' ? 'chip--active' : ''}`} onClick={() => setFileKind('all')}>All files</button>
        <button className={`chip ${fileKind === 'pdf' ? 'chip--active' : ''}`} onClick={() => setFileKind('pdf')}>PDF</button>
        <button className={`chip ${fileKind === 'image' ? 'chip--active' : ''}`} onClick={() => setFileKind('image')}>Images</button>
        <button className={`chip ${fileKind === 'document' ? 'chip--active' : ''}`} onClick={() => setFileKind('document')}>Documents</button>
        <button className={`chip ${fileKind === 'favorite' ? 'chip--active' : ''}`} onClick={() => setFileKind('favorite')}>★ Favourites</button>
      </div>

      <div className="chip-row">
        <button className={`chip ${category === 'all' ? 'chip--active' : ''}`} onClick={() => setCategory('all')}>All categories</button>
        {DOC_CATEGORIES.map((c) => (
          <button
            key={c.value}
            className={`chip ${category === c.value ? 'chip--active' : ''}`}
            onClick={() => setCategory(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {docs.length ? (
        <div className="doc-grid">
          {docs.map((doc) => (
            <button key={doc.id} className="doc-card" onClick={() => navigate(`/vault/${doc.id}`)}>
              <span className="doc-thumb">
                {doc.mime.startsWith('image/') ? (
                  <img src={doc.dataUrl} alt="" loading="lazy" />
                ) : (
                  <FileText size={30} />
                )}
              </span>
              <span className="doc-body">
                <span className="doc-name">{doc.favorite ? <Star size={13} fill="currentColor" /> : null} {doc.name}</span>
                <span className="tiny muted">{docLabel(doc.category)} · {sizeText(doc.size)} · {doc.mime.includes('pdf') ? 'PDF' : doc.mime.startsWith('image/') ? 'Image' : 'Document'}</span>
                {doc.links.length ? <span className="tiny muted">{COLLECTIONS.find((item) => item.value === collectionFor(state, doc))?.label} · {doc.links.length} linked record{doc.links.length > 1 ? 's' : ''}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Card>
          <Empty
            icon={<FileText size={22} />}
            title={state.documents.length ? 'No matching documents' : 'Your vault is empty'}
            body="Store bank statements, loan agreements, payslips and receipts. Files are kept on this device and included in your backup."
          />
          <label className="btn btn--primary btn--block" style={{ display: 'inline-flex' }}>
            Upload a document
            <input
              type="file"
              accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
              hidden
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </Card>
      )}

      <div className="form-note">
        <strong>Secure sharing:</strong> files never get a permanent public URL. Finora has no server to host expiring links in this local-first build, so sharing uses your device’s share sheet and downloaded copies cannot be recalled. Files are included as real bytes in encrypted-at-rest device storage and in ZIP backups.
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Save to Vault"
        subtitle={file ? `${file.name} · ${sizeText(file.size)}` : undefined}
        footer={
          <>
            <Btn variant="soft" onClick={() => setSheetOpen(false)} disabled={saving}>Cancel</Btn>
            <Btn onClick={save} loading={saving}>Save document</Btn>
          </>
        }
      >
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        {file?.mime.startsWith('image/') ? (
          <img src={file.dataUrl} alt="Preview" style={{ maxHeight: 180, objectFit: 'contain', borderRadius: 12, background: 'var(--surface-2)' }} />
        ) : (
          <div className="banner banner--muted"><FileText size={16} /> {file?.mime.includes('pdf') ? 'PDF' : 'Document'} selected — {sizeText(file?.size ?? 0)}</div>
        )}
        <Field label="Document name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Category">
          <Select value={docCategory} onChange={(e) => setDocCategory(e.target.value as DocCategory)}>
            {DOC_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
        <p className="tiny muted">Maximum 12 MB per file. PDF, JPG, PNG, WEBP, HEIC, DOCX and XLSX are accepted. Office documents keep their original bytes and open in your device’s document viewer.</p>
      </Sheet>
    </Screen>
  );
}

export function DocumentViewer({ docId }: { docId: string }) {
  const state = useApp();
  const doc = state.documents.find((d) => d.id === docId);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [metaOpen, setMetaOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rename, setRename] = useState(doc?.name ?? '');
  const [notes, setNotes] = useState(doc?.notes ?? '');
  const [linkType, setLinkType] = useState<DocLink['type']>('loan');
  const [linkId, setLinkId] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  useEffect(() => {
    setRename(doc?.name ?? '');
    setNotes(doc?.notes ?? '');
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setImageFailed(false);
  }, [doc?.id]);

  if (!doc) {
    return (
      <Screen title="Document" back>
        <Empty title="Document not found" body="It may have been deleted." />
      </Screen>
    );
  }

  const isImage = doc.mime.startsWith('image/');
  const isPdf = doc.mime.includes('pdf');
  const clampScale = (value: number) => Math.min(5, Math.max(1, value));

  const blob = () => dataUrlToBlob(doc.dataUrl);

  const download = () => {
    downloadBlob(doc.name, blob());
    toast('Preparing download…');
  };

  const exportDocument = () => {
    const base = doc.name.replace(/\.[^.]+$/, '') || 'finora-document';
    const filename = `${base}.${extFor(doc.mime)}`;
    downloadBlob(filename, blob());
    toast(`Exporting ${filename}`);
  };

  const openDocument = () => {
    const url = URL.createObjectURL(blob());
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      URL.revokeObjectURL(url);
      downloadBlob(doc.name, blob());
      toast('Opening was blocked — the file has been downloaded instead.', 'error');
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const share = async () => {
    try {
      const result = await shareOrDownload(doc.name, blob());
      toast(result === 'shared' ? 'Shared' : 'Downloaded — share from your files app');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast((error as Error).message, 'error');
    }
  };

  const print = () => {
    if (isImage) {
      const win = window.open('', '_blank');
      if (!win) { toast('Allow pop-ups to print this document.', 'error'); return; }
      win.document.write(`<title>${doc.name}</title><img src="${doc.dataUrl}" style="max-width:100%" onload="window.print()" />`);
      win.document.close();
      return;
    }
    const url = URL.createObjectURL(blob());
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      URL.revokeObjectURL(url);
      downloadBlob(doc.name, blob());
      toast('Printing was blocked — download the PDF and print it from your files app.', 'error');
      return;
    }
    window.setTimeout(() => {
      try { win.print(); } catch { toast('Use the PDF viewer’s print button.', 'error'); }
    }, 1200);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void viewerRef.current?.requestFullscreen?.();
  };

  const options = linkOptions(state, linkType);

  return (
    <div className="fullform" style={{ background: 'var(--bg)' }}>
      <header className="fullform__head">
        <IconBtn label="Back to vault" onClick={() => goBack('/vault')}>
          <ChevronLeft size={22} />
        </IconBtn>
        <div className="fullform__title-wrap">
          <h1 className="fullform__title">{doc.name}</h1>
          <p className="fullform__sub">{docLabel(doc.category)} · {sizeText(doc.size)}</p>
        </div>
        <div className="hstack">
          <IconBtn label={doc.favorite ? 'Remove from favourites' : 'Add to favourites'} onClick={() => actions.document.update(doc.id, { favorite: !doc.favorite })}>
            <Star size={19} fill={doc.favorite ? 'currentColor' : 'none'} />
          </IconBtn>
          <IconBtn label="Document details" onClick={() => setMetaOpen(true)}>
            <Link2 size={19} />
          </IconBtn>
        </div>
      </header>

      {doc.links.length ? (
        <div className="chip-row viewer-links">
          {doc.links.map((link) => {
            const href = linkHref(state, link);
            return (
              <button
                key={`${link.type}:${link.id}`}
                className="chip"
                disabled={!href}
                onClick={() => href && navigate(href)}
              >
                Open {describeLink(state, link)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        ref={viewerRef}
        className={`viewer${!isImage && isPdf ? ' viewer--pdf' : ''}`}
        onPointerDown={(e) => {
          if (!isImage) return;
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setOffset({
            x: drag.current.ox + (e.clientX - drag.current.x),
            y: drag.current.oy + (e.clientY - drag.current.y),
          });
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onDoubleClick={() => {
          setScale((s) => (s > 1 ? 1 : 2));
          setOffset({ x: 0, y: 0 });
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const distance = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY,
            );
            pinch.current = { distance, scale };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinch.current) {
            const distance = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY,
            );
            setScale(clampScale((pinch.current.scale * distance) / pinch.current.distance));
          }
        }}
        onTouchEnd={() => { pinch.current = null; }}
        onWheel={(e) => {
          if (!isImage) return;
          setScale((s) => clampScale(s - e.deltaY * 0.002));
        }}
      >
        {isImage ? (
          imageFailed ? (
            <div className="viewer__fallback">
              <FileText size={34} />
              <p className="small">This image could not be displayed by the browser.</p>
              <Btn size="sm" variant="soft" onClick={download}>Download image</Btn>
            </div>
          ) : (
            <img
              src={doc.dataUrl}
              alt={doc.name}
              draggable={false}
              onError={() => setImageFailed(true)}
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)` }}
            />
          )
        ) : isPdf ? (
          <PdfViewer dataUrl={doc.dataUrl} name={doc.name} />
        ) : (
          <div className="viewer__fallback">
            <FileText size={36} />
            <p className="small">This file type opens in your device’s document viewer.</p>
            <p className="tiny muted">{doc.mime} · {sizeText(doc.size)}</p>
            <div className="btn-row">
              <Btn size="sm" variant="soft" onClick={openDocument}>Open</Btn>
              <Btn size="sm" variant="soft" onClick={download}>Download</Btn>
            </div>
          </div>
        )}
      </div>

      {isPdf ? (
        <p className="viewport-note">Rendered on this device · use the toolbar for pages and zoom · download to keep the original</p>
      ) : isImage ? (
        <p className="viewport-note">Pinch or scroll to zoom · drag to pan · double-tap to fit</p>
      ) : (
        <p className="viewport-note">Office documents are preserved exactly and open with your device’s document app.</p>
      )}

      <div className="viewer__tools">
        {isImage ? (
          <>
            <Btn size="sm" variant="soft" icon={<ZoomOut size={16} />} onClick={() => setScale((s) => clampScale(s - 0.5))}>Zoom out</Btn>
            <Btn size="sm" variant="soft" icon={<ZoomIn size={16} />} onClick={() => setScale((s) => clampScale(s + 0.5))}>Zoom in</Btn>
            <Btn size="sm" variant="soft" onClick={() => { setScale(1); setRotation(0); setOffset({ x: 0, y: 0 }); }}>Fit</Btn>
            <Btn size="sm" variant="soft" icon={<RotateCw size={16} />} onClick={() => setRotation((r) => (r + 90) % 360)}>Rotate</Btn>
          </>
        ) : null}
        <Btn size="sm" variant="soft" onClick={openDocument}>Open</Btn>
        <Btn size="sm" variant="soft" icon={<Download size={16} />} onClick={download}>Download</Btn>
        <Btn size="sm" variant="soft" icon={<Share2 size={16} />} onClick={() => void share()}>Share</Btn>
        {isImage || isPdf ? <Btn size="sm" variant="soft" icon={<Printer size={16} />} onClick={print}>Print</Btn> : null}
        <Btn size="sm" variant="soft" onClick={exportDocument}>Export</Btn>
        <Btn size="sm" variant="soft" onClick={toggleFullscreen}>Full screen</Btn>
      </div>

      <Sheet
        open={metaOpen}
        onClose={() => setMetaOpen(false)}
        title="Document details"
        subtitle={doc.name}
        footer={<Btn variant="soft" onClick={() => setMetaOpen(false)}>Done</Btn>}
      >
        <Field label="Name"><Input value={rename} onChange={(e) => setRename(e.target.value)} /></Field>
        <Field label="Category">
          <Select value={doc.category} onChange={(e) => actions.document.update(doc.id, { category: e.target.value as DocCategory })}>
            {DOC_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
        <Btn
          variant="soft"
          size="sm"
          onClick={() => {
            actions.document.update(doc.id, {
              name: rename.trim() || doc.name,
              notes: notes.trim() || undefined,
            });
            toast('Document details saved');
          }}
        >
          Save details
        </Btn>

        <div className="form-section">
          <p className="form-section__title">Linked records</p>
          {doc.links.length ? (
            <div className="hstack wrap">
              {doc.links.map((link) => {
                const href = linkHref(state, link);
                return (
                  <span key={`${link.type}:${link.id}`} className="chip">
                    <button
                      className="chip__link"
                      disabled={!href}
                      onClick={() => href && navigate(href)}
                    >
                      {describeLink(state, link)}
                    </button>
                    <button
                      aria-label="Unlink record"
                      style={{ marginLeft: 6, border: 0, background: 'none', color: 'inherit', padding: 0 }}
                      onClick={() => actions.documents.unlink(doc.id, link)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="tiny muted">Link this document to the loan, salary period or transaction it belongs to.</p>
          )}
          <Field label="Record type">
            <Select value={linkType} onChange={(e) => { setLinkType(e.target.value as DocLink['type']); setLinkId(''); }}>
              <option value="loan">Loan</option>
              <option value="emi">Loan payment</option>
              <option value="txn">Transaction</option>
              <option value="account">Account</option>
              <option value="salary">Salary record</option>
              <option value="salary-payment">Salary payment</option>
              <option value="bill">Bill</option>
              <option value="bill-payment">Bill payment</option>
              <option value="goal">Savings goal</option>
              <option value="contribution">Savings contribution</option>
              <option value="investment">Investment</option>
            </Select>
          </Field>
          <Field label="Record">
            <Select value={linkId} onChange={(e) => setLinkId(e.target.value)}>
              <option value="">Select record</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </Field>
          <Btn
            variant="soft"
            size="sm"
            disabled={!linkId}
            onClick={() => {
              actions.documents.linkTo(doc.id, { type: linkType, id: linkId });
              setLinkId('');
              toast('Record linked');
            }}
          >
            Link record
          </Btn>
        </div>

        <div className="form-section">
          <p className="form-section__title">File information</p>
          <div className="meta-grid">
            <div className="meta-box"><p className="meta-box__label">Type</p><p className="meta-box__value">{doc.mime}</p></div>
            <div className="meta-box"><p className="meta-box__label">Size</p><p className="meta-box__value">{sizeText(doc.size)}</p></div>
            <div className="meta-box"><p className="meta-box__label">Added</p><p className="meta-box__value">{formatDate(doc.createdAt.slice(0, 10))}</p></div>
            <div className="meta-box"><p className="meta-box__label">Storage</p><p className="meta-box__value">On device</p></div>
          </div>
        </div>

        <div className="form-note">
          Sharing uses your device share sheet. Finora cannot revoke a file once someone has downloaded it.
        </div>

        <Btn variant="ghost" icon={<Trash2 size={16} />} onClick={() => setDeleteOpen(true)}>Delete document</Btn>
      </Sheet>

      <Confirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete document?"
        message="This permanently removes the file from your vault and from future backups. Links to financial records are removed."
        confirmLabel="Delete"
        onConfirm={() => {
          actions.document.remove(doc.id);
          setDeleteOpen(false);
          setMetaOpen(false);
          toast('Document deleted');
          goBack('/vault');
        }}
      />
    </div>
  );
}

