import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { useApp } from '../lib/hooks';
import {
  categorySpend,
  financialSummary,
  formatDate,
  loanFeesPaid,
  loanInterestPaid,
  loanOutstanding,
  loanPrincipalRepaid,
  monthEnd,
  monthStart,
  periodTotals,
  salaryGross,
  salaryNet,
  salaryReceived,
  todayISO,
} from '../lib/calc';
import { formatMoney } from '../lib/money';
import { downloadBlob } from '../lib/files';
import { toast } from '../lib/toast';
import { Btn, Card, Empty, Field, IconBtn, Input, Screen, Select } from '../components/ui';

type ReportKind = 'statement' | 'cashflow' | 'salary' | 'loans' | 'register';

const REPORTS: { value: ReportKind; label: string; hint: string }[] = [
  { value: 'statement', label: 'Financial statement', hint: 'Assets, liabilities, net worth and period cash flow' },
  { value: 'cashflow', label: 'Cash flow statement', hint: 'Where income came from and where it went' },
  { value: 'salary', label: 'Salary register', hint: 'Gross, net and received pay per payroll period' },
  { value: 'loans', label: 'Loan statement', hint: 'Outstanding principal, repaid principal and interest' },
  { value: 'register', label: 'Transaction register', hint: 'Every movement in the period with account details' },
];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function ReportsScreen() {
  const state = useApp();
  const hide = state.settings.hideBalances;
  const [kind, setKind] = useState<ReportKind>('statement');
  const [from, setFrom] = useState(monthStart(todayISO()));
  const [to, setTo] = useState(monthEnd(todayISO()));
  const [currency, setCurrency] = useState(state.settings.currency);

  const report = REPORTS.find((entry) => entry.value === kind) ?? REPORTS[0];
  const range = from <= to ? { from, to } : { from: to, to: from };

  const summary = useMemo(() => financialSummary(state), [state]);
  const totals = useMemo(
    () => periodTotals(state, range.from, range.to, currency),
    [state, range, currency],
  );
  const spending = useMemo(
    () => categorySpend(state, range.from, range.to, currency),
    [state, range, currency],
  );

  const periodTxns = useMemo(
    () =>
      state.transactions
        .filter((txn) => txn.currency === currency && txn.date >= range.from && txn.date <= range.to)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
    [state.transactions, currency, range],
  );

  const rows: { label: string; value: number }[] = useMemo(() => {
    if (kind === 'cashflow') {
      return [
        { label: 'Income', value: totals.income },
        { label: 'Expenses', value: totals.expense },
        { label: 'Savings', value: totals.savings },
        ...spending.map((row) => ({ label: `Spent on ${row.category}`, value: row.amount })),
      ];
    }
    if (kind === 'salary') {
      return state.salaryRecords
        .filter((record) => {
          const job = state.jobs.find((entry) => entry.id === record.jobId);
          return job?.currency === currency && record.periodDate >= range.from && record.periodDate <= range.to;
        })
        .flatMap((record) => {
          const job = state.jobs.find((entry) => entry.id === record.jobId);
          if (!job) return [];
          return [
            { label: `${job.company} · ${record.periodKey} — gross`, value: salaryGross(record, job) },
            { label: `${job.company} · ${record.periodKey} — net`, value: salaryNet(record, job) },
            { label: `${job.company} · ${record.periodKey} — received`, value: salaryReceived(record) },
          ];
        });
    }
    if (kind === 'loans') {
      return state.loans
        .filter((loan) => loan.currency === currency)
        .flatMap((loan) => [
          { label: `${loan.name} — outstanding principal`, value: loanOutstanding(loan, state.emiPayments) },
          { label: `${loan.name} — principal repaid`, value: loanPrincipalRepaid(loan, state.emiPayments) },
          { label: `${loan.name} — interest paid`, value: loanInterestPaid(loan, state.emiPayments) },
          { label: `${loan.name} — fees paid`, value: loanFeesPaid(loan, state.emiPayments) },
        ]);
    }
    return [
      { label: 'Assets', value: summary.assets.get(currency) ?? 0 },
      { label: 'Liabilities', value: summary.liabilities.get(currency) ?? 0 },
      { label: 'Net worth', value: summary.netWorth.get(currency) ?? 0 },
      { label: 'Available cash', value: summary.cash.get(currency) ?? 0 },
      { label: `Income · ${range.from} to ${range.to}`, value: totals.income },
      { label: `Expenses · ${range.from} to ${range.to}`, value: totals.expense },
    ];
  }, [kind, totals, spending, state, currency, summary, range]);

  const currencies = useMemo(() => {
    const set = new Set<string>([state.settings.currency]);
    for (const account of state.accounts) set.add(account.currency);
    for (const loan of state.loans) set.add(loan.currency);
    return [...set];
  }, [state]);

  const exportCsv = () => {
    const lines: string[] = [
      `Finora report,${csvCell(report.label)}`,
      `From,${range.from}`,
      `To,${range.to}`,
      `Currency,${currency}`,
      `Generated,${todayISO()}`,
      '',
    ];
    if (kind === 'register') {
      lines.push('Date,Kind,Description,Category,Account,Amount,Currency');
      for (const txn of periodTxns) {
        const account = state.accounts.find((entry) => entry.id === txn.accountId)?.name ?? '';
        lines.push(
          [
            txn.date,
            txn.kind,
            csvCell(txn.merchant ?? txn.notes ?? ''),
            csvCell(txn.category ?? ''),
            csvCell(account),
            (txn.amount / 100).toFixed(2),
            txn.currency,
          ].join(','),
        );
      }
    } else {
      lines.push('Item,Amount,Currency');
      for (const row of rows) lines.push(`${csvCell(row.label)},${(row.value / 100).toFixed(2)},${currency}`);
    }
    downloadBlob(`finora-${kind}-${range.from}-to-${range.to}.csv`, new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    toast('Report exported as CSV');
  };

  const printable = rows.length > 0 || periodTxns.length > 0;

  return (
    <Screen
      title="Reports"
      subtitle="Statements, registers and exports"
      back
      actions={
        <>
          <IconBtn label="Export report as CSV" onClick={exportCsv}><Download size={18} /></IconBtn>
          <IconBtn label="Print report" onClick={() => window.print()}><Printer size={18} /></IconBtn>
        </>
      }
    >
      <Card className="card--soft">
        <Field label="Report" hint={report.hint}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
            {REPORTS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </Select>
        </Field>
        <div className="row">
          <Field label="From">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Field label="Currency">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
          </Select>
        </Field>
      </Card>

      <Card>
        <div className="report-head">
          <div>
            <p className="report-head__brand">Finora</p>
            <h2 className="card-title">{report.label}</h2>
            <p className="card-sub">
              {formatDate(range.from)} – {formatDate(range.to)} · {currency}
            </p>
          </div>
          <FileSpreadsheet size={22} className="muted" />
        </div>

        {kind === 'register' ? (
          periodTxns.length ? (
            <div className="report-table">
              {periodTxns.map((txn) => (
                <div key={txn.id} className="report-table__row">
                  <span className="report-table__date">{txn.date}</span>
                  <span className="report-table__label">
                    {txn.merchant || txn.category || (txn.kind === 'transfer' ? 'Transfer' : txn.kind)}
                    <span className="tiny muted">
                      {txn.category ? `${txn.category} · ` : ''}
                      {state.accounts.find((entry) => entry.id === txn.accountId)?.name ?? 'No account'}
                    </span>
                  </span>
                  <span className={`report-table__amount ${txn.kind === 'income' ? 'stat__value--in' : ''}`}>
                    {txn.kind === 'income' ? '+' : txn.kind === 'expense' ? '−' : ''}
                    {formatMoney(txn.amount, txn.currency, { hide })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No transactions in this period" body="Choose a wider date range or another currency." />
          )
        ) : rows.length ? (
          <>
            <div className="report-table">
              {rows.map((row, index) => (
                <div key={`${row.label}-${index}`} className="report-table__row">
                  <span className="report-table__label">{row.label}</span>
                  <span className="report-table__amount num">{formatMoney(row.value, currency, { hide })}</span>
                </div>
              ))}
            </div>
            <div className="report-foot">
              <span>{kind === 'statement' ? `${periodTxns.length} movements in period` : `${rows.length} lines`}</span>
              <span>{currency}</span>
            </div>
          </>
        ) : (
          <Empty title="Nothing to report yet" body="Record accounts, salary, loans or transactions and this statement fills in from your real records." />
        )}

        {!printable ? null : (
          <p className="tiny muted" style={{ marginTop: 10 }}>
            Generated from your on-device records. Transfer and loan proceeds are excluded from income; unpaid expected
            salary is never included.
          </p>
        )}
      </Card>

      <div className="banner banner--muted">
        <span>
          Looking for charts and trends instead? <button className="link-btn" onClick={() => (window.location.hash = '/insights')}>Open Insights</button>.
          PDF export uses your browser’s print-to-PDF.
        </span>
      </div>

      <Btn variant="soft" block icon={<Download size={17} />} onClick={exportCsv}>
        Export this report as CSV
      </Btn>
      <Btn variant="soft" block icon={<Printer size={17} />} onClick={() => window.print()}>
        Print or save as PDF
      </Btn>
    </Screen>
  );
}
