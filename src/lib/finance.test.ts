import { describe, expect, it } from 'vitest';
import type { AppState, Budget, EmiPayment, Job, Loan, SalaryRecord, Txn } from './types';
import {
  accountBalances,
  billOccurrences,
  budgetSpent,
  emptyAdjustments,
  financialSummary,
  generateSchedule,
  goalBalance,
  emiPaid,
  ledgerEntries,
  loanOutstanding,
  periodTotals,
  salaryBaseFor,
  salaryGross,
  salaryNet,
  salaryPeriods,
  salaryReceived,
  splitEmiPayment,
  upcomingItems,
} from './calc';
import { apportion as _apportion, formatMoney, parseAmount, toDecimalString } from './money';

const amount = (major: number) => Math.round(major * 100);

function baseState(): AppState {
  return {
    schemaVersion: 1,
    profile: { name: 'Test', email: 't@example.com' },
    settings: {
      theme: 'light',
      currency: 'LKR',
      dateFormat: 'DD MMM YYYY',
      numberFormat: 'standard',
      hideBalances: false,
      notifySalary: true,
      notifyEmi: true,
      notifyBills: true,
      notifyBudgets: true,
      notifySavings: true,
      remindDays: 3,
      dashboard: { order: [], hidden: [] },
    },
    accounts: [],
    transactions: [],
    jobs: [],
    salaryRecords: [],
    loans: [],
    emiPayments: [],
    budgets: [],
    goals: [],
    investments: [],
    bills: [],
    billPayments: [],
    documents: [],
    media: {},
    smsDrafts: [],
    reminders: [],
    readNotifKeys: [],
    deletedNotifKeys: [],
    recentSearches: [],
  };
}

