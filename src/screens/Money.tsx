import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronRight,
  Copy,
  Download,
  Landmark,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  Archive,
  Image as ImageIcon,
} from 'lucide-react';
import type { Account, TxnKind } from '../lib/types';
import { useApp, navigate, useRoute, goBack } from '../lib/hooks';
import {
  accountBalances,
  formatDate,
  todayISO,
} from '../lib/calc';
import { linkedDocuments as linkedDocs } from '../lib/select';
import { formatMoney } from '../lib/money';
import { actions } from '../lib/store';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/categories';
import { dataUrlToBlob, downloadBlob, extFor, type FilePayload } from '../lib/files';
import { ImageCropper } from '../components/ImageCropper';
import { toast } from '../lib/toast';
import {
  Btn,
  Card,
  Confirm,
  CurrencySelect,
  Empty,
  Field,
  FullForm,
  IconBtn,
  Input,
  MoneyField,
  MoneyInput,
  Screen,
  Segmented,
  Select,
  Sheet,
  Textarea,
} from '../components/ui';
import {
  accountCardBlob,
  accountCardFilename,
  accountShareText,
} from '../lib/share';
import { shareOrCopyText, shareOrDownload } from '../lib/files';
import { AccountIcon, Money, TxnRow, accountGradient } from '../components/bits';
import { commitRecordAttachments, RecordAttachments } from '../components/RecordAttachments';
import { AccountCarousel } from '../components/AccountCarousel';

const CARD_COLORS = [
  'linear-gradient(135deg,#0e9f78,#0b7d78)',
  'linear-gradient(135deg,#3b6fd4,#274a94)',
  'linear-gradient(135deg,#8a5cd6,#5b3b96)',
  'linear-gradient(135deg,#c07a2e,#8e531d)',
  'linear-gradient(135deg,#2b8fa8,#1a6376)',
  'linear-gradient(135deg,#b94a74,#8a2f52)',
];

const ACCOUNT_KINDS: { value: Account['kind']; label: string }[] = [
  { value: 'bank', label: 'Bank account' },
  { value: 'cash', label: 'Cash' },
  { value: 'wallet', label: 'Digital wallet' },
  { value: 'credit', label: 'Credit card' },
  { value: 'other', label: 'Other' },
];

export function MoneyScreen() {
  const state = useApp();
  const [tab, setTab] = useState<'accounts' | 'transactions' | 'transfers'>('accounts');
  const [kindFilter, setKindFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const hide = state.settings.hideBalances;
  const balances = useMemo(() => accountBalances(state), [state]);
  const active = state.accounts.filter((a) => !a.archived);
  const archived = state.accounts.filter((a) => a.archived);
  const txns = [...state.transactions]
    .filter((t) => t.kind !== 'transfer')
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const filtered = kindFilter === 'all' ? txns : txns.filter((t) => t.kind === kindFilter);
  const transfers = state.transactions
    .filter((t) => t.kind === 'transfer')
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Screen
      title="Money"
      subtitle={`${active.length} active accounts · ${state.transactions.length} movements`}
      actions={
        <>
          <IconBtn label="Search transactions" onClick={() => navigate('/search')}>
            <Search size={19} />
          </IconBtn>
          <IconBtn label="Add transaction" onClick={() => navigate('/money/new?kind=expense')}>
            <Plus size={20} />
          </IconBtn>
        </>
      }
    >
      <Segmented
        ariaLabel="Money sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'accounts', label: 'Accounts' },
          { value: 'transactions', label: 'Transactions' },
          { value: 'transfers', label: 'Transfers' },
        ]}
      />

      {tab === 'accounts' ? (
        <>
          {active.length ? (
            <AccountCarousel
              accounts={active}
              balances={balances}
              hide={hide}
              onAdd={() => navigate('/money/account/new')}
            />
          ) : null}

          {active.length ? (
            <Card className="card--flush">
              {active.map((account) => (
                <button
                  key={account.id}
                  className="list-row"
                  onClick={() => navigate(`/money/account/${account.id}`)}
                >
                  <span className="list-row__icon"><AccountIcon kind={account.kind} /></span>
                  <span className="list-row__text">
                    <span className="list-row__title">{account.name}</span>
                    <span className="list-row__sub">
                      {account.bankName ? `${account.bankName} · ` : ''}
                      {account.kind} · {account.currency}
                      {account.identifier ? ` · •••• ${account.identifier.slice(-4)}` : ''}
                    </span>
                  </span>
                  <span className="list-row__trail">
                    <Money amount={balances.get(account.id) ?? 0} currency={account.currency} hide={hide} />
                    <ChevronRight size={17} className="muted" />
                  </span>
                </button>
              ))}
            </Card>
          ) : (
            <Card>
              <Empty
                icon={<Landmark size={22} />}
                title="No accounts yet"
                body="Add a bank account, cash wallet or card to start tracking balances."
                action={<Btn onClick={() => navigate('/money/account/new')}>Add your first account</Btn>}
              />
            </Card>
          )}

          {archived.length ? (
            <div>
              <button className="link-btn" onClick={() => setShowArchived((v) => !v)}>
                <Archive size={14} /> Archived accounts ({archived.length})
              </button>
              {showArchived ? (
                <Card className="card--flush">
                  {archived.map((account) => (
                    <button
                      key={account.id}
                      className="list-row"
                      onClick={() => navigate(`/money/account/${account.id}`)}
                    >
                      <span className="list-row__icon"><Archive size={17} /></span>
                      <span className="list-row__text">
                        <span className="list-row__title">{account.name}</span>
                        <span className="list-row__sub">Archived · {account.currency}</span>
                      </span>
                      <span className="list-row__trail">
                        <Money amount={balances.get(account.id) ?? 0} currency={account.currency} hide={hide} />
                      </span>
                    </button>
                  ))}
                </Card>
              ) : null}
            </div>
          ) : null}

          <div className="btn-row">
            <Btn variant="soft" onClick={() => navigate('/money/new?kind=transfer')} icon={<ArrowLeftRight size={17} />}>
              Transfer
            </Btn>
            <Btn variant="soft" onClick={() => navigate('/money/new?kind=income')} icon={<Plus size={17} />}>
              Add income
            </Btn>
          </div>
        </>
      ) : tab === 'transactions' ? (
        <>
          <div className="chip-row">
            {(['all', 'income', 'expense'] as const).map((value) => (
              <button
                key={value}
                className={`chip ${kindFilter === value ? 'chip--active' : ''}`}
                onClick={() => setKindFilter(value)}
              >
                {value === 'all' ? 'All activity' : value === 'income' ? 'Income' : 'Expenses'}
              </button>
            ))}
          </div>
          <Card className="card--flush">
            {filtered.length ? (
              filtered.slice(0, 30).map((txn) => (
                <TxnRow key={txn.id} txn={txn} hide={hide} onClick={() => navigate(`/money/txn/${txn.id}`)} />
              ))
            ) : (
              <Empty
                icon={<Plus size={20} />}
                title="No transactions here yet"
                body="Record income or an expense to build your history."
                action={<Btn size="sm" variant="soft" onClick={() => navigate('/money/new?kind=expense')}>Add expense</Btn>}
              />
            )}
          </Card>
          {filtered.length > 30 ? (
            <Btn variant="soft" block onClick={() => navigate('/history')}>View all {filtered.length} transactions</Btn>
          ) : null}
        </>
      ) : (
        <Card className="card--flush">
          {transfers.length ? (
            transfers.slice(0, 40).map((txn) => {
              const from = state.accounts.find((a) => a.id === txn.accountId);
              const to = state.accounts.find((a) => a.id === txn.toAccountId);
              return (
                <button key={txn.id} className="list-row" onClick={() => navigate(`/money/txn/${txn.id}`)}>
                  <span className="list-row__icon"><ArrowLeftRight size={17} /></span>
                  <span className="list-row__text">
                    <span className="list-row__title">{from?.name ?? 'Account'} → {to?.name ?? 'Account'}</span>
                    <span className="list-row__sub">{formatDate(txn.date, state.settings.dateFormat)}{txn.notes ? ` · ${txn.notes}` : ''}</span>
                  </span>
                  <span className="list-row__trail">
                    <Money amount={txn.amount} currency={txn.currency} hide={hide} />
                  </span>
                </button>
              );
            })
          ) : (
            <Empty
              icon={<ArrowLeftRight size={20} />}
              title="No transfers yet"
              body="Move money between your own accounts without affecting income or expenses."
              action={<Btn size="sm" variant="soft" onClick={() => navigate('/money/new?kind=transfer')}>Transfer money</Btn>}
            />
          )}
        </Card>
      )}
    </Screen>
  );
}

