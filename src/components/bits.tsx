import type { ReactNode } from 'react';
import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Car,
  Circle,
  CreditCard,
  Film,
  GraduationCap,
  HeartPulse,
  Landmark,
  MoreHorizontal,
  ShoppingBag,
  Utensils,
  Wallet,
  Zap,
  House,
} from 'lucide-react';
import { formatMoney } from '../lib/money';
import type { Account, Txn } from '../lib/types';
import { useApp } from '../lib/hooks';
import { Pill } from './ui';

export function CategoryIcon({ category, kind }: { category?: string; kind?: Txn['kind'] }) {
  if (kind === 'transfer') {
    return <span className="txn__icon txn__icon--transfer"><ArrowLeftRight size={17} /></span>;
  }
  const c = (category ?? '').toLowerCase();
  const icon =
    /food|dining|restaurant|grocer/.test(c) ? <Utensils size={17} /> :
    /transport|fuel|travel|ride|bus|train/.test(c) ? <Car size={17} /> :
    /housing|rent|home|mortgage/.test(c) ? <House size={17} /> :
    /shop|clothing|retail/.test(c) ? <ShoppingBag size={17} /> :
    /util|electric|water|internet|phone|mobile/.test(c) ? <Zap size={17} /> :
    /health|medical|doctor|pharm/.test(c) ? <HeartPulse size={17} /> :
    /educat|school|tuition|course/.test(c) ? <GraduationCap size={17} /> :
    /entertain|movie|stream|game/.test(c) ? <Film size={17} /> :
    /salary|payroll|income|commission/.test(c) ? <Briefcase size={17} /> :
    /bank|fee|charge|interest/.test(c) ? <Landmark size={17} /> :
    /loan|emi/.test(c) ? <CreditCard size={17} /> :
    <Circle size={15} />;
  return (
    <span className={`txn__icon ${kind === 'income' ? 'txn__icon--in' : 'txn__icon--out'}`}>
      {icon}
    </span>
  );
}

export function Money({
  amount,
  currency,
  hide,
  compact,
  signed,
  className = '',
}: {
  amount: number;
  currency: string;
  hide?: boolean;
  compact?: boolean;
  signed?: boolean;
  className?: string;
}) {
  return (
    <span className={`num ${className}`}>
      {formatMoney(amount, currency, { hide, compact, signed })}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'muted'; label: string }> = {
    paid: { tone: 'ok', label: 'Paid' },
    confirmed: { tone: 'ok', label: 'Confirmed' },
    ok: { tone: 'ok', label: 'On track' },
    active: { tone: 'ok', label: 'Active' },
    upcoming: { tone: 'info', label: 'Upcoming' },
    pending: { tone: 'info', label: 'Pending' },
    partial: { tone: 'warn', label: 'Partially paid' },
    'due-soon': { tone: 'warn', label: 'Due soon' },
    warning: { tone: 'warn', label: 'Warning' },
    overdue: { tone: 'danger', label: 'Overdue' },
    over: { tone: 'danger', label: 'Over budget' },
    failed: { tone: 'danger', label: 'Failed' },
    ignored: { tone: 'muted', label: 'Ignored' },
    cancelled: { tone: 'muted', label: 'Cancelled' },
    closed: { tone: 'muted', label: 'Closed' },
    ended: { tone: 'muted', label: 'Ended' },
  };
  const entry = map[status] ?? { tone: 'neutral' as const, label: status };
  return <Pill tone={entry.tone}>{entry.label}</Pill>;
}

