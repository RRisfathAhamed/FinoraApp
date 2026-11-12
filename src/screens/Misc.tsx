import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  MessageSquare,
  Search,
  ShieldAlert,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { useApp, navigate } from '../lib/hooks';
import { formatDate, todayISO } from '../lib/calc';
import { buildNotifications, globalSearch } from '../lib/select';
import { actions } from '../lib/store';
import { ALL_CATEGORIES, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../lib/categories';
import { iconFor } from '../lib/notificationIcon';
import { toast } from '../lib/toast';
import {
  Btn,
  Card,
  Empty,
  Field,
  Input,
  MoneyField,
  Screen,
  Select,
  Sheet,
  Textarea,
} from '../components/ui';
import { StatusPill } from '../components/bits';
import type { SmsDraft } from '../lib/types';
import { splitMessages } from '../lib/sms';
import {
  hasSmsBridge,
  readDeviceMessages,
  requestSmsPermission,
} from '../lib/smsBridge';
import { hasDeviceNotifications, postTestNotification, syncDeviceReminders } from '../lib/nativeNotify';
import { requestNativePermission } from '../lib/nativePerms';

/* ---------------------------------------------------------------------- sms */

export function SmsScreen() {
  const state = useApp();
  const [raw, setRaw] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'ignored'>('all');
  const [editing, setEditing] = useState<SmsDraft | null>(null);
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState(state.settings.currency);
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState('');
  const [category, setCategory] = useState('Other');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    setBridgeReady(hasSmsBridge());
  }, []);

  const drafts = [...state.smsDrafts]
    .filter((d) => filter === 'all' || d.status === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = state.smsDrafts.filter((d) => d.status === 'pending').length;
  const accounts = state.accounts.filter((a) => !a.archived && a.currency === currency);

  const openReview = (draft: SmsDraft) => {
    setEditing(draft);
    setAmount(draft.amount ?? 0);
    setCurrency(draft.currency);
    setDirection(draft.direction);
    setMerchant(draft.merchant);
    setDate(draft.date);
    setAccountId(draft.accountId ?? accounts[0]?.id ?? '');
    setCategory(draft.category ?? (draft.direction === 'in' ? 'Other income' : 'Other'));
    setError('');
  };

  const ingestBodies = (bodies: string[]) => {
    const results = bodies.map((body) => actions.sms.ingest(body, state.settings.currency));
    const added = results.filter((result) => !result.duplicate).length;
    const duplicates = results.length - added;
    if (!added && duplicates) {
      toast('Those messages were already imported — duplicates are blocked', 'info');
    } else if (added) {
      toast(`${added} message${added === 1 ? '' : 's'} parsed on this device. Review before saving.`);
    } else {
      toast('No bank transaction was found in that message', 'info');
    }
    return added;
  };

  const ingest = () => {
    if (!raw.trim()) {
      toast('Paste a bank message first', 'error');
      return;
    }
    ingestBodies(splitMessages(raw));
    setRaw('');
    setFilter('pending');
  };

  const scanDevice = async () => {
    setScanning(true);
    try {
      const granted = await requestSmsPermission();
      if (!granted) {
        toast('SMS permission was not granted', 'error');
        return;
      }
      const messages = await readDeviceMessages(30);
      if (!messages.length) {
        toast('The device returned no recent messages', 'info');
        return;
      }
      const added = ingestBodies(messages.map((message) => message.body));
      if (added) setFilter('pending');
    } finally {
      setScanning(false);
    }
  };

  const saveReview = (confirm: boolean) => {
    if (!editing) return;
    setError('');
    if (confirm) {
      if (!accountId) { setError('Choose the account this transaction belongs to.'); return; }
      if (amount <= 0) { setError('Enter the transaction amount.'); return; }
    }
    setBusy(true);
    try {
      actions.sms.update(editing.id, {
        amount: amount || null,
        currency,
        direction,
        merchant: merchant.trim() || 'Bank transaction',
        date,
        accountId: accountId || undefined,
        category,
      });
      if (confirm) {
        actions.sms.confirm(editing.id);
        toast('Transaction confirmed and added');
      } else {
        toast('Draft saved for later', 'info');
      }
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Bank messages"
      subtitle="Review detected transactions before they are saved"
      back
    >
      <div className="banner banner--warn">
        <ShieldAlert size={18} />
        <span>
          Automatic detection needs the installed Android build to be granted SMS access; this browser build
          cannot read your inbox. Nothing is saved without your approval: every detected message becomes a draft
          you can accept or deny. You can also paste messages below.
        </span>
      </div>

      <Card>
        <div className="spread">
          <div>
            <h2 className="card-title">Paste a bank message</h2>
            <p className="card-sub">Parsed on this device · nothing is sent anywhere</p>
          </div>
          <MessageSquare size={20} className="muted" />
        </div>
        <Textarea
          rows={4}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="e.g. LKR 2,450.00 debited from A/C ••4821 at SUPERMARKET on 12/11/2026. Available balance LKR 45,200.00"
        />
        <div className="btn-row">
          <Btn variant="soft" onClick={() => setRaw('')} disabled={!raw}>Clear</Btn>
          <Btn onClick={ingest}>Review message</Btn>
        </div>
        <p className="hint">
          Paste one message, or several separated by blank lines. OTPs, security codes and promotional messages are
          ignored automatically. Amounts alone are never enough to merge two transactions.
        </p>
      </Card>

      <Card>
        <div className="spread">
          <div>
            <h2 className="card-title">Device message detection</h2>
            <p className="card-sub">Scan the Android SMS inbox for bank transactions</p>
          </div>
          <Smartphone size={20} className="muted" />
        </div>
        {bridgeReady ? (
          <>
            <Btn variant="soft" block onClick={() => void scanDevice()} loading={scanning}>
              Scan device messages
            </Btn>
            <p className="hint">Reads the last 30 days on this device only. Each bank message becomes a draft that you must accept or deny.</p>
          </>
        ) : (
          <p className="tiny muted">
            This browser has no access to SMS. Install the Android build and grant the SMS permission to scan
            automatically, or paste the message above. Finora never uses Accessibility Services as a workaround.
          </p>
        )}
      </Card>

      <div className="chip-row">
        {([['all', 'All'], ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['ignored', 'Ignored']] as const).map(([value, label]) => (
          <button key={value} className={`chip ${filter === value ? 'chip--active' : ''}`} onClick={() => setFilter(value)}>
            {label}{value === 'pending' && pending ? ` (${pending})` : ''}
          </button>
        ))}
      </div>

      <Card className="card--flush">
        {drafts.length ? (
          drafts.map((draft) => (
            <div key={draft.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <span className="list-row__icon"><MessageSquare size={17} /></span>
              <span className="list-row__text">
                <span className="list-row__title">
                  {draft.merchant}{draft.amount ? ` · ${draft.direction === 'in' ? '+' : '−'}${(draft.amount / 100).toFixed(2)} ${draft.currency}` : ''}
                </span>
                <span className="list-row__sub">
                  {formatDate(draft.date)} · confidence {draft.confidence}
                </span>
                <span style={{ display: 'inline-flex', marginTop: 4 }}>
                  <StatusPill status={draft.status} />
                </span>
              </span>
              <span className="list-row__trail" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                {draft.status === 'pending' ? (
                  <>
                    <Btn size="sm" variant="soft" onClick={() => openReview(draft)}>Review</Btn>
                    <button
                      className="link-btn"
                      onClick={() => {
                        actions.sms.setStatus(draft.id, 'ignored');
                        toast('Draft ignored', 'info');
                      }}
                    >
                      Ignore
                    </button>
                  </>
                ) : draft.status === 'confirmed' && draft.txnId ? (
                  <button className="link-btn" onClick={() => navigate(`/money/txn/${draft.txnId}`)}>
                    Open <ChevronRight size={13} />
                  </button>
                ) : (
                  <button
                    className="link-btn"
                    onClick={() => actions.sms.setStatus(draft.id, 'pending')}
                  >
                    Restore
                  </button>
                )}
              </span>
            </div>
          ))
        ) : (
          <Empty
            icon={<MessageSquare size={20} />}
            title="No bank message drafts"
            body="Paste a transaction message above and Finora creates a draft for your review."
          />
        )}
      </Card>

      <Sheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Review transaction"
        subtitle="Nothing is saved until you confirm"
        footer={
          <>
            <Btn variant="soft" onClick={() => setEditing(null)} disabled={busy}>Later</Btn>
            <Btn onClick={() => saveReview(true)} loading={busy}>Confirm & save</Btn>
          </>
        }
      >
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        {editing ? (
          <p className="tiny muted" style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 10 }}>
            “{editing.raw}”
          </p>
        ) : null}
        <div className="row">
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
              <option value="out">Money out</option>
              <option value="in">Money in</option>
            </Select>
          </Field>
          <Field label="Currency">
            <Select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setAccountId(state.accounts.find((a) => !a.archived && a.currency === e.target.value)?.id ?? '');
              }}
            >
              {[...new Set([state.settings.currency, ...state.accounts.map((a) => a.currency)])].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <MoneyField label="Amount" value={amount} currency={currency} onChange={setAmount} />
        <Field label="Merchant or sender">
          <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Account">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {(direction === 'in' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <div className="btn-row">
          <Btn variant="soft" size="sm" onClick={() => saveReview(false)}>Save draft</Btn>
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!editing) return;
              actions.sms.setStatus(editing.id, 'ignored');
              setEditing(null);
              toast('Draft ignored', 'info');
            }}
          >
            Deny message
          </Btn>
        </div>
        <p className="hint">Confirming creates one income or expense transaction. A message fingerprint prevents the same message being imported twice.</p>
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------- notifications */