/* --------------------------------------------------------------- account form */

export function AccountForm({ accountId }: { accountId?: string }) {
  const state = useApp();
  const existing = accountId ? state.accounts.find((a) => a.id === accountId) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [bankName, setBankName] = useState(existing?.bankName ?? '');
  const [branch, setBranch] = useState(existing?.branch ?? '');
  const [kind, setKind] = useState<Account['kind']>(existing?.kind ?? 'bank');
  const [identifier, setIdentifier] = useState(existing?.identifier ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? state.settings.currency);
  const [opening, setOpening] = useState(existing?.openingBalance ?? 0);
  const [color, setColor] = useState(existing?.color ?? CARD_COLORS[0]);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [holderName, setHolderName] = useState(existing?.holderName ?? '');
  const [accountType, setAccountType] = useState(existing?.accountType ?? (existing?.kind === 'other' ? '' : 'savings'));
  const [provider, setProvider] = useState(existing?.provider ?? '');
  const [walletId, setWalletId] = useState(existing?.walletId ?? '');
  const [cardType, setCardType] = useState(existing?.cardType ?? '');
  const [lastFour, setLastFour] = useState(existing?.lastFour ?? (existing?.kind === 'credit' ? existing?.identifier ?? '' : ''));
  const [creditLimit, setCreditLimit] = useState(existing?.creditLimit ?? 0);
  const [availableCredit, setAvailableCredit] = useState(existing?.availableCredit ?? 0);
  const [billingDate, setBillingDate] = useState(existing?.billingDate ?? '');
  const [paymentDueDate, setPaymentDueDate] = useState(existing?.paymentDueDate ?? '');
  const [referenceNumber, setReferenceNumber] = useState(existing?.referenceNumber ?? '');
  const currentBalance = existing ? accountBalances(state).get(existing.id) ?? existing.openingBalance : opening;
  const [image, setImage] = useState<FilePayload | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const hasHistory = Boolean(
    existing &&
      (state.transactions.some((t) => t.accountId === existing.id || t.toAccountId === existing.id) ||
        state.loans.some((l) => l.accountId === existing.id) ||
        state.emiPayments.some((p) => p.accountId === existing.id)),
  );
  const storedImage = existing?.imageId && !removeImage ? state.media[existing.imageId]?.dataUrl : undefined;
  const preview = image?.dataUrl ?? storedImage;

  const [pendingImage, setPendingImage] = useState<File | null>(null);

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    setError('');
    setPendingImage(file);
  };

  const submit = () => {
    setError('');
    const displayName = name.trim() || holderName.trim() || (kind === 'cash' ? 'Cash' : '') || provider.trim();
    if (!displayName) {
      setError('Give this account a name or enter the holder/provider name.');
      return;
    }
    if (kind === 'bank') {
      if (!holderName.trim()) { setError('Account holder name is required.'); return; }
      if (!bankName.trim()) { setError('Bank name is required.'); return; }
      if (!accountType) { setError('Choose savings or current account.'); return; }
      if (!branch.trim()) { setError('Bank branch is required.'); return; }
      if (!identifier.trim()) { setError('Account number is required.'); return; }
    }
    if (kind === 'wallet') {
      if (!holderName.trim()) { setError('Wallet holder name is required.'); return; }
      if (!provider.trim()) { setError('Wallet provider is required.'); return; }
      if (!walletId.trim()) { setError('Wallet ID or mobile number is required.'); return; }
    }
    if (kind === 'credit') {
      if (!holderName.trim()) { setError('Cardholder name is required.'); return; }
      if (!provider.trim()) { setError('Bank or card provider is required.'); return; }
      if (!cardType.trim()) { setError('Choose a card type.'); return; }
      if (!/^\d{4}$/.test(lastFour.trim())) { setError('Enter the last four card digits.'); return; }
      if (creditLimit <= 0) { setError('Enter a credit limit greater than zero.'); return; }
      if (availableCredit < 0 || availableCredit > creditLimit) { setError('Available credit must be between zero and the credit limit.'); return; }
      if (!billingDate) { setError('Billing date is required.'); return; }
      if (!paymentDueDate) { setError('Payment due date is required.'); return; }
    }
    if (kind === 'other') {
      if (!accountType.trim()) { setError('Account type is required.'); return; }
      if (!provider.trim()) { setError('Provider or institution name is required.'); return; }
    }
    setBusy(true);
    try {
      let imageId = removeImage ? undefined : existing?.imageId;
      if (removeImage && existing?.imageId) actions.media.remove(existing.imageId);
      if (image) {
        if (existing?.imageId && !removeImage) actions.media.remove(existing.imageId);
        imageId = actions.media.add({ name: image.name, mime: image.mime, size: image.size, dataUrl: image.dataUrl });
      }
      const payload = {
        name: displayName,
        kind,
        holderName: kind === 'bank' || kind === 'wallet' || kind === 'credit' ? holderName.trim() : undefined,
        bankName: kind === 'bank' ? bankName.trim() : undefined,
        branch: kind === 'bank' ? branch.trim() : undefined,
        accountType: kind === 'bank' || kind === 'other' ? accountType.trim() : undefined,
        provider: kind === 'wallet' || kind === 'credit' || kind === 'other' ? provider.trim() : undefined,
        walletId: kind === 'wallet' ? walletId.trim() : undefined,
        cardType: kind === 'credit' ? cardType.trim() : undefined,
        lastFour: kind === 'credit' ? lastFour.trim() : undefined,
        creditLimit: kind === 'credit' ? creditLimit : undefined,
        availableCredit: kind === 'credit' ? availableCredit : undefined,
        billingDate: kind === 'credit' ? billingDate : undefined,
        paymentDueDate: kind === 'credit' ? paymentDueDate : undefined,
        referenceNumber: kind === 'other' ? referenceNumber.trim() || undefined : undefined,
        identifier: kind === 'bank' ? identifier.trim() : kind === 'wallet' ? walletId.trim() : kind === 'credit' ? lastFour.trim() : undefined,
        currency,
        openingBalance: hasHistory ? existing?.openingBalance ?? 0 : opening,
        color,
        imageId,
        notes: notes.trim() || undefined,
      };
      if (existing) actions.account.update(existing.id, payload);
      else actions.account.add({ ...payload, archived: false });
      toast(existing ? 'Account updated' : 'Account added');
      goBack('/money');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <FullForm
      title={existing ? 'Edit account' : 'New account'}
      subtitle={existing ? existing.name : 'Bank, cash, wallet or card'}
      onClose={() => goBack('/money')}
      footer={
        <>
          <Btn variant="soft" onClick={() => goBack('/money')} disabled={busy}>Cancel</Btn>
          <Btn onClick={submit} loading={busy}>Save account</Btn>
        </>
      }
    >
      <div className="form-stack">
        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <Field label="Account name" hint="Optional nickname used in lists. We will use the holder or provider name if blank.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'bank' ? 'e.g. Salary account' : 'e.g. Daily cash'} autoFocus />
        </Field>

        <Field label="Account category *">
          <Select
            value={kind}
            onChange={(e) => {
              const next = e.target.value as Account['kind'];
              setKind(next);
              if (next === 'bank' && accountType !== 'savings' && accountType !== 'current') setAccountType('savings');
              if (next === 'other' && accountType === 'savings') setAccountType('');
              setError('');
            }}
          >
            {ACCOUNT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </Field>

        {kind === 'bank' ? (
          <>
            <div className="row">
              <Field label="Account holder name *"><Input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Full name" autoComplete="name" /></Field>
              <Field label="Bank name *"><Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Commercial Bank" /></Field>
            </div>
            <div className="row">
              <Field label="Account type *">
                <Select value={accountType || 'savings'} onChange={(e) => setAccountType(e.target.value)}>
                  <option value="savings">Savings account</option>
                  <option value="current">Current account</option>
                </Select>
              </Field>
              <Field label="Bank branch *"><Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. Colombo 03" /></Field>
            </div>
            <Field label="Account number *" hint="Used only when you explicitly share account details.">
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="e.g. 0123456789" inputMode="numeric" autoComplete="off" />
            </Field>
          </>
        ) : null}

        {kind === 'cash' ? (
          <div className="form-note">Cash uses the opening balance plus recorded movements to calculate its current balance. No bank details are needed.</div>
        ) : null}

        {kind === 'wallet' ? (
          <>
            <div className="row">
              <Field label="Wallet holder name *"><Input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Full name" autoComplete="name" /></Field>
              <Field label="Wallet provider *"><Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. PayPal, eZ Cash" /></Field>
            </div>
            <Field label="Wallet ID / mobile number *">
              <Input value={walletId} onChange={(e) => setWalletId(e.target.value)} placeholder="e.g. 0771234567" inputMode="tel" autoComplete="off" />
            </Field>
          </>
        ) : null}

        {kind === 'credit' ? (
          <>
            <div className="row">
              <Field label="Cardholder name *"><Input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Full name" autoComplete="name" /></Field>
              <Field label="Bank / card provider *"><Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. Visa via HNB" /></Field>
            </div>
            <div className="row">
              <Field label="Card type *"><Input value={cardType} onChange={(e) => setCardType(e.target.value)} placeholder="e.g. Visa, Mastercard" /></Field>
              <Field label="Last four digits *"><Input value={lastFour} onChange={(e) => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" inputMode="numeric" maxLength={4} autoComplete="off" /></Field>
            </div>
            <div className="row">
              <MoneyField label="Credit limit *" value={creditLimit} currency={currency} onChange={setCreditLimit} />
              <MoneyField label="Available credit *" value={availableCredit} currency={currency} onChange={setAvailableCredit} />
            </div>
            <div className="row">
              <Field label="Billing date *"><Input type="date" value={billingDate} onChange={(e) => setBillingDate(e.target.value)} /></Field>
              <Field label="Payment due date *"><Input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} /></Field>
            </div>
            <div className="form-note">Never enter a CVV, PIN or full card number. Finora stores only the last four digits and never requests those details.</div>
          </>
        ) : null}

        {kind === 'other' ? (
          <>
            <div className="row">
              <Field label="Account type *"><Input value={accountType} onChange={(e) => setAccountType(e.target.value)} placeholder="e.g. Investment, Receivable" /></Field>
              <Field label="Provider / institution *"><Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. Broker or employer" /></Field>
            </div>
            <Field label="Reference number (optional)"><Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Policy, contract or reference" autoComplete="off" /></Field>
          </>
        ) : null}

        <CurrencySelect value={currency} onChange={setCurrency} disabled={hasHistory} />

        <MoneyField
          label={kind === 'cash' || kind === 'other' ? 'Opening balance' : 'Opening balance / available balance'}
          value={opening}
          currency={currency}
          onChange={setOpening}
          hint={hasHistory ? 'Locked because this account already has movements. Use reconciliation instead.' : 'Money already in this account. Never counted as income.'}
          autoFocus={false}
        />
        <div className="form-note">
          Current calculated balance: <strong>{formatMoney(currentBalance, currency, { hide: state.settings.hideBalances })}</strong>. It updates automatically as you add income, expenses and transfers.
        </div>
        {hasHistory ? <div className="form-note">Opening balance is locked to protect your income reports and net worth. Use <strong>Reconcile</strong> on the account to correct the current balance.</div> : null}

        <div className="field">
          <span className="label">Card colour</span>
          <div className="hstack wrap">
            {CARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label="Choose card colour"
                onClick={() => setColor(c)}
                style={{
                  width: 42,
                  height: 30,
                  borderRadius: 9,
                  background: c,
                  border: color === c ? '2px solid var(--text)' : '1px solid var(--border)',
                }}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Account image</span>
          <div className="upload-box">
            <span className="upload-box__preview">
              {preview ? <img src={preview} alt="Account preview" /> : <ImageIcon size={20} />}
            </span>
            <span className="upload-box__text">
              <span className="upload-box__title">{preview ? 'Image saved with account' : 'Add a logo or photo'}</span>
              <span className="upload-box__sub">JPG, PNG or WEBP up to 6 MB · stored on this device</span>
            </span>
          </div>
          <div className="upload-actions">
            <label className="btn btn--soft btn--sm" style={{ display: 'inline-flex' }}>
              Choose image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  pickImage(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {preview ? (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setImage(null);
                  setRemoveImage(true);
                }}
                type="button"
              >
                Remove image
              </button>
            ) : null}
          </div>
        </div>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>

        {pendingImage ? (
          <ImageCropper
            file={pendingImage}
            title="Account image"
            onCancel={() => setPendingImage(null)}
            onDone={(payload) => {
              setImage(payload);
              setRemoveImage(false);
              setPendingImage(null);
            }}
          />
        ) : null}

        {existing ? (
          <div className="form-section">
            <p className="form-section__title">Account actions</p>
            <Btn variant="soft" onClick={() => setArchiveOpen(true)}>
              {existing.archived ? 'Restore account' : 'Archive account'}
            </Btn>
            <Btn variant="ghost" onClick={() => setDeleteOpen(true)} icon={<Trash2 size={16} />} disabled={hasHistory}>
              Delete account
            </Btn>
            {hasHistory ? <p className="hint">This account has movements and cannot be deleted. Archive it to keep reports intact.</p> : null}
            <p className="hint">Archived accounts are hidden from totals and transfers but keep their history. Deletion is only allowed when no movements exist.</p>
          </div>
        ) : null}
      </div>

      <Confirm
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={existing?.archived ? 'Restore account?' : 'Archive account?'}
        message={
          existing?.archived
            ? 'This account will appear in balances, transfers and totals again.'
            : 'This account will be hidden from totals and can no longer be used for new movements. All history is retained.'
        }
        danger={false}
        confirmLabel={existing?.archived ? 'Restore' : 'Archive'}
        onConfirm={() => {
          if (!existing) return;
          actions.account.setArchived(existing.id, !existing.archived);
          setArchiveOpen(false);
          toast(existing.archived ? 'Account restored' : 'Account archived');
          goBack('/money');
        }}
      />

      <Confirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete account?"
        message="This permanently removes the account and its saved image. Accounts with any transactions must be archived instead."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!existing) return;
          try {
            actions.account.remove(existing.id);
            setDeleteOpen(false);
            toast('Account deleted');
            goBack('/money');
          } catch (error) {
            setDeleteOpen(false);
            toast((error as Error).message, 'error');
          }
        }}
      />
    </FullForm>
  );
}