export function TxnRow({
  txn,
  onClick,
  showAccount = true,
  hide,
}: {
  txn: Txn;
  onClick?: () => void;
  showAccount?: boolean;
  hide?: boolean;
}) {
  const state = useApp();
  const from = state.accounts.find((a) => a.id === txn.accountId);
  const to = state.accounts.find((a) => a.id === txn.toAccountId);
  const accountLabel =
    txn.kind === 'transfer'
      ? `${from?.name ?? '—'} → ${to?.name ?? '—'}`
      : from?.name ?? '';
  const title =
    txn.kind === 'transfer'
      ? `Transfer${txn.notes ? ` · ${txn.notes}` : ''}`
      : txn.merchant || txn.category || 'Transaction';
  const meta = showAccount
    ? accountLabel || txn.category || ''
    : txn.category || accountLabel || '';
  const amountLabel = `${txn.kind === 'income' ? '+' : txn.kind === 'expense' ? '−' : ''}${formatMoney(txn.amount, txn.currency, { hide })}`;
  return (
    <button
      className="txn"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${title}, ${amountLabel}, ${txn.date}${meta ? `, ${meta}` : ''}`}
    >
      <CategoryIcon category={txn.category} kind={txn.kind} />
      <span className="txn__text">
        <span className="txn__title">{title}</span>
        <span className="txn__sub">{txn.date}</span>
        {meta ? <span className="txn__meta">{meta}</span> : null}
      </span>
      <span className={`txn__amount ${txn.kind === 'income' ? 'txn__amount--in' : ''}`}>
        {amountLabel}
      </span>
    </button>
  );
}

const ACCOUNT_GRADIENTS: Record<Account['kind'], string[]> = {
  bank: [
    'linear-gradient(135deg,#082f3a 0%,#0b5d63 52%,#0d8b76 100%)',
    'linear-gradient(135deg,#101f3b 0%,#244b85 55%,#3478ad 100%)',
    'linear-gradient(135deg,#122d28 0%,#26694f 54%,#3e9b70 100%)',
  ],
  cash: [
    'linear-gradient(135deg,#2d2417 0%,#6c4d1d 52%,#ad7d2b 100%)',
    'linear-gradient(135deg,#263326 0%,#476943 54%,#7e9a4c 100%)',
    'linear-gradient(135deg,#34201b 0%,#77412d 55%,#ad6840 100%)',
  ],
  wallet: [
    'linear-gradient(135deg,#201540 0%,#4c2b8f 54%,#8c4bc1 100%)',
    'linear-gradient(135deg,#261638 0%,#6c2b71 55%,#b04a92 100%)',
    'linear-gradient(135deg,#182044 0%,#3c3c98 54%,#5b69c9 100%)',
  ],
  credit: [
    'linear-gradient(135deg,#121722 0%,#303b51 54%,#596a86 100%)',
    'linear-gradient(135deg,#1d1720 0%,#4a3343 54%,#84616d 100%)',
    'linear-gradient(135deg,#111d27 0%,#24495c 54%,#3b7487 100%)',
  ],
  other: [
    'linear-gradient(135deg,#21173a 0%,#483263 54%,#72558b 100%)',
    'linear-gradient(135deg,#152b33 0%,#2f5660 54%,#557b7e 100%)',
    'linear-gradient(135deg,#2d1c25 0%,#60394a 54%,#8e5c67 100%)',
  ],
};

const ACCOUNT_KIND_LABELS: Record<Account['kind'], string> = {
  bank: 'Bank account',
  cash: 'Cash',
  wallet: 'Digital wallet',
  credit: 'Credit card',
  other: 'Other account',
};

export function accountGradient(account: Account, index: number): string {
  if (account.color) return account.color;
  let hash = 0;
  for (const ch of account.id) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  const options = ACCOUNT_GRADIENTS[account.kind] ?? ACCOUNT_GRADIENTS.other;
  return options[(hash + index) % options.length];
}

function AccountCardArt({ kind }: { kind: Account['kind'] }) {
  const common = {
    className: 'account-card__art',
    viewBox: '0 0 220 170',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (kind === 'cash') {
    return (
      <svg {...common}>
        <rect x="44" y="48" width="142" height="88" rx="10" transform="rotate(-7 44 48)" />
        <rect x="56" y="38" width="142" height="88" rx="10" transform="rotate(3 56 38)" />
        <circle cx="127" cy="82" r="20" />
        <path d="M127 72v20M119 77h16M119 87h16" />
        <path d="M74 58h14M74 66h8M180 112h-14M180 104h-8" />
        <circle cx="184" cy="134" r="22" />
        <circle cx="174" cy="142" r="17" />
      </svg>
    );
  }
  if (kind === 'wallet') {
    return (
      <svg {...common}>
        <rect x="58" y="36" width="126" height="102" rx="22" transform="rotate(6 58 36)" />
        <path d="M76 58c18-18 49-24 74-13 13 6 22 16 27 27" />
        <path d="M77 104c18 17 52 20 75 5 10-7 17-15 21-25" />
        <rect x="133" y="76" width="47" height="28" rx="10" />
        <circle cx="156" cy="90" r="3" fill="currentColor" stroke="none" />
        <path d="M40 138c33 11 86 10 124-2" opacity=".55" />
        <path d="M35 126c28 8 64 8 91 1" opacity=".35" />
      </svg>
    );
  }
  if (kind === 'credit') {
    return (
      <svg {...common}>
        <rect x="45" y="50" width="156" height="96" rx="14" transform="rotate(-5 45 50)" />
        <path d="M44 74h156" />
        <rect x="66" y="94" width="27" height="20" rx="4" />
        <path d="M73 94v20M66 104h27" />
        <path d="M158 98c9-10 9-20 0-30M168 105c15-18 15-36 0-54M178 112c22-25 22-52 0-77" opacity=".7" />
        <circle cx="187" cy="137" r="24" />
        <circle cx="187" cy="137" r="14" opacity=".55" />
      </svg>
    );
  }
  if (kind === 'other') {
    return (
      <svg {...common}>
        <circle cx="139" cy="88" r="48" />
        <circle cx="139" cy="88" r="31" opacity=".7" />
        <path d="M91 88h96M139 40c18 14 18 82 0 96M139 40c-18 14-18 82 0 96" opacity=".55" />
        <path d="M58 36l12-12M208 142l10-10M52 139l13 10M205 31l-11 12" opacity=".5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M54 138h146M63 138V79M99 138V79M135 138V79M171 138V79M54 79l78-41 78 41M46 79h164" />
      <path d="M90 68l42-22 42 22M81 89h34M81 103h34M81 117h34M135 89h34M135 103h34M135 117h34" opacity=".55" />
      <circle cx="132" cy="93" r="27" opacity=".45" />
      <path d="M132 55v78M95 56c0 40 12 65 37 77M169 56c0 40-12 65-37 77" opacity=".35" />
    </svg>
  );
}

export function AccountTile({
  account,
  balance,
  index,
  onClick,
  onMenu,
  hide,
  active,
}: {
  account: Account;
  balance: number;
  index: number;
  onClick: () => void;
  onMenu?: () => void;
  hide?: boolean;
  active?: boolean;
}) {
  const state = useApp();
  const image = account.imageId ? state.media[account.imageId]?.dataUrl : undefined;
  const limit = account.creditLimit ?? 0;
  const available = account.availableCredit ?? 0;
  const used = Math.max(0, limit - available);
  const utilization = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const kindLabel = ACCOUNT_KIND_LABELS[account.kind];
  const provider =
    account.kind === 'bank'
      ? account.bankName || account.accountType || 'Personal account'
      : account.kind === 'wallet'
        ? account.provider || account.bankName || 'Linked wallet'
        : account.kind === 'credit'
          ? account.provider || account.bankName || 'Personal card'
          : account.kind === 'cash'
            ? 'Physical cash'
            : account.provider || 'Personal account';
  const meta =
    account.kind === 'bank'
      ? [account.branch, account.identifier ? `•••• ${account.identifier.slice(-4)}` : null].filter(Boolean).join('  ·  ')
      : account.kind === 'wallet'
        ? [account.walletId ? `•••• ${account.walletId.slice(-4)}` : null, account.currency].filter(Boolean).join('  ·  ')
        : account.kind === 'credit'
          ? [account.cardType, account.lastFour ? `•••• ${account.lastFour}` : null].filter(Boolean).join('  ·  ')
          : account.kind === 'cash'
            ? [account.accountType, account.currency].filter(Boolean).join('  ·  ')
            : [account.accountType, account.referenceNumber ? `•••• ${account.referenceNumber.slice(-4)}` : null].filter(Boolean).join('  ·  ');
  const balanceLabel = formatMoney(balance, account.currency, { hide });

  return (
    <div
      className={`account-card account-card--${account.kind}${active === false ? ' account-card--quiet' : ''}${active ? ' account-card--active' : ''}`}
      style={{ background: accountGradient(account, index) }}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      onContextMenu={(event) => {
        if (!onMenu) return;
        event.preventDefault();
        onMenu();
      }}
      role="button"
      tabIndex={0}
      aria-label={`${account.name}, ${balanceLabel}. Open account details`}
      aria-haspopup={onMenu ? 'dialog' : undefined}
    >
      <span className="account-card__pattern" aria-hidden />
      <AccountCardArt kind={account.kind} />
      <span className="account-card__top">
        <span className="account-card__identity">
          <span className="account-card__logo">
            {image ? <img src={image} alt="" /> : account.bankName?.slice(0, 1).toUpperCase() || <AccountIcon kind={account.kind} />}
          </span>
          <span className="account-card__provider">
            <span className="account-card__eyebrow">{kindLabel}</span>
            <span className="account-card__bank" title={provider}>{provider}</span>
          </span>
        </span>
        {onMenu ? (
          <button
            type="button"
            className="account-card__menu"
            aria-label={`Quick actions for ${account.name}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onMenu();
            }}
          >
            <MoreHorizontal size={17} />
          </button>
        ) : null}
      </span>
      <span className="account-card__body">
        <span className="account-card__name" title={account.name}>{account.name}</span>
        <span className="account-card__meta" title={meta}>{meta || account.currency}</span>
      </span>
      <span className="account-card__foot">
        <span
          className="account-card__balance"
          style={{ fontSize: `clamp(14px, ${Math.max(15, 27 - Math.max(0, balanceLabel.length - 13) * 0.8)}px, 27px)` }}
          title={balanceLabel}
        >
          {balanceLabel}
        </span>
        <span className="account-card__type">
          {account.kind === 'credit' && limit > 0
            ? `${utilization}% used · ${formatMoney(available, account.currency, { hide, compact: true })} available`
            : `${account.currency}${account.accountType ? ` · ${account.accountType}` : ''}`}
        </span>
      </span>
      {account.kind === 'credit' && limit > 0 ? (
        <span className="account-card__util" aria-hidden>
          <i style={{ width: `${utilization}%` }} />
        </span>
      ) : null}
    </div>
  );
}

