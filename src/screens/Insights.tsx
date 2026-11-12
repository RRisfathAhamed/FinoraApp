import { useMemo, useState } from 'react';
import { BarChart3, Download, Printer } from 'lucide-react';
import type { AppState } from '../lib/types';
import { useApp } from '../lib/hooks';
import {
  addMonthsClamped,
  budgetSpent,
  categorySpend,
  formatDate,
  goalBalance,
  loanInterestPaid,
  loanOutstanding,
  loanPrincipalRepaid,
  monthEnd,
  monthStart,
  monthlySeries,
  periodTotals,
  salaryGross,
  salaryNet,
  salaryReceived,
  todayISO,
} from '../lib/calc';
import { formatMoney } from '../lib/money';
import { downloadBlob } from '../lib/files';
import { toast } from '../lib/toast';
import {
  Btn,
  Card,
  Empty,
  Field,
  IconBtn,
  Input,
  Screen,
  Select,
} from '../components/ui';
import { IncomeExpenseBars, Donut } from '../components/charts';
import { ALL_CATEGORIES } from '../lib/categories';

type ReportId = 'overview' | 'categories' | 'salary' | 'loans' | 'budgets' | 'savings' | 'networth';

const REPORTS: { id: ReportId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'categories', label: 'Categories' },
  { id: 'salary', label: 'Salary' },
  { id: 'loans', label: 'Loans' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'savings', label: 'Savings' },
  { id: 'networth', label: 'Net worth' },
];

type Preset = 'month' | 'last' | '3m' | '6m' | 'year' | 'custom';

const PALETTE = ['#0e9f78', '#3b6fd4', '#c07a2e', '#8a5cd6', '#b94a74', '#2b8fa8', '#7d8f2e'];

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function Table({ rows, currency, hide }: { rows: { label: string; value: number }[]; currency: string; hide?: boolean }) {
  return (
    <div className="card--flush">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className="list-row" style={{ minHeight: 44 }}>
          <span className="list-row__text"><span className="list-row__title">{row.label}</span></span>
          <span className="list-row__trail num">{formatMoney(row.value, currency, { hide })}</span>
        </div>
      ))}
    </div>
  );
}