const job = (overrides: Partial<Job> = {}): Job => ({
  id: 'job1',
  company: 'Acme',
  title: 'Engineer',
  salaryType: 'monthly',
  currency: 'LKR',
  baseSalary: amount(20000),
  paymentWeekday: 5,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const loan = (overrides: Partial<Loan> = {}): Loan => ({
  id: 'loan1',
  name: 'Car loan',
  lender: 'Bank',
  currency: 'LKR',
  principal: amount(100000),
  amountReceived: amount(100000),
  annualRate: 12,
  method: 'reducing',
  termMonths: 12,
  startDate: '2026-01-15',
  status: 'active',
  createdAt: '2026-01-15T00:00:00.000Z',
  ...overrides,
});

const record = (overrides: Partial<SalaryRecord> = {}): SalaryRecord => ({
  id: 'rec1',
  jobId: 'job1',
  periodKey: '2026-01',
  periodDate: '2026-01-25',
  adjustments: emptyAdjustments(),
  payments: [],
  loanPostings: [],
  createdAt: '2026-01-25T00:00:00.000Z',
  ...overrides,
});

describe('decimal-safe money', () => {
  it('parses decimal strings without float drift', () => {
    expect(parseAmount('1,234.56', 'USD')).toBe(123456);
    expect(parseAmount('0.1', 'USD')).toBe(10);
    expect(parseAmount('0.1', 'USD')! + parseAmount('0.2', 'USD')!).toBe(30);
    expect(parseAmount('1234.567', 'USD')).toBe(123457);
    expect(toDecimalString(123457, 'USD')).toBe('1234.57');
    expect(parseAmount('', 'USD')).toBeNull();
    expect(parseAmount('abc', 'USD')).toBeNull();
    expect(parseAmount('1500', 'JPY')).toBe(1500);
  });

  it('formats with currency symbol and hides values', () => {
    expect(formatMoney(123456, 'LKR')).toContain('1,234.56');
    expect(formatMoney(123456, 'LKR', { hide: true })).toBe('••••');
  });
});

describe('salary periods', () => {
  it('divides a monthly allocation across the actual weekday count', () => {
    const jan = salaryPeriods(job({ salaryType: 'weekly-allocation', monthlyAllocation: amount(20000) }), '2026-01-01');
    expect(jan).toHaveLength(5); // Fridays in Jan 2026: 2, 9, 16, 23, 30
    expect(jan.map((p) => p.base)).toEqual([amount(4000), amount(4000), amount(4000), amount(4000), amount(4000)]);
    expect(jan.reduce((t, p) => t + p.base, 0)).toBe(amount(20000));

    const feb = salaryPeriods(job({ salaryType: 'weekly-allocation', monthlyAllocation: amount(20000) }), '2026-02-01');
    expect(feb).toHaveLength(4);
    expect(feb[0].base).toBe(amount(5000));
    expect(feb.reduce((t, p) => t + p.base, 0)).toBe(amount(20000));
  });

  it('distributes rounding remainder so the month still totals the allocation', () => {
    const parts = _apportion(100000, 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100000);
    const periods = salaryPeriods(
      job({ salaryType: 'weekly-allocation', monthlyAllocation: 100001 }),
      '2026-01-01',
    );
    expect(periods.reduce((t, p) => t + p.base, 0)).toBe(100001);
  });

  it('never multiplies a monthly allocation by the number of weeks', () => {
    const jan = salaryPeriods(job({ salaryType: 'weekly-allocation', monthlyAllocation: amount(20000) }), '2026-01-01');
    expect(jan.reduce((t, p) => t + p.base, 0)).toBe(amount(20000));
    expect(salaryBaseFor(job({ salaryType: 'weekly-allocation', monthlyAllocation: amount(20000) }), '2026-01-09')).toBe(amount(4000));
  });

  it('keeps fixed weekly salary fixed', () => {
    const periods = salaryPeriods(job({ salaryType: 'weekly-fixed', baseSalary: amount(5000) }), '2026-01-01');
    expect(periods).toHaveLength(5);
    expect(periods.every((p) => p.base === amount(5000))).toBe(true);
  });
});

describe('salary calculation', () => {
  it('adds earnings, reduces gross for unpaid time and deducts net items', () => {
    const j = job();
    const r = record({
      adjustments: {
        ...emptyAdjustments(),
        commission: amount(1000),
        overtimeHours: 4,
        overtimeRate: amount(100),
        overtimeMultiplier: 1.5,
        allowances: amount(500),
        bonus: amount(2000),
        unpaidLeave: amount(300),
        loanDeduction: amount(1000),
        tax: amount(1500),
      },
    });
    expect(salaryGross(r, j)).toBe(amount(20000 + 1000 + 600 + 500 + 2000 - 300));
    expect(salaryNet(r, j)).toBe(amount(20000 + 1000 + 600 + 500 + 2000 - 300 - 1000 - 1500));
  });

  it('does not double-count overtime when a manual amount exists', () => {
    const j = job();
    const r = record({
      adjustments: { ...emptyAdjustments(), overtimeHours: 10, overtimeRate: amount(100), overtimeManual: amount(250) },
    });
    expect(salaryGross(r, j)).toBe(amount(20250));
  });

  it('tracks partial salary payments', () => {
    const j = job();
    const r = record({
      payments: [
        { id: 'p1', date: '2026-01-25', amount: amount(5000), accountId: 'a1', createdAt: '' },
        { id: 'p2', date: '2026-01-28', amount: amount(2500), accountId: 'a1', createdAt: '' },
      ],
    });
    expect(salaryReceived(r)).toBe(amount(7500));
    expect(salaryNet(r, j) - salaryReceived(r)).toBe(amount(12500));
  });
});

describe('loan accounting', () => {
  it('builds a schedule whose principal sums exactly to the principal', () => {
    for (const method of ['reducing', 'flat'] as const) {
      const schedule = generateSchedule(loan({ method }));
      expect(schedule).toHaveLength(12);
      expect(schedule.reduce((t, e) => t + e.principalDue, 0)).toBe(amount(100000));
      expect(schedule.every((e) => e.totalDue === e.principalDue + e.interestDue)).toBe(true);
    }
  });

  it('represents a disbursement as cash plus liability, never income', () => {
    const state = baseState();
    state.accounts.push({
      id: 'a1', name: 'Bank', kind: 'bank', currency: 'LKR',
      openingBalance: amount(50000), archived: false, createdAt: '2026-01-01T00:00:00.000Z',
    });
    state.loans.push(loan({ accountId: 'a1' }));

    const balances = accountBalances(state);
    expect(balances.get('a1')).toBe(amount(150000));

    const summary = financialSummary(state);
    expect(summary.assets.get('LKR')).toBe(amount(150000));
    expect(summary.liabilities.get('LKR')).toBe(amount(100000));
    expect(summary.netWorth.get('LKR')).toBe(amount(50000));
    expect(periodTotals(state, '2026-01-01', '2026-12-31', 'LKR').income).toBe(0);
  });

  it('splits EMI payments between interest and principal and blocks overpayment', () => {
    const state = baseState();
    const l = loan();
    state.loans.push(l);
    const emi = generateSchedule(l)[0];
    const first = splitEmiPayment(emi, [], amount(5000));
    expect('error' in first).toBe(false);
    if ('error' in first) return;
    expect(first.principal + first.interest).toBe(amount(5000));
    expect(first.interest).toBe(Math.min(amount(5000), emi.interestDue));

    const over = splitEmiPayment(emi, [], emi.totalDue + 1);
    expect('error' in over).toBe(true);

    const paidFull = splitEmiPayment(emi, [], emi.totalDue);
    expect('error' in paidFull).toBe(false);
    if ('error' in paidFull) return;
    expect(emiPaid([
      {
        id: 'x', loanId: l.id, emiId: emi.id, date: '2026-02-15', amount: emi.totalDue,
        principal: paidFull.principal, interest: paidFull.interest, fees: 0, accountId: 'a1',
        source: 'manual', createdAt: '',
      },
    ], emi.id).amount).toBe(emi.totalDue);

    const again = splitEmiPayment(emi, [
      {
        id: 'x', loanId: l.id, emiId: emi.id, date: '2026-02-15', amount: emi.totalDue,
        principal: paidFull.principal, interest: paidFull.interest, fees: 0, accountId: 'a1',
        source: 'manual', createdAt: '',
      },
    ], amount(100));
    expect('error' in again).toBe(true);
  });

  it('reduces outstanding principal after a payment without reducing it twice', () => {
    const state = baseState();
    const l = loan();
    state.accounts.push({
      id: 'a1', name: 'Bank', kind: 'bank', currency: 'LKR',
      openingBalance: amount(100000), archived: false, createdAt: '2026-01-01T00:00:00.000Z',
    });
    const emi = generateSchedule(l)[0];
    state.emiPayments.push({
      id: 'pay1', loanId: l.id, emiId: emi.id, date: '2026-02-15', amount: emi.totalDue,
      principal: emi.principalDue, interest: emi.interestDue, fees: 0, accountId: 'a1',
      source: 'manual', createdAt: '',
    });
    expect(loanOutstanding(l, state.emiPayments)).toBe(amount(100000) - emi.principalDue);
    const entries = ledgerEntries(state);
    expect(entries.filter((e) => e.refId === 'pay1')).toHaveLength(1);
  });
});

describe('transactions and balances', () => {
  it('ignores transfers and opening balances in income and expenses', () => {
    const state = baseState();
    state.accounts.push(
      { id: 'a1', name: 'Bank', kind: 'bank', currency: 'LKR', openingBalance: amount(50000), archived: false, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'a2', name: 'Cash', kind: 'cash', currency: 'LKR', openingBalance: 0, archived: false, createdAt: '2026-01-01T00:00:00.000Z' },
    );
    const txns: Txn[] = [
      { id: 't1', kind: 'transfer', amount: amount(1000), currency: 'LKR', date: '2026-02-01', accountId: 'a1', toAccountId: 'a2', createdAt: '' },
      { id: 't2', kind: 'income', amount: amount(2000), currency: 'LKR', date: '2026-02-02', accountId: 'a2', category: 'Salary', createdAt: '' },
      { id: 't3', kind: 'expense', amount: amount(500), currency: 'LKR', date: '2026-02-03', accountId: 'a1', category: 'Food', createdAt: '' },
    ];
    state.transactions = txns;
    const totals = periodTotals(state, '2026-02-01', '2026-02-28', 'LKR');
    expect(totals.income).toBe(amount(2000));
    expect(totals.expense).toBe(amount(500));

    const balances = accountBalances(state);
    expect(balances.get('a1')).toBe(amount(50000) - amount(500) - amount(1000));
    expect(balances.get('a2')).toBe(amount(1000) + amount(2000));
  });

  it('keeps currencies separate', () => {
    const state = baseState();
    state.accounts.push(
      { id: 'a1', name: 'Bank', kind: 'bank', currency: 'LKR', openingBalance: amount(1000), archived: false, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'a2', name: 'USD', kind: 'bank', currency: 'USD', openingBalance: amount(100), archived: false, createdAt: '2026-01-01T00:00:00.000Z' },
    );
    const summary = financialSummary(state);
    expect(summary.assets.get('LKR')).toBe(amount(1000));
    expect(summary.assets.get('USD')).toBe(amount(100));
    expect(summary.assets.size).toBe(2);
  });

  it('counts only allocated savings as assets and never double-counts cash', () => {
    const state = baseState();
    state.goals.push({
      id: 'g1', name: 'Emergency', target: amount(50000), currency: 'LKR', archived: false,
      createdAt: '', contributions: [
        { id: 'c1', date: '2026-01-01', amount: amount(5000), direction: 'in', accountId: 'a1', createdAt: '' },
        { id: 'c2', date: '2026-01-02', amount: amount(1000), direction: 'out', accountId: 'a1', createdAt: '' },
      ],
    });
    // Money that never left a tracked account is still part of cash, so it must
    // not become a second asset just because a goal records it.
    state.goals.push({
      id: 'g2', name: 'Wishlist', target: amount(3000), currency: 'LKR', archived: false,
      createdAt: '', contributions: [
        { id: 'c3', date: '2026-01-03', amount: amount(3000), direction: 'in', createdAt: '' },
      ],
    });
    expect(goalBalance(state.goals[0])).toBe(amount(4000));
    expect(goalBalance(state.goals[1])).toBe(amount(3000));
    expect(financialSummary(state).assets.get('LKR')).toBe(amount(4000));
    expect(periodTotals(state, '2026-01-01', '2026-01-31', 'LKR').income).toBe(0);
  });
});

describe('budgets and bills', () => {
  it('only counts expenses inside the budget window and categories', () => {
    const state = baseState();
    const budget: Budget = {
      id: 'b1', name: 'Food', period: 'custom', amount: amount(10000), currency: 'LKR',
      categories: ['Food'], startDate: '2026-01-01', endDate: '2026-01-31', rollover: false,
      alertAt: 80, paused: false, archived: false, createdAt: '',
    };
    state.transactions = [
      { id: 't1', kind: 'expense', amount: amount(2000), currency: 'LKR', date: '2026-01-05', accountId: 'a', category: 'Food', createdAt: '' },
      { id: 't2', kind: 'expense', amount: amount(3000), currency: 'LKR', date: '2026-02-05', accountId: 'a', category: 'Food', createdAt: '' },
      { id: 't3', kind: 'expense', amount: amount(4000), currency: 'LKR', date: '2026-01-06', accountId: 'a', category: 'Travel', createdAt: '' },
      { id: 't4', kind: 'income', amount: amount(9000), currency: 'LKR', date: '2026-01-07', accountId: 'a', category: 'Food', createdAt: '' },
    ];
    expect(budgetSpent(state, budget, '2026-01-15')).toBe(amount(2000));
  });

  it('generates each recurring occurrence once', () => {
    const occurrences = billOccurrences(
      {
        id: 'bill1', name: 'Rent', amount: amount(50000), currency: 'LKR', category: 'Housing',
        dueDate: '2026-01-01', frequency: 'monthly', reminderDays: 3, archived: false, createdAt: '',
      },
      '2026-01-01',
      '2026-04-30',
    );
    expect(occurrences).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
    expect(new Set(occurrences).size).toBe(occurrences.length);
  });
});

describe('upcoming obligations', () => {
  it('mixes salary, EMI and bill events without duplicating paid items', () => {
    const state = baseState();
    const j = job({ salaryType: 'monthly', paymentDay: 25 });
    state.jobs.push(j);
    const l = loan({ startDate: '2026-11-15' });
    state.loans.push(l);
    state.bills.push({
      id: 'b1', name: 'Internet', amount: amount(3000), currency: 'LKR', category: 'Utilities',
      dueDate: '2026-11-20', frequency: 'monthly', reminderDays: 3, archived: false, createdAt: '',
    });
    const items = upcomingItems(state, '2026-11-11', 45);
    expect(items.some((i) => i.kind === 'salary')).toBe(true);
    expect(items.some((i) => i.kind === 'emi')).toBe(true);
    expect(items.some((i) => i.kind === 'bill')).toBe(true);
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/* ------------------------------------------------------- loan categories */

function loanFixture(overrides: Partial<Loan>): Loan {
  return {
    id: 'loan-1',
    name: 'Fixture',
    lender: 'Lender',
    currency: 'LKR',
    principal: amount(5000),
    amountReceived: amount(5000),
    annualRate: 0,
    method: 'reducing',
    termMonths: 12,
    startDate: '2026-01-15',
    status: 'active',
    createdAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('loan categories', () => {
  it('friend loans are a single running balance with no interest', () => {
    const loan = loanFixture({
      category: 'friend',
      interestMode: 'none',
      promisedDate: '2026-06-30',
      lender: 'Nimal',
    });
    const schedule = generateSchedule(loan);
    expect(schedule).toHaveLength(1);
    expect(schedule[0].dueDate).toBe('2026-06-30');
    expect(schedule[0].interestDue).toBe(0);
    expect(schedule[0].totalDue).toBe(amount(5000));
    expect(loanOutstanding(loan, [])).toBe(amount(5000));
  });

  it('a friend loan accepts part payments and reduces the balance', () => {
    const loan = loanFixture({ category: 'friend', interestMode: 'none' });
    const emi = generateSchedule(loan)[0];
    const split = splitEmiPayment(emi, [], amount(2000));
    expect('error' in split).toBe(false);
    if ('error' in split) return;
    expect(split.principal).toBe(amount(2000));
    expect(split.interest).toBe(0);
    const payment: EmiPayment = {
      id: 'p1',
      loanId: loan.id,
      emiId: emi.id,
      date: '2026-02-01',
      amount: amount(2000),
      principal: amount(2000),
      interest: 0,
      fees: 0,
      accountId: 'acc',
      source: 'manual',
      createdAt: '2026-02-01T00:00:00.000Z',
    };
    expect(loanOutstanding(loan, [payment])).toBe(amount(3000));
    expect(emiPaid([payment], emi.id).amount).toBe(amount(2000));
  });

  it('gold pawning charges monthly interest and principal at maturity', () => {
    const loan = loanFixture({
      category: 'gold',
      interestMode: 'interest-only',
      principal: amount(10000),
      amountReceived: amount(10000),
      monthlyRate: 2,
      termMonths: 3,
    });
    const schedule = generateSchedule(loan);
    expect(schedule).toHaveLength(3);
    expect(schedule[0].interestDue).toBe(amount(200));
    expect(schedule[0].principalDue).toBe(0);
    expect(schedule[0].totalDue).toBe(amount(200));
    expect(schedule[2].principalDue).toBe(amount(10000));
    expect(schedule[2].totalDue).toBe(amount(10200));
  });
});
