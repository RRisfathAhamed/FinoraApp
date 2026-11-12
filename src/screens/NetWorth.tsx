import { useMemo, useState } from 'react';
import { ChevronRight, CreditCard, Info, Landmark, PiggyBank, TrendingUp } from 'lucide-react';
import { useApp, navigate } from '../lib/hooks';
import {
  accountBalances,
  financialSummary,
  formatDate,
  loanOutstanding,
  todayISO,
} from '../lib/calc';
import { formatMoney } from '../lib/money';
import { Btn, Card, Empty, Screen } from '../components/ui';

/**
 * Full net-worth breakdown. This is the destination behind the Home net-worth
 * tile's "Details" action, so every figure here is derived from the same
 * ledger as the summary (no separately stored running totals).
 */
export default function NetWorthScreen() {
  const state = useApp();
  const hide = state.settings.hideBalances;
  const summary = useMemo(() => financialSummary(state), [state]);
  const balances = useMemo(() => accountBalances(state), [state]);
  const baseCurrency = state.settings.currency;
  const [selected, setSelected] = useState(baseCurrency);

  const currencies = useMemo(() => {
    const set = new Set([...summary.assets.keys(), ...summary.liabilities.keys()]);
    return [...set]
      .filter((code) => (summary.assets.get(code) ?? 0) !== 0 || (summary.liabilities.get(code) ?? 0) !== 0)
      .sort((a, b) => (a === baseCurrency ? -1 : b === baseCurrency ? 1 : a.localeCompare(b)));
  }, [summary, baseCurrency]);

  const currency = currencies.includes(selected) ? selected : currencies[0] ?? baseCurrency;
  const assets = summary.assets.get(currency) ?? 0;
  const liabilities = summary.liabilities.get(currency) ?? 0;
  const netWorth = summary.netWorth.get(currency) ?? 0;
  const cash = summary.cash.get(currency) ?? 0;

  const accounts = state.accounts
    .filter((a) => !a.archived && a.currency === currency)
    .map((account) => ({ account, balance: balances.get(account.id) ?? 0 }));

  const allocatedGoals = state.goals
    .filter((goal) => !goal.archived && goal.currency === currency)
    .map((goal) => ({
      goal,
      amount: goal.contributions
        .filter((entry) => Boolean(entry.accountId))
        .reduce((total, entry) => total + (entry.direction === 'in' ? entry.amount : -entry.amount), 0),
    }))
    .filter((entry) => entry.amount !== 0);

  const investments = state.investments.filter(
    (investment) => !investment.archived && investment.currency === currency && investment.currentValue !== 0,
  );

  const loans = state.loans
    .filter((loan) => loan.status === 'active' && loan.currency === currency)
    .map((loan) => ({ loan, outstanding: loanOutstanding(loan, state.emiPayments) }))
    .filter((entry) => entry.outstanding !== 0);

  if (!currencies.length) {
    return (
      <Screen title="Net worth" subtitle="Assets minus liabilities" back>
        <Card>
          <Empty
            icon={<Landmark size={22} />}
            title="Nothing to total yet"
            body="Add a bank account, cash wallet or card and your net worth appears here and on Home."
            action={<Btn onClick={() => navigate('/money/account/new')}>Add account</Btn>}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Net worth" subtitle={`Assets minus liabilities · ${formatDate(todayISO(), state.settings.dateFormat)}`} back>
      <div className="summary">
        <div className="summary__top">
          <div>
            <p className="summary__label">Net worth · {currency}</p>
            <p className="summary__net">{formatMoney(netWorth, currency, { hide })}</p>
          </div>
          <Landmark size={22} style={{ opacity: 0.85 }} />
        </div>
        <div className="summary__grid">
          <div className="summary__cell">
            <p className="summary__cell-label">Assets</p>
            <p className="summary__cell-value">{formatMoney(assets, currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Liabilities</p>
            <p className="summary__cell-value">{formatMoney(liabilities, currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Available cash</p>
            <p className="summary__cell-value">{formatMoney(cash, currency, { hide })}</p>
          </div>
        </div>
        <div className="summary__foot">
          <span>{accounts.length} accounts</span>
          <span>Never combined across currencies</span>
        </div>
      </div>

      {currencies.length > 1 ? (
        <div className="chip-row" role="tablist" aria-label="Currency">
          {currencies.map((code) => (
            <button
              key={code}
              role="tab"
              aria-selected={code === currency}
              className={`chip ${code === currency ? 'chip--active' : ''}`}
              onClick={() => setSelected(code)}
            >
              {code}
            </button>
          ))}
        </div>
      ) : null}

      <Card className="card--flush">
        <div className="card-head" style={{ padding: '14px 14px 4px' }}>
          <div>
            <h2 className="card-title">Assets</h2>
            <p className="card-sub">Cash, savings you actually set aside, and investments</p>
          </div>
        </div>
        {accounts.filter((entry) => entry.balance > 0).map(({ account, balance }) => (
          <button key={account.id} className="list-row" onClick={() => navigate(`/money/account/${account.id}`)}>
            <span className="list-row__icon"><Landmark size={17} /></span>
            <span className="list-row__text">
              <span className="list-row__title">{account.name}</span>
              <span className="list-row__sub">
                {account.bankName || account.kind} · {account.currency}
              </span>
            </span>
            <span className="list-row__trail">
              <span className="num">{formatMoney(balance, currency, { hide })}</span>
              <ChevronRight size={16} className="muted" />
            </span>
          </button>
        ))}
        {allocatedGoals.map(({ goal, amount }) => (
          <button key={goal.id} className="list-row" onClick={() => navigate('/savings')}>
            <span className="list-row__icon"><PiggyBank size={17} /></span>
            <span className="list-row__text">
              <span className="list-row__title">{goal.name}</span>
              <span className="list-row__sub">Savings allocated from a tracked account</span>
            </span>
            <span className="list-row__trail">
              <span className="num">{formatMoney(amount, currency, { hide })}</span>
              <ChevronRight size={16} className="muted" />
            </span>
          </button>
        ))}
        {investments.map((investment) => (
          <button key={investment.id} className="list-row" onClick={() => navigate('/investments')}>
            <span className="list-row__icon"><TrendingUp size={17} /></span>
            <span className="list-row__text">
              <span className="list-row__title">{investment.name}</span>
              <span className="list-row__sub">{investment.type} · estimated value</span>
            </span>
            <span className="list-row__trail">
              <span className="num">{formatMoney(investment.currentValue, currency, { hide })}</span>
              <ChevronRight size={16} className="muted" />
            </span>
          </button>
        ))}
        {!accounts.some((entry) => entry.balance > 0) && !allocatedGoals.length && !investments.length ? (
          <p className="tiny muted" style={{ padding: '10px 14px 14px' }}>
            No positive asset balances in {currency} yet.
          </p>
        ) : null}
      </Card>

      <Card className="card--flush">
        <div className="card-head" style={{ padding: '14px 14px 4px' }}>
          <div>
            <h2 className="card-title">Liabilities</h2>
            <p className="card-sub">Money you still owe, including loan principal and card debt</p>
          </div>
        </div>
        {accounts.filter((entry) => entry.balance < 0).map(({ account, balance }) => (
          <button key={account.id} className="list-row" onClick={() => navigate(`/money/account/${account.id}`)}>
            <span className="list-row__icon"><CreditCard size={17} /></span>
            <span className="list-row__text">
              <span className="list-row__title">{account.name}</span>
              <span className="list-row__sub">{account.bankName || account.kind} · negative balance</span>
            </span>
            <span className="list-row__trail">
              <span className="num">{formatMoney(-balance, currency, { hide })}</span>
              <ChevronRight size={16} className="muted" />
            </span>
          </button>
        ))}
        {loans.map(({ loan, outstanding }) => (
          <button key={loan.id} className="list-row" onClick={() => navigate(`/loans/${loan.id}`)}>
            <span className="list-row__icon"><Landmark size={17} /></span>
            <span className="list-row__text">
              <span className="list-row__title">{loan.name}</span>
              <span className="list-row__sub">{loan.lender} · outstanding principal</span>
            </span>
            <span className="list-row__trail">
              <span className="num">{formatMoney(outstanding, currency, { hide })}</span>
              <ChevronRight size={16} className="muted" />
            </span>
          </button>
        ))}
        {liabilities === 0 ? (
          <p className="tiny muted" style={{ padding: '10px 14px 14px' }}>
            No liabilities recorded in {currency}.
          </p>
        ) : null}
      </Card>

      <div className="form-note">
        <strong>How this is calculated.</strong> Assets are positive account balances, savings contributions that
        actually left a tracked account, and investment values. Liabilities are outstanding loan principal and
        negative card balances. Net worth = assets − liabilities. Unused credit and expected salary are never
        counted. Currencies are shown separately and are never added to one another.
      </div>

      <div className="banner banner--muted">
        <Info size={16} />
        <span>
          Looking for trends over time? <button className="link-btn" onClick={() => navigate('/insights')}>Open Insights</button>{' '}
          or <button className="link-btn" onClick={() => navigate('/reports')}>generate a report</button>.
        </span>
      </div>
    </Screen>
  );
}