/* ------------------------------------------------------------- account detail */

export function AccountDetail({ accountId }: { accountId: string }) {
  const state = useApp();
  const account = state.accounts.find((a) => a.id === accountId);
  const balances = useMemo(() => accountBalances(state), [state]);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [actual, setActual] = useState(0);
  const [reconcileDate, setReconcileDate] = useState(todayISO());
  const [reconcileAttachments, setReconcileAttachments] = useState<FilePayload[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [cardPreview, setCardPreview] = useState('');
  const [sharing, setSharing] = useState(false);
  const hide = state.settings.hideBalances;

  if (!account) {
    return (
      <Screen title="Account" back>
        <Empty title="Account not found" body="It may have been deleted." />
      </Screen>
    );
  }

  const balance = balances.get(account.id) ?? 0;
  const accountTxns = state.transactions
    .filter((t) => t.accountId === account.id || t.toAccountId === account.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const docs = linkedDocs(state, 'account', account.id);
  const image = account.imageId ? state.media[account.imageId]?.dataUrl : undefined;
  const hasHistory = accountTxns.length > 0;

  const renderCard = async () => {
    try {
      const blob = await accountCardBlob(account, { logo: image });
      setCardPreview((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const openShare = () => {
    setShareOpen(true);
    void renderCard();
  };

  const shareCard = async () => {
    setSharing(true);
    try {
      const blob = await accountCardBlob(account, { logo: image });
      const outcome = await shareOrDownload(accountCardFilename(account), blob);
      toast(outcome === 'shared' ? 'Account details card shared' : 'Account details card downloaded');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast((error as Error).message, 'error');
    } finally {
      setSharing(false);
    }
  };

  const shareText = async () => {
    try {
      const result = await shareOrCopyText(account.name, accountShareText(account));
      if (result === 'copied') toast('Account details copied');
      if (result === 'failed') toast('Could not share or copy account details', 'error');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast((error as Error).message, 'error');
    }
  };

  return (
    <Screen
      title={account.name}
      subtitle={`${account.kind} · ${account.currency}`}
      back
      actions={
        <IconBtn label="Edit account" onClick={() => navigate(`/money/account/${account.id}/edit`)}>
          <Pencil size={18} />
        </IconBtn>
      }
    >
      <div className="summary" style={{ background: accountGradient(account, 0) }}>
        <div className="summary__top">
          <div>
            <p className="summary__label">Current balance</p>
            <p className="summary__net">{formatMoney(balance, account.currency, { hide })}</p>
          </div>
          {image ? (
            <span className="account-card__logo" style={{ width: 44, height: 44 }}>
              <img src={image} alt="" />
            </span>
          ) : null}
        </div>
        <div className="summary__grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div className="summary__cell">
            <p className="summary__cell-label">Opening balance</p>
            <p className="summary__cell-value">{formatMoney(account.openingBalance, account.currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Movements</p>
            <p className="summary__cell-value">{accountTxns.length}</p>
          </div>
        </div>
        <div className="summary__foot">
          <span>
            {account.bankName || 'No bank set'}
            {account.branch ? ` · ${account.branch}` : ''}
            {account.identifier ? ` · •••• ${account.identifier.slice(-4)}` : ''}
          </span>
          <span>{account.archived ? 'Archived' : 'Active'}</span>
        </div>
      </div>

      {account.notes ? <p className="tiny muted">{account.notes}</p> : null}

      <Card>
        <h2 className="card-title">Account details</h2>
        <div className="meta-grid">
          {account.holderName ? <div className="meta-box"><p className="meta-box__label">Account holder</p><p className="meta-box__value">{account.holderName}</p></div> : null}
          {account.kind === 'bank' ? (
            <>
              <div className="meta-box"><p className="meta-box__label">Bank</p><p className="meta-box__value">{account.bankName ?? '—'}</p></div>
              <div className="meta-box"><p className="meta-box__label">Account type</p><p className="meta-box__value">{account.accountType ? account.accountType[0].toUpperCase() + account.accountType.slice(1) : '—'}</p></div>
              <div className="meta-box"><p className="meta-box__label">Branch</p><p className="meta-box__value">{account.branch ?? '—'}</p></div>
              <div className="meta-box"><p className="meta-box__label">Account number</p><p className="meta-box__value">{account.identifier ? `•••• ${account.identifier.slice(-4)}` : '—'}</p></div>
            </>
          ) : null}
          {account.kind === 'wallet' ? (
            <>
              <div className="meta-box"><p className="meta-box__label">Wallet provider</p><p className="meta-box__value">{account.provider ?? '—'}</p></div>
              <div className="meta-box"><p className="meta-box__label">Wallet ID</p><p className="meta-box__value">{account.walletId ?? account.identifier ?? '—'}</p></div>
            </>
          ) : null}
          {account.kind === 'credit' ? (
            <>
              <div className="meta-box"><p className="meta-box__label">Card provider</p><p className="meta-box__value">{account.provider ?? account.bankName ?? '—'}</p></div>
              <div className="meta-box"><p className="meta-box__label">Card</p><p className="meta-box__value">{account.cardType ?? '—'} •••• {account.lastFour ?? (account.identifier ?? '').slice(-4)}</p></div>
              <div className="meta-box"><p className="meta-box__label">Credit limit</p><p className="meta-box__value">{formatMoney(account.creditLimit ?? 0, account.currency, { hide })}</p></div>
              <div className="meta-box"><p className="meta-box__label">Available credit</p><p className="meta-box__value">{formatMoney(account.availableCredit ?? 0, account.currency, { hide })}</p></div>
              <div className="meta-box"><p className="meta-box__label">Billing date</p><p className="meta-box__value">{account.billingDate ? formatDate(account.billingDate, state.settings.dateFormat) : '—'}</p></div>
              <div className="meta-box"><p className="meta-box__label">Payment due</p><p className="meta-box__value">{account.paymentDueDate ? formatDate(account.paymentDueDate, state.settings.dateFormat) : '—'}</p></div>
            </>
          ) : null}
          {account.kind === 'cash' ? <div className="meta-box"><p className="meta-box__label">Type</p><p className="meta-box__value">Cash</p></div> : null}
          {account.kind === 'other' ? (
            <>
              <div className="meta-box"><p className="meta-box__label">Type</p><p className="meta-box__value">{account.accountType ?? '—'}</p></div>
              <div className="meta-box"><p className="meta-box__label">Provider</p><p className="meta-box__value">{account.provider ?? '—'}</p></div>
              {account.referenceNumber ? <div className="meta-box"><p className="meta-box__label">Reference</p><p className="meta-box__value">{account.referenceNumber}</p></div> : null}
            </>
          ) : null}
        </div>
      </Card>

      <div className="btn-row">
        <Btn
          variant="soft"
          icon={<ArrowLeftRight size={16} />}
          onClick={() => navigate(`/money/new?kind=transfer&account=${account.id}`)}
        >
          Transfer
        </Btn>
        <Btn
          variant="soft"
          onClick={() => {
            setActual(balance);
            setReconcileDate(todayISO());
            setReconcileOpen(true);
          }}
        >
          Reconcile
        </Btn>
      </div>
      <div className="btn-row">
        <Btn variant="soft" onClick={() => navigate(`/money/new?kind=income&account=${account.id}`)}>Add income</Btn>
        <Btn variant="soft" onClick={() => navigate(`/money/new?kind=expense&account=${account.id}`)}>Add expense</Btn>
      </div>
      <Btn variant="soft" block icon={<Share2 size={16} />} onClick={openShare}>
        Share account details
      </Btn>

      <Card className="card--flush">
        <div className="card-head" style={{ padding: '14px 14px 0' }}>
          <div>
            <h2 className="card-title">Transactions</h2>
            <p className="card-sub">All movements for this account</p>
          </div>
        </div>
        {accountTxns.length ? (
          accountTxns.slice(0, 40).map((txn) => (
            <TxnRow key={txn.id} txn={txn} hide={hide} showAccount={false} onClick={() => navigate(`/money/txn/${txn.id}`)} />
          ))
        ) : (
          <Empty title="No movements yet" body="Income, expenses and transfers will appear here." />
        )}
      </Card>

      {docs.length ? (
        <Card>
          <h2 className="card-title">Linked documents</h2>
          {docs.map((doc) => (
            <button key={doc.id} className="list-row" onClick={() => navigate(`/vault/${doc.id}`)}>
              <span className="list-row__icon"><Archive size={16} /></span>
              <span className="list-row__text">
                <span className="list-row__title">{doc.name}</span>
                <span className="list-row__sub">{doc.category.replace('-', ' ')}</span>
              </span>
              <ChevronRight size={17} className="muted" />
            </button>
          ))}
        </Card>
      ) : null}

      <Card>
        <h2 className="card-title">Manage</h2>
        <Btn variant="soft" onClick={() => setArchiveOpen(true)}>
          {account.archived ? 'Restore account' : 'Archive account'}
        </Btn>
        <Btn variant="ghost" icon={<Trash2 size={16} />} onClick={() => setDeleteOpen(true)}>
          Delete account
        </Btn>
        {hasHistory ? <p className="hint">This account has history, so it can be archived but not deleted.</p> : null}
      </Card>

      <Sheet
        open={reconcileOpen}
        onClose={() => setReconcileOpen(false)}
        title="Reconcile balance"
        subtitle="Match Finora to your real balance"
        footer={
          <>
            <Btn variant="soft" onClick={() => setReconcileOpen(false)}>Cancel</Btn>
            <Btn
              onClick={() => {
                try {
                  const adjustmentId = actions.account.reconcile(account.id, actual, reconcileDate);
                  if (adjustmentId && reconcileAttachments.length) {
                    commitRecordAttachments(reconcileAttachments, [{ type: 'txn', id: adjustmentId }], 'bank-statement');
                  }
                  setReconcileAttachments([]);
                  setReconcileOpen(false);
                  toast(adjustmentId ? 'Balance reconciled' : 'Balance already matches');
                } catch (err) {
                  toast((err as Error).message, 'error');
                }
              }}
            >
              Reconcile
            </Btn>
          </>
        }
      >
        <div className="form-note">
          Finora currently calculates <strong>{formatMoney(balance, account.currency)}</strong>.
          Enter the balance shown by your bank and Finora posts a visible adjustment transaction — it is never counted as salary or regular income.
        </div>
        <Field label="Actual balance">
          <MoneyInput value={actual} currency={account.currency} onChange={setActual} />
        </Field>
        <Field label="Adjustment date">
          <Input type="date" value={reconcileDate} onChange={(e) => setReconcileDate(e.target.value)} />
        </Field>
        <RecordAttachments
          links={[]}
          category="bank-statement"
          staged={reconcileAttachments}
          onStagedChange={setReconcileAttachments}
          title="Supporting statement"
        />
      </Sheet>

      <Sheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share account"
        subtitle="Card image or text — nothing is uploaded"
        footer={<Btn variant="soft" onClick={() => setShareOpen(false)}>Done</Btn>}
      >
        <div className="share-preview">
          {cardPreview ? (
            <img src={cardPreview} alt="Account card preview" />
          ) : (
            <span className="tiny muted">Rendering account card…</span>
          )}
        </div>
        <div className="btn-row">
          <Btn variant="soft" icon={<Share2 size={16} />} onClick={() => void shareCard()} loading={sharing}>
            Share image
          </Btn>
          <Btn variant="soft" onClick={() => void shareText()}>Share text</Btn>
        </div>
        <div className="form-note">
          Balance, opening balance, credit limits and internal IDs are never included. For bank accounts the card and
          text contain only the holder, bank, branch and account number. Finora cannot recall a copy once it has been sent.
        </div>
      </Sheet>

      <Confirm
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        danger={false}
        title={account.archived ? 'Restore account?' : 'Archive account?'}
        message={account.archived ? 'This account will count towards totals again.' : 'History is kept, but the account is hidden from totals, transfers and pickers.'}
        confirmLabel={account.archived ? 'Restore' : 'Archive'}
        onConfirm={() => {
          actions.account.setArchived(account.id, !account.archived);
          setArchiveOpen(false);
          toast(account.archived ? 'Account restored' : 'Account archived');
        }}
      />

      <Confirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete account?"
        message="This permanently removes the account and its image."
        confirmLabel="Delete"
        onConfirm={() => {
          actions.account.remove(account.id);
          setDeleteOpen(false);
          toast('Account deleted');
          navigate('/money', true);
        }}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ transaction form */

export function TxnForm() {
  const state = useApp();
  const { query } = useRoute();
  const editId = query.get('edit');
  const existing = editId ? state.transactions.find((t) => t.id === editId) : undefined;
  const initialKind = (existing?.kind ?? (query.get('kind') as TxnKind) ?? 'expense') as TxnKind;
  const [kind, setKind] = useState<TxnKind>(initialKind);
  const [amount, setAmount] = useState(existing?.amount ?? 0);
  const [currency, setCurrency] = useState(existing?.currency ?? state.settings.currency);
  const accounts = state.accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = useState(
    existing?.accountId ?? query.get('account') ?? accounts.find((a) => a.currency === (existing?.currency ?? state.settings.currency))?.id ?? '',
  );
  const [toAccountId, setToAccountId] = useState(existing?.toAccountId ?? '');
  const [category, setCategory] = useState(existing?.category ?? (initialKind === 'income' ? 'Salary' : 'Food'));
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [merchant, setMerchant] = useState(existing?.merchant ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [attachments, setAttachments] = useState<FilePayload[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const eligible = accounts.filter((a) => a.currency === currency);
  const categories = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const storedAttachment = existing?.attachmentId ? state.media[existing.attachmentId]?.dataUrl : undefined;

  const changeKind = (next: TxnKind) => {
    setKind(next);
    setError('');
    setCategory(next === 'income' ? 'Salary' : next === 'expense' ? 'Food' : '');
  };

  const changeCurrency = (code: string) => {
    setCurrency(code);
    const first = accounts.find((a) => a.currency === code);
    setAccountId(first?.id ?? '');
    setToAccountId('');
  };

  const submit = () => {
    setError('');
    if (amount <= 0) { setError('Enter an amount greater than zero.'); return; }
    if (!accountId) { setError('Select an account.'); return; }
    if (kind === 'transfer') {
      if (!toAccountId) { setError('Select the destination account.'); return; }
      if (toAccountId === accountId) { setError('Choose two different accounts.'); return; }
    }
    setBusy(true);
    try {
      const attachmentId = existing?.attachmentId;
      const payload = {
        kind,
        amount,
        currency,
        date,
        accountId,
        toAccountId: kind === 'transfer' ? toAccountId : undefined,
        category: kind === 'transfer' ? undefined : category,
        merchant: merchant.trim() || undefined,
        notes: notes.trim() || undefined,
        attachmentId,
      };
      let savedId = existing?.id ?? '';
      if (existing) actions.txn.update(existing.id, payload);
      else savedId = actions.txn.add(payload);
      if (attachments.length) {
        commitRecordAttachments(attachments, [{ type: 'txn', id: savedId }], kind === 'transfer' ? 'bank-statement' : 'receipt');
      }
      toast(existing ? 'Transaction updated' : kind === 'transfer' ? 'Transfer recorded' : 'Transaction recorded');
      goBack('/money');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <FullForm
      title={existing ? 'Edit transaction' : kind === 'transfer' ? 'Transfer money' : kind === 'income' ? 'Add income' : 'Add expense'}
      subtitle={existing ? formatDate(existing.date, state.settings.dateFormat) : 'Balances update immediately'}
      onClose={() => goBack('/money')}
      footer={
        <>
          <Btn variant="soft" onClick={() => goBack('/money')} disabled={busy}>Cancel</Btn>
          <Btn onClick={submit} loading={busy}>{existing ? 'Save changes' : 'Save'}</Btn>
        </>
      }
    >
      <div className="form-stack">
        {error ? <div className="form-error" role="alert">{error}</div> : null}

        {!existing ? (
          <Segmented
            ariaLabel="Transaction type"
            value={kind}
            onChange={changeKind}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'transfer', label: 'Transfer' },
            ]}
          />
        ) : null}

        <MoneyField label="Amount" value={amount} currency={currency} onChange={setAmount} error={error && amount <= 0 ? 'Enter an amount' : undefined} autoFocus />

        {accounts.length === 0 ? (
          <Card>
            <Empty
              icon={<Landmark size={20} />}
              title="Add an account first"
              body="Every transaction must belong to one of your accounts."
              action={<Btn size="sm" onClick={() => navigate('/money/account/new')}>Add account</Btn>}
            />
          </Card>
        ) : (
          <>
            <CurrencySelect value={currency} onChange={changeCurrency} />

            <Field label={kind === 'transfer' ? 'From account' : 'Account'} hint={eligible.length ? undefined : 'No accounts use this currency yet.'}>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select account</option>
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.currency}
                  </option>
                ))}
              </Select>
            </Field>

            {kind === 'transfer' ? (
              <Field label="To account">
                <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  <option value="">Select destination</option>
                  {eligible.filter((a) => a.id !== accountId).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {a.currency}</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Category">
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
            )}

            <Field label="Date">
              <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            </Field>

            {kind !== 'transfer' ? (
              <Field label={kind === 'income' ? 'Source' : 'Merchant'} hint="Optional">
                <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={kind === 'income' ? 'e.g. Employer' : 'e.g. Supermarket'} />
              </Field>
            ) : (
              <Field label="Description" hint="Optional">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Moving savings" />
              </Field>
            )}

            {kind !== 'transfer' ? (
              <Field label="Notes" hint="Optional">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            ) : null}

            <RecordAttachments
              links={existing ? [{ type: 'txn', id: existing.id }] : []}
              category={kind === 'transfer' ? 'bank-statement' : 'receipt'}
              staged={attachments}
              onStagedChange={setAttachments}
              title={kind === 'transfer' ? 'Transfer slip' : 'Receipts & documents'}
              disabled={busy}
            />
            {storedAttachment ? (
              <div className="form-note">An older single-file receipt is still preserved with this transaction. New uploads support multiple files.</div>
            ) : null}

            {kind === 'transfer' ? (
              <div className="form-note">
                Transfers move money between your own accounts and are never counted as income or expenses.
              </div>
            ) : null}
          </>
        )}
      </div>
    </FullForm>
  );
}

/* ---------------------------------------------------------------- transaction detail */

export function TxnDetail({ txnId }: { txnId: string }) {
  const state = useApp();
  const txn = state.transactions.find((t) => t.id === txnId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [attachmentDraft, setAttachmentDraft] = useState<FilePayload[]>([]);
  const hide = state.settings.hideBalances;

  if (!txn) {
    return (
      <Screen title="Transaction" back>
        <Empty title="Transaction not found" body="It may have been removed." />
      </Screen>
    );
  }

  const from = state.accounts.find((a) => a.id === txn.accountId);
  const to = state.accounts.find((a) => a.id === txn.toAccountId);
  const attachment = txn.attachmentId ? state.media[txn.attachmentId] : undefined;
  const system = Boolean(txn.source);

  return (
    <Screen
      title={txn.kind === 'transfer' ? 'Transfer' : txn.kind === 'income' ? 'Income' : 'Expense'}
      subtitle={formatDate(txn.date, state.settings.dateFormat)}
      back
      actions={
        <>
          {!system ? (
            <IconBtn label="Edit transaction" onClick={() => navigate(`/money/new?kind=${txn.kind}&edit=${txn.id}`)}>
              <Pencil size={18} />
            </IconBtn>
          ) : null}
          {!system ? (
            <IconBtn
              label="Duplicate transaction"
              onClick={() => {
                const { id: _id, createdAt: _createdAt, ...draft } = txn;
                try {
                  actions.txn.add({ ...draft, date: todayISO(), notes: draft.notes ? `${draft.notes} (copy)` : 'Duplicated transaction' });
                  toast('Transaction duplicated for today');
                  navigate('/money');
                } catch (error) {
                  toast((error as Error).message, 'error');
                }
              }}
            >
              <Copy size={18} />
            </IconBtn>
          ) : null}
          <IconBtn label="Delete transaction" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={18} />
          </IconBtn>
        </>
      }
    >
      <Card>
        <div className="stack--tight">
          <p className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {txn.kind === 'income' ? 'Money received' : txn.kind === 'expense' ? 'Money spent' : 'Internal transfer'}
          </p>
          <p className={`summary__net ${txn.kind === 'income' ? 'stat__value--in' : ''}`} style={{ color: txn.kind === 'income' ? 'var(--ok)' : undefined }}>
            {txn.kind === 'income' ? '+' : txn.kind === 'expense' ? '−' : ''}{formatMoney(txn.amount, txn.currency, { hide })}
          </p>
          <p className="small muted">{txn.merchant || txn.category || 'Transaction'}</p>
        </div>
        <div className="meta-grid">
          <div className="meta-box">
            <p className="meta-box__label">Category</p>
            <p className="meta-box__value">{txn.category || '—'}</p>
          </div>
          <div className="meta-box">
            <p className="meta-box__label">Currency</p>
            <p className="meta-box__value">{txn.currency}</p>
          </div>
          <div className="meta-box">
            <p className="meta-box__label">{txn.kind === 'transfer' ? 'From' : 'Account'}</p>
            <p className="meta-box__value">{from?.name ?? '—'}</p>
          </div>
          {txn.kind === 'transfer' ? (
            <div className="meta-box">
              <p className="meta-box__label">To</p>
              <p className="meta-box__value">{to?.name ?? '—'}</p>
            </div>
          ) : (
            <div className="meta-box">
              <p className="meta-box__label">Date</p>
              <p className="meta-box__value">{formatDate(txn.date, state.settings.dateFormat)}</p>
            </div>
          )}
        </div>
        {txn.notes ? <p className="small muted">{txn.notes}</p> : null}
      </Card>

      {system ? (
        <div className="banner banner--info">
          <span>
            This record was generated automatically by{' '}
            <strong>{txn.source?.startsWith('salary') ? 'Salary and payroll' : 'Bills'}</strong>.
            Correct it in that module so balances and reports stay consistent.
          </span>
        </div>
      ) : null}

      <RecordAttachments
        links={[{ type: 'txn', id: txn.id }]}
        category="receipt"
        staged={attachmentDraft}
        onStagedChange={(files) => {
          if (files.length) commitRecordAttachments(files, [{ type: 'txn', id: txn.id }], 'receipt');
          setAttachmentDraft([]);
        }}
        title="Receipts & documents"
      />

      {attachment ? (
        <Card>
          <h2 className="card-title">Attachment</h2>
          {attachment.mime.startsWith('image/') ? (
            <img src={attachment.dataUrl} alt={attachment.name} style={{ borderRadius: 12, maxHeight: 260, maxWidth: '100%', objectFit: 'contain', background: 'var(--surface-2)' }} />
          ) : (
            <div className="attachment-file">
              <span className="attachment-file__icon"><Archive size={20} /></span>
              <span className="min-w-0">
                <strong className="block truncate">{attachment.name}</strong>
                <span className="tiny muted">{attachment.mime} · original file</span>
              </span>
            </div>
          )}
          <div className="btn-row">
            <Btn
              variant="soft"
              size="sm"
              onClick={() => {
                const url = URL.createObjectURL(dataUrlToBlob(attachment.dataUrl));
                const win = window.open(url, '_blank', 'noopener,noreferrer');
                if (!win) {
                  URL.revokeObjectURL(url);
                  downloadBlob(attachment.name, dataUrlToBlob(attachment.dataUrl));
                  toast('Preview was blocked — the file has been downloaded instead.', 'error');
                  return;
                }
                window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
              }}
            >Preview</Btn>
            <Btn
              variant="soft"
              size="sm"
              icon={<Download size={16} />}
              onClick={() => downloadBlob(attachment.name, dataUrlToBlob(attachment.dataUrl))}
            >Download</Btn>
            <Btn
              variant="soft"
              size="sm"
              icon={<Share2 size={16} />}
              onClick={() => {
                void shareOrDownload(attachment.name, dataUrlToBlob(attachment.dataUrl))
                  .then((result) => toast(result === 'shared' ? 'Attachment shared' : 'Attachment downloaded'))
                  .catch((error: Error) => { if (error.name !== 'AbortError') toast(error.message, 'error'); });
              }}
            >Share</Btn>
            <Btn
              variant="soft"
              size="sm"
              onClick={() => {
                const base = attachment.name.replace(/\.[^.]+$/, '') || 'finora-attachment';
                downloadBlob(`${base}.${extFor(attachment.mime)}`, dataUrlToBlob(attachment.dataUrl));
              }}
            >Export</Btn>
          </div>
        </Card>
      ) : null}

      <Confirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this transaction?"
        message={
          system
            ? 'This record belongs to another module and cannot be deleted here. Remove it from its source module instead.'
            : 'Account balances, budgets and reports will update immediately. This cannot be undone.'
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (system) {
            setDeleteOpen(false);
            return;
          }
          actions.txn.remove(txn.id);
          setDeleteOpen(false);
          toast('Transaction deleted');
          navigate('/history', true);
        }}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------- history */

export function HistoryScreen() {
  const state = useApp();
  const [term, setTerm] = useState('');
  const [kind, setKind] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(40);
  const hide = state.settings.hideBalances;

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return [...state.transactions]
      .filter((t) => {
        if (kind !== 'all' && t.kind !== kind) return false;
        if (from && t.date < from) return false;
        if (to && t.date > to) return false;
        if (!q) return true;
        return [t.merchant, t.notes, t.category, t.date].some((v) => (v ?? '').toLowerCase().includes(q));
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [state.transactions, kind, from, to, term]);

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const txn of filtered) {
      if (txn.kind === 'transfer') continue;
      map.set(txn.currency, (map.get(txn.currency) ?? 0) + txn.amount);
    }
    return map;
  }, [filtered]);

  const exportCsv = () => {
    if (!filtered.length) {
      toast('Nothing to export', 'info');
      return;
    }
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = filtered.map((txn) => {
      const account = state.accounts.find((a) => a.id === txn.accountId)?.name ?? '';
      const target = state.accounts.find((a) => a.id === txn.toAccountId)?.name ?? '';
      return [
        txn.date,
        txn.kind,
        txn.category ?? '',
        txn.merchant ?? '',
        txn.notes ?? '',
        (txn.amount / 100).toFixed(2),
        txn.currency,
        account,
        target,
      ].map(escape).join(',');
    });
    const csv = `\ufeffDate,Kind,Category,Merchant,Notes,Amount,Currency,Account,To account\n${rows.join('\n')}`;
    downloadBlob(`finora-transactions-${todayISO()}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    toast('CSV exported');
  };

  return (
    <Screen title="Transaction history" subtitle={`${filtered.length} records`} back actions={
      <IconBtn label="Export CSV" onClick={exportCsv}><Download size={18} /></IconBtn>
    }>
      <Field label="Search">
        <Input value={term} onChange={(e) => { setTerm(e.target.value); setLimit(40); }} placeholder="Merchant, note or category" inputMode="search" />
      </Field>

      <Segmented
        ariaLabel="Transaction filter"
        value={kind}
        onChange={(v) => { setKind(v); setLimit(40); }}
        options={[
          { value: 'all', label: 'All' },
          { value: 'income', label: 'Income' },
          { value: 'expense', label: 'Expenses' },
          { value: 'transfer', label: 'Transfers' },
        ]}
      />

      <div className="row">
        <Field label="From"><Input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setLimit(40); }} /></Field>
        <Field label="To"><Input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setLimit(40); }} /></Field>
      </div>

      {totals.size ? (
        <div className="chip-row">
          {[...totals.entries()].map(([currency, total]) => (
            <span key={currency} className="chip">
              {formatMoney(total, currency, { hide })} {currency}
            </span>
          ))}
        </div>
      ) : null}

      <Card className="card--flush">
        {filtered.length ? (
          filtered.slice(0, limit).map((txn) => (
            <TxnRow key={txn.id} txn={txn} hide={hide} onClick={() => navigate(`/money/txn/${txn.id}`)} />
          ))
        ) : (
          <Empty title="No transactions match" body="Try a different search or date range." />
        )}
      </Card>

      {filtered.length > limit ? (
        <Btn variant="soft" block onClick={() => setLimit((n) => n + 40)}>Load more</Btn>
      ) : null}
    </Screen>
  );
}

