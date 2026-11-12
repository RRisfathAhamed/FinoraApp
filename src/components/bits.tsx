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
  const subtitle = showAccount
    ? `${txn.date}${accountLabel ? ` · ${accountLabel}` : ''}`
    : `${txn.date}${txn.category ? ` · ${txn.category}` : ''}`;
  return (
    <button className="txn" onClick={onClick} disabled={!onClick}>
      <CategoryIcon category={txn.category} kind={txn.kind} />
      <span className="txn__text">
        <span className="txn__title">{title}</span>
        <span className="txn__sub">{subtitle}</span>
      </span>
      <span className={`txn__amount ${txn.kind === 'income' ? 'txn__amount--in' : ''}`}>
        {txn.kind === 'income' ? '+' : txn.kind === 'expense' ? '−' : ''}
        {formatMoney(txn.amount, txn.currency, { hide })}
      </span>
    </button>
  );
}

const ACCOUNT_GRADIENTS = [
  'linear-gradient(135deg,#0e9f78,#0b7d78)',
  'linear-gradient(135deg,#3b6fd4,#274a94)',
  'linear-gradient(135deg,#8a5cd6,#5b3b96)',
  'linear-gradient(135deg,#c07a2e,#8e531d)',
  'linear-gradient(135deg,#2b8fa8,#1a6376)',
  'linear-gradient(135deg,#b94a74,#8a2f52)',
];

export function accountGradient(account: Account, index: number): string {
  if (account.color) return account.color;
  let hash = 0;
  for (const ch of account.id) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return ACCOUNT_GRADIENTS[(hash + index) % ACCOUNT_GRADIENTS.length];
}

export function AccountTile({
  account,
  balance,
  index,
  onClick,
  hide,
}: {
  account: Account;
  balance: number;
  index: number;
  onClick: () => void;
  hide?: boolean;
}) {
  const state = useApp();
  const image = account.imageId ? state.media[account.imageId]?.dataUrl : undefined;
  return (
    <button
      className="account-card"
      style={{ background: accountGradient(account, index) }}
      onClick={onClick}
    >
      <span className="account-card__top">
        <span>
          <span className="account-card__name">{account.name}</span>
          <span className="account-card__meta">
            {account.identifier ? `•• ${account.identifier}` : account.kind}
          </span>
        </span>
        <span className="account-card__logo">
          {image ? <img src={image} alt="" /> : account.bankName?.slice(0, 1).toUpperCase() || <Landmark size={16} />}
        </span>
      </span>
      <span className="account-card__balance">
        {formatMoney(balance, account.currency, { hide })}
      </span>
      <span className="account-card__type">
        {account.bankName ? `${account.bankName} · ` : ''}
        {account.kind} · {account.currency}
      </span>
    </button>
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