export default function InsightsScreen() {
  const state = useApp();
  const hide = state.settings.hideBalances;
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState(monthStart(todayISO()));
  const [to, setTo] = useState(monthEnd(todayISO()));
  const [report, setReport] = useState<ReportId>('overview');
  const [currency, setCurrency] = useState(state.settings.currency);
  const [accountId, setAccountId] = useState('');
  const [category, setCategory] = useState('');

  const range = useMemo(() => {
    const today = todayISO();
    if (preset === 'custom') return { from, to };
    if (preset === 'month') return { from: monthStart(today), to: monthEnd(today) };
    if (preset === 'last') {
      const start = addMonthsClamped(monthStart(today), -1);
      return { from: start, to: monthEnd(start) };
    }
    if (preset === '3m') return { from: addMonthsClamped(monthStart(today), -2), to: monthEnd(today) };
    if (preset === '6m') return { from: addMonthsClamped(monthStart(today), -5), to: monthEnd(today) };
    return { from: `${today.slice(0, 4)}-01-01`, to: monthEnd(today) };
  }, [preset, from, to]);

  const currencies = useMemo(() => {
    const set = new Set(state.transactions.map((t) => t.currency));
    set.add(state.settings.currency);
    set.add(currency);
    return [...set];
  }, [state.transactions, state.settings.currency, currency]);

  const txns = useMemo(
    () =>
      state.transactions.filter((t) => {
        if (t.currency !== currency) return false;
        if (t.date < range.from || t.date > range.to) return false;
        if (accountId && t.accountId !== accountId && t.toAccountId !== accountId) return false;
        if (category && t.category !== category) return false;
        return true;
      }),
    [state.transactions, currency, range, accountId, category],
  );

  const income = txns.filter((t) => t.kind === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = txns.filter((t) => t.kind === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const interest = useMemo(
    () =>
      state.emiPayments
        .filter((p) => p.date >= range.from && p.date <= range.to)
        .reduce((sum, p) => {
          const loan = state.loans.find((l) => l.id === p.loanId);
          return loan?.currency === currency ? sum + p.interest + p.fees : sum;
        }, 0),
    [state.emiPayments, state.loans, range, currency],
  );
  const totalExpense = expense + interest;
  const savings = Math.max(0, income - totalExpense);
  const totals = useMemo(
    () => periodTotals(state, range.from, range.to, currency),
    [state, range, currency],
  );
  const series = useMemo(() => monthlySeries(state, currency, 6), [state, currency]);
  const spend = useMemo(
    () => categorySpend(state, range.from, range.to, currency).filter((row) => !category || row.category === category),
    [state, range, currency, category],
  );

  const summary = useMemo(() => {
    const assets = new Map<string, number>();
    const liabilities = new Map<string, number>();
    const cash = new Map<string, number>();
    for (const acc of state.accounts.filter((a) => !a.archived)) {
      if (acc.currency !== currency) continue;
      const balance = accountBalanceOf(state, acc.id);
      if (acc.kind === 'credit' && balance < 0) liabilities.set(currency, (liabilities.get(currency) ?? 0) - balance);
      else if (balance >= 0) {
        assets.set(currency, (assets.get(currency) ?? 0) + balance);
        cash.set(currency, (cash.get(currency) ?? 0) + balance);
      } else liabilities.set(currency, (liabilities.get(currency) ?? 0) - balance);
    }
    for (const loan of state.loans.filter((l) => l.status === 'active' && l.currency === currency)) {
      liabilities.set(currency, (liabilities.get(currency) ?? 0) + loanOutstanding(loan, state.emiPayments));
    }
    for (const inv of state.investments.filter((i) => !i.archived && i.currency === currency)) {
      assets.set(currency, (assets.get(currency) ?? 0) + inv.currentValue);
    }
    for (const goal of state.goals.filter((g) => !g.archived && g.currency === currency)) {
      assets.set(currency, (assets.get(currency) ?? 0) + goalBalance(goal));
    }
    return {
      assets: assets.get(currency) ?? 0,
      liabilities: liabilities.get(currency) ?? 0,
      cash: cash.get(currency) ?? 0,
    };
  }, [state, currency]);

  const salaryRows = useMemo(
    () =>
      state.salaryRecords
        .filter((record) => record.periodDate >= range.from && record.periodDate <= range.to)
        .map((record) => {
          const job = state.jobs.find((j) => j.id === record.jobId);
          if (!job || job.currency !== currency) return null;
          return {
            key: record.id,
            label: `${job.company} · ${record.periodKey}`,
            gross: salaryGross(record, job),
            net: salaryNet(record, job),
            received: salaryReceived(record),
          };
        })
        .filter((row): row is { key: string; label: string; gross: number; net: number; received: number } => Boolean(row)),
    [state, range, currency],
  );

  const loanRows = useMemo(
    () =>
      state.loans
        .filter((loan) => loan.currency === currency)
        .map((loan) => {
          const paymentsInRange = state.emiPayments.filter((p) => p.loanId === loan.id && p.date >= range.from && p.date <= range.to);
          return {
            loan,
            interest: paymentsInRange.reduce((t, p) => t + p.interest + p.fees, 0),
            principal: paymentsInRange.reduce((t, p) => t + p.principal, 0),
            paid: paymentsInRange.reduce((t, p) => t + p.amount, 0),
          };
        }),
    [state, range, currency],
  );

  const reportRows: { label: string; value: number }[] = useMemo(() => {
    switch (report) {
      case 'categories':
        return spend.map((row) => ({ label: row.category, value: row.amount }));
      case 'salary':
        return salaryRows.flatMap((row) => [
          { label: `${row.label} — net`, value: row.net },
          { label: `${row.label} — received`, value: row.received },
        ]);
      case 'loans':
        return loanRows.flatMap((row) => [
          { label: `${row.loan.name} — principal repaid`, value: row.principal },
          { label: `${row.loan.name} — interest & fees`, value: row.interest },
        ]);
      case 'budgets':
        return state.budgets
          .filter((b) => !b.archived && b.currency === currency)
          .map((b) => ({ label: `${b.name} — spent`, value: budgetSpent(state, b) }));
      case 'savings':
        return state.goals
          .filter((g) => !g.archived && g.currency === currency)
          .map((g) => ({ label: g.name, value: goalBalance(g) }));
      case 'networth':
        return [
          { label: 'Assets', value: summary.assets },
          { label: 'Liabilities', value: summary.liabilities },
          { label: 'Available cash', value: summary.cash },
          { label: 'Net worth', value: summary.assets - summary.liabilities },
        ];
      default:
        return [
          { label: 'Income', value: income },
          { label: 'Expenses', value: totalExpense },
          { label: 'Savings', value: savings },
          { label: 'Net worth', value: summary.assets - summary.liabilities },
        ];
    }
  }, [report, spend, salaryRows, loanRows, state, currency, summary, income, totalExpense, savings]);

  const exportCsv = () => {
    const escapeRows = reportRows.map((row) => `${csvEscape(row.label)},${(row.value / 100).toFixed(2)},${csvEscape(currency)}`);
    const csv = `\ufeffReport,${report}\nFrom,${range.from}\nTo,${range.to}\nCurrency,${currency}\n\nItem,Amount,Currency\n${escapeRows.join('\n')}`;
    downloadBlob(`finora-${report}-${range.from}-to-${range.to}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    toast('Report exported as CSV');
  };

  const donutSlices = (() => {
    const top = spend.slice(0, 5);
    const rest = spend.slice(5).reduce((t, row) => t + row.amount, 0);
    const slices = top.map((row, i) => ({ label: row.category, value: row.amount, color: PALETTE[i % PALETTE.length] }));
    if (rest > 0) slices.push({ label: 'Other', value: rest, color: 'var(--muted)' });
    return slices;
  })();

  return (
    <Screen
      title="Insights"
      subtitle="Reports from your real financial records"
      back
      actions={
        <>
          <IconBtn label="Export CSV" onClick={exportCsv}><Download size={18} /></IconBtn>
          <IconBtn label="Print report" onClick={() => window.print()}><Printer size={18} /></IconBtn>
        </>
      }
    >
      <div className="chip-row">
        {([
          ['month', 'This month'],
          ['last', 'Last month'],
          ['3m', '3 months'],
          ['6m', '6 months'],
          ['year', 'This year'],
          ['custom', 'Custom'],
        ] as [Preset, string][]).map(([value, label]) => (
          <button
            key={value}
            className={`chip ${preset === value ? 'chip--active' : ''}`}
            onClick={() => setPreset(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {preset === 'custom' ? (
        <div className="row">
          <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      ) : null}

      <Card className="card--soft">
        <div className="spread">
          <span className="tiny muted">{formatDate(range.from)} – {formatDate(range.to)}</span>
          <span className="tiny muted">{txns.length} transactions</span>
        </div>
        <div className="row">
          <Field label="Currency">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Account">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">All accounts</option>
            {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      </Card>

      <div className="chip-row">
        {REPORTS.map((r) => (
          <button key={r.id} className={`chip ${report === r.id ? 'chip--active' : ''}`} onClick={() => setReport(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="stat-grid">
        <div className="stat">
          <p className="stat__label">Income</p>
          <p className="stat__value stat__value--in">{formatMoney(income, currency, { hide })}</p>
        </div>
        <div className="stat">
          <p className="stat__label">Expenses</p>
          <p className="stat__value stat__value--out">{formatMoney(totalExpense, currency, { hide })}</p>
        </div>
        <div className="stat">
          <p className="stat__label">Saved</p>
          <p className="stat__value">{formatMoney(savings, currency, { hide })}</p>
        </div>
        <div className="stat">
          <p className="stat__label">Savings rate</p>
          <p className="stat__value">{income > 0 ? `${Math.round((savings / income) * 100)}%` : '—'}</p>
        </div>
      </div>

      {report === 'overview' ? (
        <>
          <Card>
            <div className="spread">
              <h2 className="card-title">Income vs expenses</h2>
              <span className="tiny muted">Last 6 months</span>
            </div>
            <IncomeExpenseBars data={series} currency={currency} hide={hide} />
          </Card>

          {donutSlices.length ? (
            <Card>
              <h2 className="card-title">Where money went</h2>
              <div className="hstack" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                <Donut slices={donutSlices} total={donutSlices.reduce((t, s) => t + s.value, 0)} currency={currency} hide={hide} />
                <div className="stack--tight" style={{ flex: 1, minWidth: 140 }}>
                  {donutSlices.map((slice) => (
                    <div key={slice.label} className="spread">
                      <span className="hstack tiny">
                        <i className="dot" style={{ background: slice.color }} />
                        {slice.label}
                      </span>
                      <span className="tiny num">{formatMoney(slice.value, currency, { compact: true, hide })}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <h2 className="card-title">Income and expense report</h2>
            <Table rows={reportRows} currency={currency} hide={hide} />
            <p className="tiny muted">
              Interest and fees from loan EMIs are included as expenses of borrowing. Transfers and opening balances are excluded.
            </p>
          </Card>
        </>
      ) : report === 'categories' ? (
        <Card>
          <div className="spread">
            <h2 className="card-title">Expense categories</h2>
            <span className="tiny muted">Excludes transfers</span>
          </div>
          {spend.length ? (
            <>
              <Table rows={spend.map((row) => ({ label: row.category, value: row.amount }))} currency={currency} hide={hide} />
              <div className="stack--tight">
                {spend.map((row, i) => (
                  <div key={row.category}>
                    <div className="progress-line">
                      <span>{row.category}</span>
                      <strong>{Math.round((row.amount / Math.max(1, expense)) * 100)}%</strong>
                    </div>
                    <div className="progress">
                      <span className="progress__bar" style={{ width: `${(row.amount / Math.max(1, expense)) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty title="No expenses in this period" body="Try a wider date range or another account." />
          )}
        </Card>
      ) : report === 'salary' ? (
        <Card>
          <h2 className="card-title">Salary report</h2>
          {salaryRows.length ? (
            <>
              <Table rows={reportRows} currency={currency} hide={hide} />
              <p className="tiny muted">Only received salary payments affect cash and income. Expected salary never does.</p>
            </>
          ) : (
            <Empty title="No salary records in this period" body="Record a payroll period to see gross, net and received amounts." />
          )}
        </Card>
      ) : report === 'loans' ? (
        <Card>
          <h2 className="card-title">Loan and interest report</h2>
          {loanRows.length ? (
            <>
              <Table rows={reportRows} currency={currency} hide={hide} />
              {loanRows.map((row) => (
                <div key={row.loan.id} className="meta-grid">
                  <div className="meta-box">
                    <p className="meta-box__label">{row.loan.name} outstanding</p>
                    <p className="meta-box__value">{formatMoney(loanOutstanding(row.loan, state.emiPayments), currency, { hide })}</p>
                  </div>
                  <div className="meta-box">
                    <p className="meta-box__label">Paid in period</p>
                    <p className="meta-box__value">{formatMoney(row.paid, currency, { hide })}</p>
                  </div>
                </div>
              ))}
              <p className="tiny muted">
                Principal repaid in this period: {formatMoney(loanRows.reduce((t, r) => t + loanPrincipalRepaid(r.loan, state.emiPayments), 0), currency, { hide })}
                · Interest recorded: {formatMoney(loanRows.reduce((t, r) => t + loanInterestPaid(r.loan, state.emiPayments), 0), currency, { hide })}
              </p>
            </>
          ) : (
            <Empty title="No loans" body="Add a loan to see repayment and interest reporting." />
          )}
        </Card>
      ) : report === 'budgets' ? (
        <Card>
          <h2 className="card-title">Budget report</h2>
          {state.budgets.some((b) => !b.archived) ? (
            <>
              <Table rows={reportRows} currency={currency} hide={hide} />
              <p className="tiny muted">Budgets are measured against current period expenses, not the report date range.</p>
            </>
          ) : (
            <Empty title="No budgets" body="Create a budget to compare planned and actual spending." />
          )}
        </Card>
      ) : report === 'savings' ? (
        <Card>
          <h2 className="card-title">Savings report</h2>
          {state.goals.some((g) => !g.archived) ? (
            <>
              <Table rows={reportRows} currency={currency} hide={hide} />
              <p className="tiny muted">
                Savings allocations move money between your own accounts and goals; they are not expenses or income.
              </p>
            </>
          ) : (
            <Empty title="No savings goals" body="Create a goal to track progress." />
          )}
        </Card>
      ) : (
        <Card>
          <h2 className="card-title">Net worth & assets</h2>
          <Table rows={reportRows} currency={currency} hide={hide} />
          <div className="form-note">
            Current position in {currency}. Finora never converts or adds different currencies together.
            Assets include account balances, investments and allocated savings. Liabilities include loan principal outstanding and negative card balances.
          </div>
          <p className="tiny muted">Period cash flow: income {formatMoney(totals.income, currency, { hide })} · expenses {formatMoney(totals.expense, currency, { hide })}</p>
        </Card>
      )}

      <div className="banner banner--muted">
        <BarChart3 size={16} />
        <span>
          CSV export is available from the header. PDF export uses your browser’s print-to-PDF when supported by your device.
        </span>
      </div>

      <Btn variant="soft" block icon={<Download size={17} />} onClick={exportCsv}>Export this report as CSV</Btn>
    </Screen>
  );
}

function accountBalanceOf(state: AppState, accountId: string): number {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) return 0;
  let balance = account.openingBalance;
  for (const t of state.transactions) {
    if (t.kind === 'income' && t.accountId === accountId) balance += t.amount;
    if (t.kind === 'expense' && t.accountId === accountId) balance -= t.amount;
    if (t.kind === 'transfer' && t.accountId === accountId) balance -= t.amount;
    if (t.kind === 'transfer' && t.toAccountId === accountId) balance += t.amount;
  }
  for (const loan of state.loans) if (loan.accountId === accountId) balance += loan.amountReceived;
  for (const p of state.emiPayments) if (p.accountId === accountId && p.source !== 'salary') balance -= p.amount + p.fees;
  for (const goal of state.goals) {
    for (const c of goal.contributions) {
      if (c.accountId !== accountId) continue;
      balance += c.direction === 'in' ? -c.amount : c.amount;
    }
  }
  return balance;
}