export function NotificationsScreen() {
  const state = useApp();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const notifications = buildNotifications(state);
  const unread = notifications.filter((n) => !state.readNotifKeys.includes(n.key));
  const list = onlyUnread ? unread : notifications;

  return (
    <Screen title="Notifications" subtitle={`${unread.length} unread`} back>
      {hasDeviceNotifications() ? (
        <Card>
          <div className="spread">
            <div>
              <h2 className="card-title">Device reminders</h2>
              <p className="card-sub">Notification shade and lock screen</p>
            </div>
            <Bell size={18} className="muted" />
          </div>
          <p className="tiny muted">
            Salary, EMI and bill reminders are queued on this device and stay visible on the lock screen.
          </p>
          <Btn
            variant="soft"
            size="sm"
            onClick={async () => {
              const granted = await requestNativePermission('notifications');
              if (!granted) {
                toast('Allow notifications to receive reminders', 'info');
                return;
              }
              syncDeviceReminders(state);
              postTestNotification();
              toast('Device reminders enabled');
            }}
          >
            Enable device reminders
          </Btn>
        </Card>
      ) : null}
      <div className="chip-row">
        <button className={`chip ${!onlyUnread ? 'chip--active' : ''}`} onClick={() => setOnlyUnread(false)}>All</button>
        <button className={`chip ${onlyUnread ? 'chip--active' : ''}`} onClick={() => setOnlyUnread(true)}>Unread</button>
        <button className="chip" onClick={() => navigate('/settings')}>Preferences</button>
      </div>

      {unread.length ? (
        <Btn variant="soft" block onClick={() => { actions.notifications.markAllRead(notifications.map((n) => n.key)); toast('All notifications marked as read'); }}>
          Mark all as read
        </Btn>
      ) : null}

      <Card className="card--flush">
        {list.length ? (
          list.map((item) => (
            <button
              key={item.key}
              className="list-row"
              onClick={() => {
                actions.notifications.markRead(item.key);
                navigate(item.link.replace('#', ''));
              }}
            >
              <span className={`list-row__icon ${item.urgency === 'danger' ? 'list-row__icon--danger' : ''}`}>
                {iconFor(item.kind)}
              </span>
              <span className="list-row__text">
                <span className="list-row__title">
                  {!state.readNotifKeys.includes(item.key) ? <span className="dot" style={{ background: 'var(--brand)', borderRadius: '50%', marginRight: 6 }} /> : null}
                  {item.title}
                </span>
                <span className="list-row__sub">{item.body}</span>
              </span>
              <span className="list-row__trail" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                <span className="tiny">{formatDate(item.date)}</span>
                {item.urgency !== 'info' ? <StatusPill status={item.urgency === 'danger' ? 'overdue' : 'due-soon'} /> : null}
              </span>
            </button>
          ))
        ) : (
          <Empty
            icon={<Bell size={20} />}
            title={onlyUnread ? 'You are all caught up' : 'No notifications yet'}
            body="Salary, EMI, bill and budget reminders appear here as they become relevant."
          />
        )}
      </Card>

      <p className="tiny muted">
        Reminders are generated from your own records and de-duplicated per event. Finora never sends duplicate reminders for the same obligation.
      </p>
    </Screen>
  );
}

