/**
 * Pure financial calculations. Every function here is deterministic and
 * operates on integer minor units, so UI screens never invent numbers.
 */
import type {
  Account,
  AppState,
  Bill,
  Budget,
  Emi,
  EmiPayment,
  InterestMode,
  Job,
  Loan,
  LoanCategory,
  LoanFrequency,
  SalaryAdjustments,
  SalaryRecord,
  Txn,
} from './types';
import { apportion, sum, totalsByCurrency } from './money';

/* ------------------------------------------------------------------ dates */

export const isoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseISODate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const todayISO = (): string => isoDate(new Date());

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function addMonthsClamped(iso: string, months: number): string {
  const d = parseISODate(iso);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return isoDate(target);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = parseISODate(fromISO).getTime();
  const b = parseISODate(toISO).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  const d = parseISODate(iso);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return isoDate(last);
}

export function startOfWeek(iso: string, weekStartsOn = 1): string {
  const d = parseISODate(iso);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  return addDays(iso, -diff);
}

export function eachDay(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  let cursor = fromISO;
  let guard = 0;
  while (cursor <= toISO && guard < 800) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return out;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatDate(iso: string, format = 'DD MMM YYYY'): string {
  if (!iso) return '';
  const d = parseISODate(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()].slice(0, 3);
  if (format === 'YYYY-MM-DD') return iso;
  if (format === 'MMM DD, YYYY') return `${mon} ${dd}, ${d.getFullYear()}`;
  return `${dd} ${mon} ${d.getFullYear()}`;
}

export function formatMonth(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Every date in a month that falls on a weekday (0=Sun..6=Sat). */
export function weekdayOccurrences(year: number, monthIndex: number, weekday: number): string[] {
  const days: string[] = [];
  const cursor = new Date(year, monthIndex, 1);
  while (cursor.getMonth() === monthIndex) {
    if (cursor.getDay() === weekday) days.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/* ---------------------------------------------------------------- salary */

export const emptyAdjustments = (): SalaryAdjustments => ({
  commission: 0,
  overtimeHours: 0,
  overtimeRate: 0,
  overtimeMultiplier: 1.5,
  overtimeManual: 0,
  allowances: 0,
  bonus: 0,
  unpaidLeave: 0,
  halfDay: 0,
  hourlyDeduction: 0,
  loanDeduction: 0,
  advance: 0,
  tax: 0,
  other: 0,
});

export interface SalaryPeriod {
  periodKey: string;
  date: string;
  base: number;
  index: number;
  count: number;
}

/**
 * Weekly monthly-allocation: the monthly allocation is divided across the
 * actual number of payment weekdays in that calendar month. Rounding remainder
 * is distributed one minor unit at a time so the month totals exactly.
 */
export function salaryPeriods(job: Job, monthISO: string): SalaryPeriod[] {
  const d = parseISODate(monthStart(monthISO));
  if (job.salaryType === 'monthly' || job.salaryType === 'contract') {
    const day = Math.min(job.paymentDay ?? 25, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
    const date = isoDate(new Date(d.getFullYear(), d.getMonth(), day));
    return [{ periodKey: monthKey(date), date, base: job.baseSalary, index: 0, count: 1 }];
  }
  const dates = weekdayOccurrences(d.getFullYear(), d.getMonth(), job.paymentWeekday);
  if (job.salaryType === 'weekly-fixed') {
    return dates.map((date, index) => ({
      periodKey: date,
      date,
      base: job.baseSalary,
      index,
      count: dates.length,
    }));
  }
  const allocation = job.monthlyAllocation ?? 0;
  const parts = apportion(allocation, dates.length);
  return dates.map((date, index) => ({
    periodKey: date,
    date,
    base: parts[index] ?? 0,
    index,
    count: dates.length,
  }));
}

export function salaryBaseFor(job: Job, periodKey: string): number {
  if (job.salaryType === 'weekly-allocation' || job.salaryType === 'weekly-fixed') {
    const periods = salaryPeriods(job, periodKey.slice(0, 7));
    const found = periods.find((p) => p.periodKey === periodKey);
    if (found) return found.base;
  }
  return job.baseSalary;
}

export function overtimeAmount(a: SalaryAdjustments): number {
  if (a.overtimeManual > 0) return Math.round(a.overtimeManual);
  const hours = Math.max(0, a.overtimeHours);
  if (!hours || a.overtimeRate <= 0) return 0;
  return Math.round(hours * a.overtimeRate * (a.overtimeMultiplier || 1));
}

export function salaryGross(record: SalaryRecord, job: Job): number {
  const a = record.adjustments;
  const base = salaryBaseFor(job, record.periodKey);
  const additions = a.commission + overtimeAmount(a) + a.allowances + a.bonus;
  const grossReductions = a.unpaidLeave + a.halfDay + a.hourlyDeduction;
  return Math.max(0, base + additions - grossReductions);
}

export function salaryNet(record: SalaryRecord, job: Job): number {
  const a = record.adjustments;
  const deductions = a.loanDeduction + a.advance + a.tax + a.other;
  return Math.max(0, salaryGross(record, job) - deductions);
}

export function salaryReceived(record: SalaryRecord): number {
  return sum(record.payments.map((p) => p.amount));
}

export function salaryRemaining(record: SalaryRecord, job: Job): number {
  return Math.max(0, salaryNet(record, job) - salaryReceived(record));
}

export function salaryStatus(record: SalaryRecord, job: Job): 'paid' | 'partial' | 'pending' {
  const net = salaryNet(record, job);
  const received = salaryReceived(record);
  if (net > 0 && received >= net) return 'paid';
  if (received > 0) return 'partial';
  return 'pending';
}

export function jobExpectedMonthly(job: Job): number {
  if (job.status === 'ended') return 0;
  if (job.salaryType === 'weekly-allocation') return job.monthlyAllocation ?? 0;
  if (job.salaryType === 'weekly-fixed') {
    const now = parseISODate(todayISO());
    return job.baseSalary * weekdayOccurrences(now.getFullYear(), now.getMonth(), job.paymentWeekday).length;
  }
  return job.baseSalary;
}

/* ------------------------------------------------------------------ loans */

export function loanCategory(loan: Loan): LoanCategory {
  return loan.category ?? 'bank';
}

/** How this loan accrues interest. Old records infer it from the old fields. */
export function loanInterestMode(loan: Loan): InterestMode {
  if (loan.interestMode) return loan.interestMode;
  if (loanCategory(loan) === 'friend') return 'none';
  return loan.method === 'flat' ? 'flat' : 'reducing';
}

/** Informal borrowing: one running balance, any number of part payments. */
export function isFlexibleLoan(loan: Loan): boolean {
  return loanInterestMode(loan) === 'none';
}

/**
 * Build the repayment schedule.
 *
 * - 'reducing' / 'flat' produce normal installments (principal rows always sum
 *   exactly to the principal).
 * - 'none' (friend loans) produces one running balance row so partial payments
 *   reduce the amount owed without inventing interest or terms.
 * - 'interest-only' (gold pawning) charges interest monthly and settles the
 *   pledged principal with the final installment.
 */
export function loanFrequency(loan: Loan): LoanFrequency {
  return loan.frequency ?? 'monthly';
}

export function loanFrequencyLabel(frequency: LoanFrequency): string {
  return {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    annual: 'Annual',
    'end-of-term': 'End of term',
  }[frequency];
}

export function generateSchedule(loan: Loan): Emi[] {
  const n = Math.max(1, Math.round(loan.termMonths));
  const P = Math.max(0, Math.round(loan.principal));
  const annual = loan.annualRate;
  const mode = loanInterestMode(loan);
  const frequency = loanFrequency(loan);
  const stepMonths = frequency === 'quarterly' ? 3 : frequency === 'annual' ? 12 : frequency === 'end-of-term' ? n : 1;
  const periods = Math.max(1, Math.ceil(n / stepMonths));
  // Monthly schedules retain their historical due-date convention (the first
  // row falls on the start date). Other cadences pay at the end of each period.
  const dueDateAt = (index: number) =>
    addMonthsClamped(loan.startDate, Math.min(frequency === 'monthly' ? index : (index + 1) * stepMonths, n));
  const simpleInterest = loan.method === 'flat' || frequency === 'end-of-term';

  if (mode === 'none') {
    const promised =
      loan.promisedDate && /^\d{4}-\d{2}-\d{2}$/.test(loan.promisedDate)
        ? loan.promisedDate
        : addMonthsClamped(loan.startDate, n);
    return [
      {
        id: `${loan.id}:balance`,
        loanId: loan.id,
        index: 1,
        dueDate: promised,
        principalDue: P,
        interestDue: 0,
        totalDue: P,
      },
    ];
  }

  if (mode === 'interest-only') {
    const monthlyRate = Math.max(0, loan.monthlyRate ?? annual / 12);
    const interest = Math.round((P * monthlyRate) / 100);
    const rows: Emi[] = [];
    for (let i = 0; i < n; i += 1) {
      const principalDue = i === n - 1 ? P : 0;
      rows.push({
        id: `${loan.id}:emi:${i + 1}`,
        loanId: loan.id,
        index: i + 1,
        dueDate: addMonthsClamped(loan.startDate, i),
        principalDue,
        interestDue: interest,
        totalDue: principalDue + interest,
      });
    }
    return rows;
  }

  const rows: Emi[] = [];
  let remainingPrincipal = P;

  if (simpleInterest) {
    const principalParts = apportion(P, periods);
    const interestParts = apportion(Math.round((P * annual * n) / 1200), periods);
    for (let i = 0; i < periods; i += 1) {
      const principalDue = principalParts[i];
      const interestDue = interestParts[i];
      rows.push({
        id: `${loan.id}:emi:${i + 1}`,
        loanId: loan.id,
        index: i + 1,
        dueDate: dueDateAt(i),
        principalDue,
        interestDue,
        totalDue: principalDue + interestDue,
      });
    }
    return rows;
  }

  const periodicRate = (annual / 100) * (stepMonths / 12);
  const emi =
    periodicRate === 0
      ? Math.round(P / periods)
      : Math.round((P * periodicRate) / (1 - Math.pow(1 + periodicRate, -periods)));

  for (let i = 0; i < periods; i += 1) {
    const interestDue = Math.round(remainingPrincipal * periodicRate);
    const principalDue = i === periods - 1
      ? remainingPrincipal
      : Math.max(0, Math.min(remainingPrincipal, emi - interestDue));
    remainingPrincipal -= principalDue;
    rows.push({
      id: `${loan.id}:emi:${i + 1}`,
      loanId: loan.id,
      index: i + 1,
      dueDate: dueDateAt(i),
      principalDue,
      interestDue,
      totalDue: principalDue + interestDue,
    });
  }
  return rows;
}

export function emiPaid(payments: EmiPayment[], emiId: string): { amount: number; principal: number; interest: number } {
  let amount = 0;
  let principal = 0;
  let interest = 0;
  for (const p of payments) {
    if (p.emiId !== emiId) continue;
    amount += p.amount;
    principal += p.principal;
    interest += p.interest;
  }
  return { amount, principal, interest };
}

export function emiStatus(
  emi: Emi,
  payments: EmiPayment[],
  today = todayISO(),
): 'paid' | 'partial' | 'overdue' | 'due-soon' | 'upcoming' {
  const paid = emiPaid(payments, emi.id).amount;
  if (paid >= emi.totalDue) return 'paid';
  if (paid > 0) return 'partial';
  const days = daysBetween(today, emi.dueDate);
  if (days < 0) return 'overdue';
  if (days <= 7) return 'due-soon';
  return 'upcoming';
}

/**
 * Split a payment against an EMI. Interest is settled first, then principal;
 * overpayment beyond the remaining EMI amount is rejected.
 */
export type PaymentAllocation = 'auto' | 'principal' | 'interest';

export function splitEmiPayment(
  emi: Emi,
  payments: EmiPayment[],
  amount: number,
  allocation: PaymentAllocation = 'auto',
): { principal: number; interest: number; fees: number } | { error: string } {
  const paid = emiPaid(payments, emi.id);
  const remainingTotal = emi.totalDue - paid.amount;
  if (remainingTotal <= 0) return { error: 'This EMI is already fully paid.' };
  if (amount <= 0) return { error: 'Enter an amount greater than zero.' };
  const interestRemaining = Math.max(0, emi.interestDue - paid.interest);
  const principalRemaining = Math.max(0, emi.principalDue - paid.principal);
  if (allocation === 'principal') {
    if (principalRemaining <= 0) return { error: 'This instalment has no principal left to pay.' };
    if (amount > principalRemaining) return { error: `Principal-only amount exceeds the remaining principal of ${principalRemaining}.` };
    return { principal: amount, interest: 0, fees: 0 };
  }
  if (allocation === 'interest') {
    if (interestRemaining <= 0) return { error: 'This instalment has no interest left to pay.' };
    if (amount > interestRemaining) return { error: `Interest-only amount exceeds the remaining interest of ${interestRemaining}.` };
    return { principal: 0, interest: amount, fees: 0 };
  }
  if (amount > remainingTotal) {
    return { error: `Amount exceeds the remaining balance of this EMI.` };
  }
  const interest = Math.min(amount, Math.min(interestRemaining, remainingTotal));
  const principal = Math.min(principalRemaining, amount - interest);
  const leftover = amount - interest - principal;
  return { principal, interest, fees: leftover };
}

export function loanOutstanding(loan: Loan, payments: EmiPayment[]): number {
  const schedule = generateSchedule(loan);
  return schedule.reduce((total, emi) => {
    const paid = emiPaid(payments, emi.id);
    return total + Math.max(0, emi.principalDue - paid.principal);
  }, 0);
}

/** Every unpaid amount on the existing schedule, shared by preview and action. */
export function loanSettlementRows(
  loan: Loan,
  payments: EmiPayment[],
): { emi: Emi; remaining: number }[] {
  return generateSchedule(loan)
    .map((emi) => ({ emi, remaining: emi.totalDue - emiPaid(payments, emi.id).amount }))
    .filter((row) => row.remaining > 0);
}

export function loanFeesPaid(loan: Loan, payments: EmiPayment[]): number {
  return payments.filter((p) => p.loanId === loan.id).reduce((t, p) => t + p.fees, 0);
}

export function loanPrincipalRepaid(loan: Loan, payments: EmiPayment[]): number {
  return payments.filter((p) => p.loanId === loan.id).reduce((t, p) => t + p.principal, 0);
}

export function loanInterestPaid(loan: Loan, payments: EmiPayment[]): number {
  return payments.filter((p) => p.loanId === loan.id).reduce((t, p) => t + p.interest, 0);
}

export function loanScheduleTotals(loan: Loan): { total: number; interest: number; emi: number } {
  const schedule = generateSchedule(loan);
  const total = sum(schedule.map((e) => e.totalDue));
  const interest = sum(schedule.map((e) => e.interestDue));
  const emi = schedule[0]?.totalDue ?? 0;
  return { total, interest, emi };
}

/* --------------------------------------------------------------- balances */

export interface LedgerEntry {
  accountId: string;
  amount: number;
  date: string;
  description: string;
  source: 'txn' | 'loan' | 'emi' | 'salary' | 'savings';
  refId: string;
}

/**
 * Account balances are derived from a single immutable-in-spirit ledger.
 * Editing or deleting a record automatically corrects every balance, report and
 * chart because nothing stores a stale running total.
 */
export function ledgerEntries(state: AppState): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const account of state.accounts) {
    if (account.openingBalance !== 0) {
      entries.push({
        accountId: account.id,
        amount: account.openingBalance,
        date: account.createdAt.slice(0, 10),
        description: 'Opening balance',
        source: 'txn',
        refId: `opening:${account.id}`,
      });
    }
  }
  for (const t of state.transactions) {
    const label = t.merchant || t.category || 'Transaction';
    if (t.kind === 'income' && t.accountId) {
      entries.push({ accountId: t.accountId, amount: t.amount, date: t.date, description: label, source: 'txn', refId: t.id });
    } else if (t.kind === 'expense' && t.accountId) {
      entries.push({ accountId: t.accountId, amount: -t.amount, date: t.date, description: label, source: 'txn', refId: t.id });
    } else if (t.kind === 'transfer') {
      if (t.accountId) {
        entries.push({ accountId: t.accountId, amount: -t.amount, date: t.date, description: `Transfer to account`, source: 'txn', refId: t.id });
      }
      if (t.toAccountId) {
        entries.push({ accountId: t.toAccountId, amount: t.amount, date: t.date, description: `Transfer received`, source: 'txn', refId: t.id });
      }
    }
  }
  for (const loan of state.loans) {
    if (loan.accountId && loan.amountReceived > 0) {
      entries.push({
        accountId: loan.accountId,
        amount: loan.amountReceived,
        date: loan.startDate,
        description: `Loan disbursement — ${loan.name}`,
        source: 'loan',
        refId: loan.id,
      });
    }
  }
  for (const payment of state.emiPayments) {
    // Payroll-deducted EMIs are remitted by the employer: the employee's
    // account only ever received the net salary, so there is no cash movement.
    if (payment.source === 'salary') continue;
    entries.push({
      accountId: payment.accountId,
      amount: -(payment.amount + payment.fees),
      date: payment.date,
      description: payment.fees > 0 ? 'EMI payment + fees' : 'EMI payment',
      source: 'emi',
      refId: payment.id,
    });
  }
  for (const goal of state.goals) {
    for (const c of goal.contributions) {
      if (!c.accountId) continue;
      entries.push({
        accountId: c.accountId,
        amount: c.direction === 'in' ? -c.amount : c.amount,
        date: c.date,
        description: c.direction === 'in' ? `Savings — ${goal.name}` : `Withdrawal — ${goal.name}`,
        source: 'savings',
        refId: c.id,
      });
    }
  }
  return entries;
}

export function accountBalance(account: Account, entries: LedgerEntry[]): number {
  return entries
    .filter((e) => e.accountId === account.id)
    .reduce((total, e) => total + e.amount, account.openingBalance * 0);
}

export function accountBalances(state: AppState): Map<string, number> {
  const entries = ledgerEntries(state);
  const map = new Map<string, number>();
  for (const account of state.accounts) map.set(account.id, accountBalance(account, entries));
  return map;
}

export interface NetWorthSummary {
  assets: Map<string, number>;
  liabilities: Map<string, number>;
  netWorth: Map<string, number>;
  cash: Map<string, number>;
  cashLow: Map<string, number>;
}

const isLiabilityAccount = (a: Account) => a.kind === 'credit';

export function financialSummary(state: AppState): NetWorthSummary {
  const balances = accountBalances(state);
  const assets = new Map<string, number>();
  const liabilities = new Map<string, number>();
  const cash = new Map<string, number>();
  const cashLow = new Map<string, number>();
  const bump = (map: Map<string, number>, currency: string, amount: number) =>
    map.set(currency, (map.get(currency) ?? 0) + Math.round(amount));

  for (const account of state.accounts) {
    if (account.archived) continue;
    const balance = balances.get(account.id) ?? 0;
    if (isLiabilityAccount(account)) {
      if (balance < 0) {
        bump(liabilities, account.currency, -balance);
        bump(assets, account.currency, 0);
      } else {
        bump(assets, account.currency, balance);
      }
      if (balance < 0) bump(cashLow, account.currency, 0);
    } else {
      if (balance >= 0) bump(assets, account.currency, balance);
      else bump(liabilities, account.currency, -balance);
      bump(cash, account.currency, Math.max(0, balance));
      bump(cashLow, account.currency, balance);
    }
  }

  for (const goal of state.goals) {
    if (goal.archived) continue;
    // Only allocations that actually left a tracked account are a separate
    // asset. Otherwise the same cash would be counted twice (account + goal).
    const accounted = sum(
      goal.contributions
        .filter((c) => Boolean(c.accountId))
        .map((c) => (c.direction === 'in' ? c.amount : -c.amount)),
    );
    if (accounted > 0) bump(assets, goal.currency, accounted);
  }

  for (const inv of state.investments) {
    if (inv.archived) continue;
    if (inv.currentValue > 0) bump(assets, inv.currency, inv.currentValue);
  }

  for (const loan of state.loans) {
    if (loan.status === 'closed') continue;
    bump(liabilities, loan.currency, loanOutstanding(loan, state.emiPayments));
  }

  const netWorth = new Map<string, number>();
  const currencies = new Set([...assets.keys(), ...liabilities.keys()]);
  for (const c of currencies) {
    netWorth.set(c, (assets.get(c) ?? 0) - (liabilities.get(c) ?? 0));
  }
  return { assets, liabilities, netWorth, cash, cashLow };
}

/** All totals for one currency without ever mixing currencies. */
export function currencySum(map: Map<string, number>, currency: string): number {
  return map.get(currency) ?? 0;
}

export function primaryCurrencyTotals(
  entries: { currency: string; amount: number }[],
): Map<string, number> {
  return totalsByCurrency(entries);
}

/* ------------------------------------------------------- income / expense */

export interface PeriodTotals {
  income: number;
  expense: number;
  savings: number;
  savingsRate: number;
  currency: string;
}

export function txnsInRange(state: AppState, from: string, to: string, accountId?: string): Txn[] {
  return state.transactions.filter((t) => {
    if (t.date < from || t.date > to) return false;
    if (accountId && t.accountId !== accountId && t.toAccountId !== accountId) return false;
    return true;
  });
}

/**
 * Income and expense totals for a currency. Transfers and opening balances are
 * deliberately excluded; EMI interest is reported separately as an expense of
 * borrowing rather than as a transaction.
 */
export function periodTotals(
  state: AppState,
  from: string,
  to: string,
  currency: string,
): PeriodTotals {
  let income = 0;
  let expense = 0;
  for (const t of state.transactions) {
    if (t.currency !== currency) continue;
    if (t.date < from || t.date > to) continue;
    if (t.kind === 'income') income += t.amount;
    if (t.kind === 'expense') expense += t.amount;
  }
  const interest = state.emiPayments
    .filter((p) => p.date >= from && p.date <= to)
    .reduce((total, p) => {
      const loan = state.loans.find((l) => l.id === p.loanId);
      return loan?.currency === currency ? total + p.interest + p.fees : total;
    }, 0);
  expense += interest;
  const savings = Math.max(0, income - expense);
  return {
    income,
    expense,
    savings,
    savingsRate: income > 0 ? (savings / income) * 100 : 0,
    currency,
  };
}

export function categorySpend(
  state: AppState,
  from: string,
  to: string,
  currency: string,
): { category: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const t of state.transactions) {
    if (t.kind !== 'expense' || t.currency !== currency) continue;
    if (t.date < from || t.date > to) continue;
    const key = t.category || 'Uncategorised';
    map.set(key, (map.get(key) ?? 0) + t.amount);
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function monthlySeries(
  state: AppState,
  currency: string,
  months: number,
  baseISO = todayISO(),
): { label: string; income: number; expense: number }[] {
  const out: { label: string; income: number; expense: number }[] = [];
  const base = parseISODate(baseISO);
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const from = isoDate(d);
    const to = isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const totals = periodTotals(state, from, to, currency);
    out.push({ label: MONTHS[d.getMonth()].slice(0, 3), income: totals.income, expense: totals.expense });
  }
  return out;
}

/* ---------------------------------------------------------------- budgets */

export function budgetRange(budget: Budget, today = todayISO()): { from: string; to: string } {
  if (budget.period === 'custom') {
    return { from: budget.startDate, to: budget.endDate ?? budget.startDate };
  }
  if (budget.period === 'weekly') {
    const from = startOfWeek(today);
    return { from, to: addDays(from, 6) };
  }
  return { from: monthStart(today), to: monthEnd(today) };
}

export function budgetSpent(state: AppState, budget: Budget, today = todayISO()): number {
  const { from, to } = budgetRange(budget, today);
  return state.transactions
    .filter(
      (t) =>
        t.kind === 'expense' &&
        t.currency === budget.currency &&
        t.date >= from &&
        t.date <= to &&
        (budget.categories.length === 0 || budget.categories.includes(t.category ?? '')),
    )
    .reduce((total, t) => total + t.amount, 0);
}

export function budgetStatus(spent: number, budget: Budget): 'ok' | 'warning' | 'over' {
  if (budget.amount <= 0) return 'ok';
  const ratio = spent / budget.amount;
  if (ratio >= 1) return 'over';
  if (ratio >= budget.alertAt / 100) return 'warning';
  return 'ok';
}

/* ------------------------------------------------------------------ bills */

export function billOccurrences(bill: Bill, fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  if (bill.frequency === 'once') {
    return bill.dueDate >= fromISO && bill.dueDate <= toISO ? [bill.dueDate] : [];
  }
  let cursor = bill.dueDate;
  if (cursor < fromISO) {
    // Step forward to the first occurrence on or after the window start.
    let guard = 0;
    while (cursor < fromISO && guard < 500) {
      cursor =
        bill.frequency === 'weekly'
          ? addDays(cursor, 7)
          : bill.frequency === 'yearly'
            ? addMonthsClamped(cursor, 12)
            : addMonthsClamped(cursor, 1);
      guard += 1;
    }
  }
  let guard = 0;
  while (cursor <= toISO && guard < 500) {
    out.push(cursor);
    cursor =
      bill.frequency === 'weekly'
        ? addDays(cursor, 7)
        : bill.frequency === 'yearly'
          ? addMonthsClamped(cursor, 12)
          : addMonthsClamped(cursor, 1);
    guard += 1;
  }
  return out;
}

export const billDueKey = (billId: string, dueDate: string) => `${billId}:${dueDate}`;

export interface BillOccurrence {
  bill: Bill;
  dueDate: string;
  dueKey: string;
  paid: boolean;
  payment?: { id: string; date: string; amount: number };
  status: 'paid' | 'overdue' | 'due-soon' | 'upcoming';
}

export function billOccurrenceList(
  state: AppState,
  fromISO: string,
  toISO: string,
  today = todayISO(),
): BillOccurrence[] {
  const list: BillOccurrence[] = [];
  for (const bill of state.bills) {
    if (bill.archived) continue;
    for (const dueDate of billOccurrences(bill, fromISO, toISO)) {
      const key = billDueKey(bill.id, dueDate);
      const payment = state.billPayments.find((p) => p.dueKey === key);
      const days = daysBetween(today, dueDate);
      const status: BillOccurrence['status'] = payment
        ? 'paid'
        : days < 0
          ? 'overdue'
          : days <= 7
            ? 'due-soon'
            : 'upcoming';
      list.push({ bill, dueDate, dueKey: key, paid: Boolean(payment), payment, status });
    }
  }
  return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/* -------------------------------------------------------------------- goals */

export function goalBalance(goal: { contributions: { amount: number; direction: 'in' | 'out' }[] }): number {
  return goal.contributions.reduce((total, c) => total + (c.direction === 'in' ? c.amount : -c.amount), 0);
}

export function goalProjection(goal: {
  contributions: { date: string; amount: number; direction: 'in' | 'out' }[];
  target: number;
}): { suggested: number; eta: string | null } {
  const ins = goal.contributions.filter((c) => c.direction === 'in');
  const total = goalBalance(goal);
  const remaining = Math.max(0, goal.target - total);
  if (!ins.length) return { suggested: remaining, eta: null };
  const chronological = [...ins].sort((a, b) => a.date.localeCompare(b.date));
  const first = parseISODate(chronological[0].date).getTime();
  const last = parseISODate(chronological[chronological.length - 1].date).getTime();
  const months = Math.max(1, Math.round((last - first) / (30.44 * 86_400_000)) + 1);
  const avg = sum(ins.map((c) => c.amount)) / months;
  if (avg <= 0) return { suggested: remaining, eta: null };
  const monthsNeeded = Math.ceil(remaining / avg);
  const eta = addMonthsClamped(todayISO(), monthsNeeded);
  return { suggested: Math.round(avg), eta };
}

/* --------------------------------------------------------------- upcoming */

export interface UpcomingItem {
  key: string;
  kind: 'salary' | 'emi' | 'bill' | 'reminder';
  title: string;
  subtitle: string;
  dueDate: string;
  amount: number;
  currency: string;
  status: string;
  link: string;
}

export function upcomingItems(state: AppState, today = todayISO(), horizonDays = 45): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  const until = addDays(today, horizonDays);

  for (const job of state.jobs) {
    if (job.status !== 'active') continue;
    for (const period of salaryPeriods(job, monthKey(today))) {
      const record = state.salaryRecords.find((r) => r.jobId === job.id && r.periodKey === period.periodKey);
      const net = record ? salaryNet(record, job) : period.base;
      const received = record ? salaryReceived(record) : 0;
      if (record && received >= net && net > 0) continue;
      if (period.date >= addDays(today, -10) && period.date <= until) {
        items.push({
          key: `salary:${job.id}:${period.periodKey}`,
          kind: 'salary',
          title: job.company,
          subtitle: record ? 'Salary balance expected' : 'Expected salary',
          dueDate: period.date,
          amount: Math.max(0, net - received),
          currency: job.currency,
          status: period.date < today ? 'overdue' : 'upcoming',
          link: `#/salary/record/${job.id}/${period.periodKey}`,
        });
      }
    }
  }

  for (const loan of state.loans) {
    if (loan.status === 'closed') continue;
    for (const emi of generateSchedule(loan)) {
      const paid = emiPaid(state.emiPayments, emi.id).amount;
      const remaining = emi.totalDue - paid;
      if (remaining <= 0) continue;
      if (emi.dueDate > until) break;
      const status = emiStatus(emi, state.emiPayments, today);
      items.push({
        key: `emi:${emi.id}`,
        kind: 'emi',
        title: loan.name,
        subtitle: isFlexibleLoan(loan)
          ? `Promised repayment · ${emi.dueDate < today ? 'overdue' : 'due'}`
          : `EMI ${emi.index} · ${emi.dueDate < today ? 'overdue' : 'payment'}`,
        dueDate: emi.dueDate,
        amount: remaining,
        currency: loan.currency,
        status,
        link: `#/loans/${loan.id}`,
      });
    }
  }

  for (const occurrence of billOccurrenceList(state, addDays(today, -60), until, today)) {
    if (occurrence.paid) continue;
    items.push({
      key: `bill:${occurrence.dueKey}`,
      kind: 'bill',
      title: occurrence.bill.name,
      subtitle: occurrence.bill.category,
      dueDate: occurrence.dueDate,
      amount: occurrence.bill.amount,
      currency: occurrence.bill.currency,
      status: occurrence.status,
      link: `#/bills`,
    });
  }

  return items
    .filter((i) => i.dueDate <= until)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