export function AccountIcon({ kind }: { kind: Account['kind'] }) {
  if (kind === 'cash') return <Banknote size={18} />;
  if (kind === 'wallet') return <Wallet size={18} />;
  if (kind === 'credit') return <CreditCard size={18} />;
  return <Landmark size={18} />;
}

export function StatBox({ label, value, tone }: { label: string; value: ReactNode; tone?: 'in' | 'out' }) {
  return (
    <div className="meta-box">
      <p className="meta-box__label">{label}</p>
      <p className={`meta-box__value ${tone === 'in' ? 'stat__value--in' : tone === 'out' ? 'stat__value--out' : ''}`}>
        {value}
      </p>
    </div>
  );
}

/** Currency-aware total: shows each currency separately, never mixed. */
export function CurrencyTotals({
  totals,
  hide,
  emptyLabel = '—',
  className,
}: {
  totals: Map<string, number>;
  hide?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const state = useApp();
  const entries = [...totals.entries()].filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const primary = state.settings.currency;
  const sorted = [...entries].sort((a, b) => (a[0] === primary ? -1 : b[0] === primary ? 1 : 0));
  if (!sorted.length) return <span className={className}>{emptyLabel}</span>;
  return (
    <span className={`stack--tight ${className ?? ''}`} style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      {sorted.slice(0, 3).map(([currency, amount]) => (
        <span key={currency}>{formatMoney(amount, currency, { hide })}</span>
      ))}
      {sorted.length > 3 ? <span className="tiny muted">+{sorted.length - 3} more currencies</span> : null}
    </span>
  );
}