/* -------------------------------------------------------------------- search */

export function SearchScreen() {
  const state = useApp();
  const [term, setTerm] = useState('');
  const groups = useMemo(() => globalSearch(state, term), [state, term]);

  const open = (link: string, query: string) => {
    actions.search.remember(query);
    navigate(link.replace('#', ''));
  };

  return (
    <Screen title="Search" subtitle="Accounts, transactions, salary, loans, bills and documents" back>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          actions.search.remember(term);
        }}
      >
        <Field label="Search Finora">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="e.g. supermarket, car loan, payslip"
            inputMode="search"
            autoFocus
          />
        </Field>
      </form>

      {!term.trim() ? (
        <>
          {state.recentSearches.length ? (
            <div>
              <div className="spread">
                <h2 className="section-title">Recent searches</h2>
                <button className="link-btn" onClick={() => actions.search.clear()}>Clear</button>
              </div>
              <div className="chip-row" style={{ marginTop: 8 }}>
                {state.recentSearches.map((recent) => (
                  <button key={recent} className="chip" onClick={() => setTerm(recent)}>{recent}</button>
                ))}
              </div>
            </div>
          ) : null}
          <Card>
            <Empty
              icon={<Search size={22} />}
              title="Find anything"
              body="Search by merchant, note, category, lender, account or document name. Results are grouped by record type."
            />
          </Card>
        </>
      ) : groups.length ? (
        groups.map((group) => (
          <section key={group.type}>
            <div className="section-head"><h2 className="section-title">{group.label}</h2></div>
            <Card className="card--flush">
              {group.items.map((item) => (
                <button key={`${group.type}-${item.id}`} className="list-row" onClick={() => open(item.link, term)}>
                  <span className="list-row__text">
                    <span className="list-row__title">{item.title}</span>
                    <span className="list-row__sub">{item.subtitle}</span>
                  </span>
                  <span className="list-row__trail">
                    {item.amount ? <span className="num">{item.amount}</span> : null}
                    <ChevronRight size={16} className="muted" />
                  </span>
                </button>
              ))}
            </Card>
          </section>
        ))
      ) : (
        <Card>
          <Empty
            icon={<Search size={22} />}
            title={`No results for “${term.trim()}”`}
            body="Try a shorter term or check another spelling."
          />
        </Card>
      )}
    </Screen>
  );
}

/* ---------------------------------------------------------------------- help */

function HelpSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="card-title">{title}</h2>
      <div className="small muted" style={{ lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </Card>
  );
}

export function HelpScreen() {
  return (
    <Screen title="Help & support" subtitle="How Finora handles your money" back>
      <HelpSection title="Money definitions">
        <p><strong>Assets</strong> are active bank, cash and wallet balances, allocated savings and investment values.</p>
        <p><strong>Liabilities</strong> are outstanding loan principal and negative credit-card balances.</p>
        <p><strong>Net worth = assets − liabilities.</strong> Available cash excludes investments and unused credit.</p>
        <p>Different currencies are never added together. Totals are shown per currency.</p>
      </HelpSection>

      <HelpSection title="Income, expenses and transfers">
        <p>Only recorded income transactions increase income. Opening balances and loan disbursements never count as income.</p>
        <p>Transfers between your own accounts change balances but never affect income or spending reports.</p>
        <p>Reconciliation posts a visible balance adjustment, so corrections do not silently inflate income.</p>
      </HelpSection>

      <HelpSection title="Salary and weekly allocations">
        <p>Expected salary is informational. Income is recognised only when you record a payment, and each payment creates a real income transaction in the linked account.</p>
        <p>A monthly allocation paid weekly is divided by the actual number of payment weekdays in that calendar month. Four payment days pay a larger share than five; the month always totals exactly the allocation. Rounding remainder is distributed in minor units.</p>
        <p>Commission and overtime belong to the job and payroll period, so they can’t leak into another period.</p>
      </HelpSection>

      <HelpSection title="Loans and EMIs">
        <p>Borrowing increases cash and liabilities equally, so net worth does not change and no income is recorded.</p>
        <p>Each EMI splits into principal (reduces the liability) and interest (an expense). Partial payments are supported, overpayment of a completed EMI is blocked, and payments can be reversed with an audit note.</p>
      </HelpSection>

      <HelpSection title="Documents and sharing">
        <p>The Vault stores PDF and image files on this device with size and type validation. Files can be linked to loans, transactions, salary periods and more.</p>
        <p>There are no permanent public links. Sharing uses your device share sheet; Finora cannot revoke downloaded copies, and expiring server links are not available in this local-first build.</p>
      </HelpSection>

      <HelpSection title="Bank messages">
        <p>Android restricts SMS access. Finora does not request SMS permission, and does not bypass restrictions. Paste a message to create a draft, review it, then confirm. Duplicate fingerprints are rejected.</p>
      </HelpSection>

      <HelpSection title="Backup and restore">
        <p>Backups are real ZIP archives with <code>data/</code>, <code>media/</code>, <code>documents/</code> and a <code>manifest.json</code> containing sizes and SHA-256 checksums. Restore verifies every checksum and previews contents before replacing data.</p>
        <p>No passwords or session tokens are ever included.</p>
      </HelpSection>

      <HelpSection title="Privacy and security">
        <p>All financial records are stored in this browser’s IndexedDB on your device. There is no Finora account server in this build, so data is not transmitted anywhere.</p>
        <p>Use device screen lock and an encrypted backup location. Clearing site data also clears Finora records unless you have a backup.</p>
      </HelpSection>

      <p className="tiny muted center">Finora 1.0.0 · Your money, clearly managed.</p>
      <div className="banner banner--muted">
        <Sparkles size={16} />
        <span>Need a feature? Add it through Settings, or export a backup first so experiments never risk your records.</span>
      </div>
      <Card>
        <h2 className="card-title">Quick answers</h2>
        <details>
          <summary className="small strong" style={{ padding: '8px 0' }}>Why is my expected salary not in my balance?</summary>
          <p className="tiny muted">Expected pay is not cash yet. Record a payment when money actually arrives.</p>
        </details>
        <details>
          <summary className="small strong" style={{ padding: '8px 0' }}>Why can’t I delete an account?</summary>
          <p className="tiny muted">Accounts with history are protected. Archive them instead; this keeps reports and audits intact.</p>
        </details>
        <details>
          <summary className="small strong" style={{ padding: '8px 0' }}>Why can’t I edit an EMI payment?</summary>
          <p className="tiny muted">Reverse it with a reason, then record the correct payment. This preserves an audit trail.</p>
        </details>
        <details>
          <summary className="small strong" style={{ padding: '8px 0' }}>Does Finora support multiple currencies?</summary>
          <p className="tiny muted">Yes. Currencies are tracked separately and never summed without a conversion rate.</p>
        </details>
      </Card>
      <Card>
        <div className="hstack"><Check size={16} className="stat__value--in" /><span className="small">Everything is saved automatically on this device.</span></div>
      </Card>
      <div className="banner banner--muted">
        <span>All categories available: {ALL_CATEGORIES.length}. Use Vault to keep statements and receipts with their records.</span>
      </div>
    </Screen>
  );
}
