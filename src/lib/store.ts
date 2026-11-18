import type {
  Account,
  AppState,
  Bill,
  Budget,
  DocLink,
  DocCategory,
  EmiPayment,
  Investment,
  Job,
  Loan,
  Media,
  Reminder,
  SalaryRecord,
  SmsDraft,
  ThemePref,
  Txn,
  VaultDoc,
} from './types';
import { loadState, saveState } from './storage';
import {
  accountBalances,
  addDays,
  emiPaid,
  generateSchedule,
  isoDate,
  loanOutstanding,
  loanSettlementRows,
  salaryNet,
  salaryReceived,
  splitEmiPayment,
  todayISO,
  weekdayOccurrences,
} from './calc';
import { CURRENCIES, setNumberFormat } from './money';
import { parseBankMessage } from './sms';

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const nowISO = () => new Date().toISOString();

/** Preserve uploaded files in the Vault when their financial record is removed. */
const unlinkDocuments = (documents: VaultDoc[], match: (link: DocLink) => boolean): VaultDoc[] =>
  documents.map((doc) => ({
    ...doc,
    links: doc.links.filter((link) => !match(link)),
  }));

export const DEFAULT_DASHBOARD = [
  'summary',
  'cashflow',
  'accounts',
  'progress',
  'upcoming',
  'spending',
  'recent',
  'cards',
  'insights',
];

export function initialState(): AppState {
  return {
    schemaVersion: 1,
    profile: { name: '', email: '' },
    settings: {
      theme: 'system',
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
      dashboard: { order: [...DEFAULT_DASHBOARD], hidden: [] },
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

type Listener = () => void;

class Store {
  state: AppState = initialState();
  loaded = false;
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): AppState => this.state;

  private emit() {
    this.listeners.forEach((l) => l());
  }

  async hydrate() {
    const raw = await loadState<AppState>();
    if (raw && typeof raw === 'object' && raw.schemaVersion) {
      this.state = migrate(raw);
      this.loaded = true;
      this.emit();
    } else {
      this.loaded = true;
      this.emit();
    }
  }

  /** Apply an updater. Persistence is debounced; callers get immediate UI. */
  update(updater: (state: AppState) => AppState) {
    this.state = updater(this.state);
    this.emit();
    this.scheduleSave();
  }

  scheduleSave() {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flush(), 250);
  }

  async flush() {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await saveState(this.state);
    } catch (error) {
      console.error('Finora: failed to persist state', error);
    }
  }

  replaceState(state: AppState) {
    this.state = migrate(state);
    this.emit();
    void this.flush();
  }
}

function migrate(state: AppState): AppState {
  const base = initialState();
  const merged: AppState = {
    ...base,
    ...state,
    settings: { ...base.settings, ...(state.settings ?? {}), dashboard: { ...base.settings.dashboard, ...(state.settings?.dashboard ?? {}) } },
    profile: { ...base.profile, ...(state.profile ?? {}) },
    media: state.media ?? {},
  };
  // Loans created before categories existed are given a sensible shape so the
  // form, schedule and balance maths keep working unchanged.
  merged.loans = (merged.loans ?? []).map((loan) => {
    if (loan.category) return loan;
    const category = loan.annualRate === 0 && !loan.lender ? 'friend' : 'bank';
    return {
      ...loan,
      category,
      interestMode: loan.annualRate === 0 ? 'none' : loan.method === 'flat' ? 'flat' : 'reducing',
    };
  });
  for (const key of [
    'accounts', 'transactions', 'jobs', 'salaryRecords', 'loans', 'emiPayments',
    'budgets', 'goals', 'investments', 'bills', 'billPayments', 'documents',
    'smsDrafts', 'reminders', 'readNotifKeys', 'deletedNotifKeys', 'recentSearches',
  ] as const) {
    const value = merged[key];
    if (!Array.isArray(value)) (merged as unknown as Record<string, unknown[]>)[key] = [];
  }
  if (!CURRENCIES.some((c) => c.code === merged.settings.currency)) merged.settings.currency = 'LKR';
  setNumberFormat(merged.settings.numberFormat);
  return merged;
}

export const store = new Store();

/* --------------------------------------------------------------- helpers */

function accountOrThrow(state: AppState, id: string | undefined): Account {
  const account = state.accounts.find((a) => a.id === id);
  if (!account) throw new Error('Select a valid account.');
  if (account.archived) throw new Error('This account is archived.');
  return account;
}

function assertAmount(amount: number) {
  if (!Number.isFinite(amount) || Math.round(amount) <= 0) throw new Error('Enter an amount greater than zero.');
}

function assertCurrencyMatch(a: { currency: string }, b: { currency: string }) {
  if (a.currency !== b.currency) {
    throw new Error('Accounts use different currencies. Transfer between matching currencies only.');
  }
}

function normalizeDate(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
}

/** Oldest unpaid EMI first; returns the EMI to settle. */
function nextUnpaidEmi(loan: Loan, payments: EmiPayment[]) {
  return generateSchedule(loan).find((emi) => emiPaid(payments, emi.id).amount < emi.totalDue);
}

/** Rebuild payroll-deducted EMI postings for one salary record, idempotently. */
function syncSalaryLoanPosting(
  state: AppState,
  recordId: string,
): { payments: EmiPayment[]; postings: SalaryRecord['loanPostings'] } {
  const record = state.salaryRecords.find((r) => r.id === recordId);
  if (!record) return { payments: state.emiPayments, postings: [] };
  let payments = state.emiPayments.filter((p) => p.salaryRecordId !== recordId);
  const amount = record.adjustments.loanDeduction;
  const loan = state.loans.find((l) => l.id === record.loanId);
  if (!loan || amount <= 0) return { payments, postings: [] };
  const job = state.jobs.find((j) => j.id === record.jobId);
  const account = job?.accountId ? state.accounts.find((a) => a.id === job.accountId) : undefined;
  if (!account) return { payments, postings: [] };

  let budget = Math.min(amount, loanOutstandingFrom(payments, loan));
  const postingIds: string[] = [];
  let guard = 0;
  while (budget > 0 && guard < 120) {
    guard += 1;
    const emi = nextUnpaidEmi(loan, payments);
    if (!emi) break;
    const remaining = emi.totalDue - emiPaid(payments, emi.id).amount;
    const chunk = Math.min(budget, remaining);
    const split = splitEmiPayment(emi, payments, chunk);
    if ('error' in split) break;
    const payment: EmiPayment = {
      id: uid(),
      loanId: loan.id,
      emiId: emi.id,
      date: record.periodDate,
      amount: chunk,
      principal: split.principal,
      interest: split.interest,
      fees: 0,
      accountId: account.id,
      source: 'salary',
      salaryRecordId: record.id,
      createdAt: nowISO(),
    };
    payments = [...payments, payment];
    postingIds.push(payment.id);
    budget -= chunk;
  }
  return {
    payments,
    postings: postingIds.length ? [{ loanId: loan.id, amount: amount - budget, emiPaymentIds: postingIds }] : [],
  };
}

function loanOutstandingFrom(payments: EmiPayment[], loan: Loan): number {
  return generateSchedule(loan).reduce(
    (total, emi) => total + Math.max(0, emi.principalDue - emiPaid(payments, emi.id).principal),
    0,
  );
}

/* --------------------------------------------------------------- actions */

export const actions = {
  account: {
    add(input: Omit<Account, 'id' | 'createdAt' | 'archived'> & { archived?: boolean }) {
      if (!input.name.trim()) throw new Error('Account name is required.');
      store.update((s) => ({
        ...s,
        accounts: [...s.accounts, { ...input, id: uid(), archived: input.archived ?? false, createdAt: nowISO() }],
      }));
    },
    update(id: string, patch: Partial<Account>) {
      store.update((s) => ({
        ...s,
        accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch, id: a.id } : a)),
      }));
    },
    setArchived(id: string, archived: boolean) {
      store.update((s) => {
        if (archived) {
          const activeTransfers = s.transactions.some(
            (t) => t.kind === 'transfer' && !t.source && (t.accountId === id || t.toAccountId === id),
          );
          if (activeTransfers) {
            // Allowed: history stays intact; only future use is prevented.
          }
        }
        return { ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, archived } : a)) };
      });
    },
    remove(id: string) {
      store.update((s) => {
        const hasHistory = s.transactions.some((t) => t.accountId === id || t.toAccountId === id);
        if (hasHistory) throw new Error('This account has transactions. Archive it instead of deleting.');
        const media = { ...s.media };
        const account = s.accounts.find((a) => a.id === id);
        if (account?.imageId) delete media[account.imageId];
        return {
          ...s,
          accounts: s.accounts.filter((a) => a.id !== id),
          media,
          documents: unlinkDocuments(s.documents, (link) => link.type === 'account' && link.id === id),
        };
      });
    },
    /** Reconcile a physical balance by posting an adjustment transaction. */
    reconcile(id: string, actualBalance: number, date = todayISO()): string {
      let createdId = '';
      store.update((s) => {
        const account = accountOrThrow(s, id);
        const current = accountBalances(s).get(id) ?? 0;
        const diff = Math.round(actualBalance) - current;
        if (diff === 0) return s;
        createdId = uid();
        const txn: Txn = {
          id: createdId,
          kind: diff > 0 ? 'income' : 'expense',
          amount: Math.abs(diff),
          currency: account.currency,
          date: normalizeDate(date),
          category: 'Balance adjustment',
          accountId: id,
          merchant: 'Reconciliation',
          notes: 'Balance corrected during reconciliation',
          createdAt: nowISO(),
        };
        return { ...s, transactions: [...s.transactions, txn] };
      });
      return createdId;
    },
  },

  txn: {
    add(input: Omit<Txn, 'id' | 'createdAt'>): string {
      assertAmount(input.amount);
      let createdId = '';
      store.update((s) => {
        if (input.kind === 'transfer') {
          const from = accountOrThrow(s, input.accountId);
          const to = accountOrThrow(s, input.toAccountId);
          if (from.id === to.id) throw new Error('Choose two different accounts.');
          assertCurrencyMatch(from, to);
          if (!input.currency) throw new Error('Currency is required.');
          if (from.currency !== input.currency) throw new Error('Amount currency must match the account currency.');
        } else {
          const account = accountOrThrow(s, input.accountId);
          if (input.currency !== account.currency) throw new Error('Amount currency must match the account currency.');
        }
        createdId = uid();
        return {
          ...s,
          transactions: [
            ...s.transactions,
            { ...input, date: normalizeDate(input.date), id: createdId, createdAt: nowISO() },
          ],
        };
      });
      return createdId;
    },
    update(id: string, patch: Partial<Txn>) {
      store.update((s) => {
        const existing = s.transactions.find((t) => t.id === id);
        if (!existing) throw new Error('Transaction not found.');
        if (existing.source) throw new Error('This record belongs to another module. Correct it there.');
        const next = { ...existing, ...patch, id: existing.id };
        assertAmount(next.amount);
        const account = accountOrThrow(s, next.accountId);
        if (next.currency !== account.currency) throw new Error('Amount currency must match the account currency.');
        if (next.kind === 'transfer') {
          const to = accountOrThrow(s, next.toAccountId);
          if (to.id === account.id) throw new Error('Choose two different accounts.');
          assertCurrencyMatch(account, to);
        }
        return { ...s, transactions: s.transactions.map((t) => (t.id === id ? next : t)) };
      });
    },
    remove(id: string) {
      store.update((s) => {
        const t = s.transactions.find((x) => x.id === id);
        if (!t) return s;
        if (t.source) throw new Error('This transaction was generated by another module and cannot be deleted here.');
        return {
          ...s,
          transactions: s.transactions.filter((x) => x.id !== id),
          documents: unlinkDocuments(s.documents, (link) => link.type === 'txn' && link.id === id),
        };
      });
    },
  },

  job: {
    add(input: Omit<Job, 'id' | 'createdAt'>) {
      if (!input.company.trim()) throw new Error('Company name is required.');
      if (input.baseSalary <= 0 && !(input.monthlyAllocation ?? 0)) throw new Error('Enter a salary amount.');
      store.update((s) => ({ ...s, jobs: [...s.jobs, { ...input, id: uid(), createdAt: nowISO() }] }));
    },
    update(id: string, patch: Partial<Job>) {
      store.update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch, id } : j)) }));
    },
    end(id: string) {
      store.update((s) => ({
        ...s,
        jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: 'ended', endDate: todayISO() } : j)),
      }));
    },
    remove(id: string) {
      store.update((s) => {
        if (s.salaryRecords.some((r) => r.jobId === id)) {
          throw new Error('This job has salary history. End it instead of deleting.');
        }
        return { ...s, jobs: s.jobs.filter((j) => j.id !== id) };
      });
    },
  },

  salary: {
    save(input: {
      id?: string;
      jobId: string;
      periodKey: string;
      periodDate: string;
      adjustments: SalaryRecord['adjustments'];
      loanId?: string;
      notes?: string;
    }): string {
      let savedId = input.id ?? '';
      store.update((s) => {
        const job = s.jobs.find((j) => j.id === input.jobId);
        if (!job) throw new Error('Select a job.');
        const duplicate = s.salaryRecords.find(
          (r) => r.jobId === input.jobId && r.periodKey === input.periodKey && r.id !== input.id,
        );
        if (duplicate) throw new Error('A salary record already exists for this job and period.');
        const existing = input.id ? s.salaryRecords.find((r) => r.id === input.id) : undefined;
        if (input.loanId && input.adjustments.loanDeduction > 0) {
          const loan = s.loans.find((l) => l.id === input.loanId);
          if (!loan) throw new Error('Choose the loan that this payroll deduction repays.');
          if (input.adjustments.loanDeduction > loanOutstanding(loan, s.emiPayments)) {
            throw new Error('The loan deduction is larger than the outstanding loan balance.');
          }
        }
        const record: SalaryRecord = {
          id: existing?.id ?? uid(),
          jobId: input.jobId,
          periodKey: input.periodKey,
          periodDate: input.periodDate,
          adjustments: { ...input.adjustments },
          loanId: input.loanId,
          payments: existing?.payments ?? [],
          loanPostings: existing?.loanPostings ?? [],
          notes: input.notes,
          createdAt: existing?.createdAt ?? nowISO(),
        };
        savedId = record.id;
        const net = salaryNet(record, job);
        const received = salaryReceived(record);
        if (received > net) throw new Error('Recorded payments exceed the new net salary. Reduce or remove a payment first.');
        let salaryRecords = existing
          ? s.salaryRecords.map((r) => (r.id === record.id ? record : r))
          : [...s.salaryRecords, record];
        let emiPayments = s.emiPayments;
        const synced = syncSalaryLoanPosting({ ...s, salaryRecords, emiPayments }, record.id);
        emiPayments = synced.payments;
        salaryRecords = salaryRecords.map((r) => (r.id === record.id ? { ...r, loanPostings: synced.postings } : r));
        return { ...s, salaryRecords, emiPayments };
      });
      return savedId;
    },
    addPayment(recordId: string, input: { date: string; amount: number; accountId: string }): string {
      assertAmount(input.amount);
      let createdId = '';
      store.update((s) => {
        const record = s.salaryRecords.find((r) => r.id === recordId);
        if (!record) throw new Error('Salary record not found.');
        const job = s.jobs.find((j) => j.id === record.jobId);
        if (!job) throw new Error('Job not found.');
        const account = accountOrThrow(s, input.accountId);
        if (account.currency !== job.currency) throw new Error('Account currency must match the job currency.');
        const net = salaryNet(record, job);
        const received = salaryReceived(record);
        if (received >= net) throw new Error('This payroll period is already fully paid.');
        if (input.amount > net - received) {
          throw new Error('Payment exceeds the remaining salary balance.');
        }
        const paymentId = uid();
        createdId = paymentId;
        const payment = { id: paymentId, date: normalizeDate(input.date), amount: Math.round(input.amount), accountId: account.id, createdAt: nowISO() };
        const txn: Txn = {
          id: uid(),
          kind: 'income',
          amount: payment.amount,
          currency: job.currency,
          date: payment.date,
          category: 'Salary',
          accountId: account.id,
          merchant: job.company,
          notes: `${job.title} · ${record.periodKey}`,
          source: `salary:${record.id}:${paymentId}`,
          createdAt: nowISO(),
        };
        return {
          ...s,
          salaryRecords: s.salaryRecords.map((r) =>
            r.id === recordId ? { ...r, payments: [...r.payments, payment] } : r,
          ),
          transactions: [...s.transactions, txn],
        };
      });
      return createdId;
    },
    updatePayment(recordId: string, paymentId: string, input: { date: string; amount: number; accountId: string }) {
      assertAmount(input.amount);
      store.update((s) => {
        const record = s.salaryRecords.find((r) => r.id === recordId);
        if (!record) throw new Error('Salary record not found.');
        const payment = record.payments.find((p) => p.id === paymentId);
        if (!payment) throw new Error('Payment not found.');
        const job = s.jobs.find((j) => j.id === record.jobId);
        if (!job) throw new Error('Job not found.');
        const account = accountOrThrow(s, input.accountId);
        if (account.currency !== job.currency) throw new Error('Account currency must match the job currency.');
        const net = salaryNet(record, job);
        const receivedElsewhere = record.payments
          .filter((p) => p.id !== paymentId)
          .reduce((sum, p) => sum + p.amount, 0);
        if (receivedElsewhere + input.amount > net) {
          throw new Error('Payment exceeds the remaining salary balance.');
        }
        const nextPayment = {
          ...payment,
          date: normalizeDate(input.date),
          amount: Math.round(input.amount),
          accountId: account.id,
        };
        return {
          ...s,
          salaryRecords: s.salaryRecords.map((r) =>
            r.id === recordId
              ? { ...r, payments: r.payments.map((p) => (p.id === paymentId ? nextPayment : p)) }
              : r,
          ),
          transactions: s.transactions.map((t) =>
            t.source === `salary:${recordId}:${paymentId}`
              ? { ...t, amount: nextPayment.amount, date: nextPayment.date, accountId: nextPayment.accountId }
              : t,
          ),
        };
      });
    },
    removePayment(recordId: string, paymentId: string) {
      store.update((s) => {
        const record = s.salaryRecords.find((r) => r.id === recordId);
        if (!record) return s;
        const payment = record.payments.find((p) => p.id === paymentId);
        if (!payment) return s;
        return {
          ...s,
          salaryRecords: s.salaryRecords.map((r) =>
            r.id === recordId ? { ...r, payments: r.payments.filter((p) => p.id !== paymentId) } : r,
          ),
          transactions: s.transactions.filter((t) => t.source !== `salary:${recordId}:${paymentId}`),
          documents: unlinkDocuments(
            s.documents,
            (link) => link.type === 'salary-payment' && link.id === paymentId,
          ),
        };
      });
    },
    remove(recordId: string) {
      store.update((s) => {
        const record = s.salaryRecords.find((r) => r.id === recordId);
        if (!record) return s;
        const paymentIds = new Set(record.payments.map((p) => p.id));
        return {
          ...s,
          salaryRecords: s.salaryRecords.filter((r) => r.id !== recordId),
          transactions: s.transactions.filter((t) => !t.source?.startsWith(`salary:${recordId}:`)),
          emiPayments: s.emiPayments.filter((p) => p.salaryRecordId !== recordId),
          documents: unlinkDocuments(
            s.documents,
            (link) =>
              (link.type === 'salary' && link.id === recordId) ||
              (link.type === 'salary-payment' && paymentIds.has(link.id)),
          ),
        };
      });
    },
  },

  loan: {
    add(input: Omit<Loan, 'id' | 'createdAt'>): string {
      if (!input.name.trim()) throw new Error('Loan name is required.');
      assertAmount(input.principal);
      if (input.termMonths < 1) throw new Error('Loan term must be at least one month.');
      if (input.amountReceived < 0) throw new Error('Amount received cannot be negative.');
      if (input.category === 'gold' && (input.goldWeight ?? 0) <= 0) {
        throw new Error('Enter the gold weight pledged in grams.');
      }
      if (input.category === 'friend' && !input.lender.trim()) {
        throw new Error('Add the person you borrowed from.');
      }
      const createdId = uid();
      store.update((s) => ({ ...s, loans: [...s.loans, { ...input, id: createdId, createdAt: nowISO() }] }));
      return createdId;
    },
    update(id: string, patch: Partial<Loan>) {
      store.update((s) => {
        const loan = s.loans.find((l) => l.id === id);
        if (!loan) throw new Error('Loan not found.');
        const next = { ...loan, ...patch, id };
        if (s.emiPayments.some((p) => p.loanId === id)) {
          const structural: (keyof Loan)[] = [
            'principal', 'annualRate', 'method', 'termMonths', 'startDate', 'category', 'interestMode', 'frequency',
          ];
          if (structural.some((k) => patch[k] !== undefined && patch[k] !== loan[k])) {
            throw new Error('This loan already has payments. Structural terms cannot be changed.');
          }
        }
        return { ...s, loans: s.loans.map((l) => (l.id === id ? next : l)) };
      });
    },
    setStatus(id: string, status: Loan['status']) {
      store.update((s) => ({ ...s, loans: s.loans.map((l) => (l.id === id ? { ...l, status } : l)) }));
    },
    remove(id: string) {
      store.update((s) => {
        if (s.emiPayments.some((p) => p.loanId === id)) throw new Error('This loan has payments and cannot be deleted.');
        return {
          ...s,
          loans: s.loans.filter((l) => l.id !== id),
          documents: unlinkDocuments(s.documents, (link) => link.type === 'loan' && link.id === id),
        };
      });
    },
    payEmi(input: {
      loanId: string;
      emiId: string;
      amount: number;
      date: string;
      accountId: string;
      fees?: number;
      allocation?: 'auto' | 'principal' | 'interest';
      source?: 'manual' | 'salary';
      salaryRecordId?: string;
    }): string {
      assertAmount(input.amount);
      let createdId = '';
      store.update((s) => {
        const loan = s.loans.find((l) => l.id === input.loanId);
        if (!loan) throw new Error('Loan not found.');
        if (loan.status === 'closed') throw new Error('This loan is closed.');
        const account = accountOrThrow(s, input.accountId);
        if (account.currency !== loan.currency) throw new Error('Account currency must match the loan currency.');
        const emi = generateSchedule(loan).find((e) => e.id === input.emiId);
        if (!emi) throw new Error('EMI not found.');
        const split = splitEmiPayment(emi, s.emiPayments, Math.round(input.amount), input.allocation);
        if ('error' in split) throw new Error(split.error);
        const fees = Math.max(0, Math.round(input.fees ?? 0));
        createdId = uid();
        const payment: EmiPayment = {
          id: createdId,
          loanId: loan.id,
          emiId: emi.id,
          date: normalizeDate(input.date),
          amount: Math.round(input.amount),
          principal: split.principal,
          interest: split.interest,
          fees,
          accountId: account.id,
          source: input.source ?? 'manual',
          salaryRecordId: input.salaryRecordId,
          createdAt: nowISO(),
        };
        return { ...s, emiPayments: [...s.emiPayments, payment] };
      });
      return createdId;
    },
    /**
     * Pay every remaining scheduled amount in one auditable operation, then
     * close the loan. Future interest is included in the calculated settlement
     * because it is part of the existing schedule; the UI labels it clearly.
     */
    settleLoan(input: { loanId: string; date: string; accountId: string }): string[] {
      const createdIds: string[] = [];
      store.update((s) => {
        const loan = s.loans.find((l) => l.id === input.loanId);
        if (!loan) throw new Error('Loan not found.');
        if (loan.status === 'closed') throw new Error('This loan is already closed.');
        const account = accountOrThrow(s, input.accountId);
        if (account.currency !== loan.currency) throw new Error('Account currency must match the loan currency.');
        const rows = loanSettlementRows(loan, s.emiPayments);
        if (rows.length === 0) throw new Error('This loan has no outstanding schedule to settle.');
        const date = normalizeDate(input.date);
        const payments: EmiPayment[] = rows.map(({ emi, remaining }) => {
          const split = splitEmiPayment(emi, s.emiPayments, remaining, 'auto');
          if ('error' in split) throw new Error(split.error);
          const paymentId = uid();
          createdIds.push(paymentId);
          return {
            id: paymentId,
            loanId: loan.id,
            emiId: emi.id,
            date,
            amount: remaining,
            principal: split.principal,
            interest: split.interest,
            fees: 0,
            accountId: account.id,
            source: 'manual',
            createdAt: nowISO(),
          };
        });
        return {
          ...s,
          emiPayments: [...s.emiPayments, ...payments],
          loans: s.loans.map((l) => (l.id === loan.id ? { ...l, status: 'closed' } : l)),
        };
      });
      return createdIds;
    },
    updatePayment(
      paymentId: string,
      input: {
        amount: number;
        date: string;
        accountId: string;
        fees?: number;
        allocation?: 'auto' | 'principal' | 'interest';
      },
    ) {
      assertAmount(input.amount);
      store.update((s) => {
        const existing = s.emiPayments.find((p) => p.id === paymentId);
        if (!existing) throw new Error('Payment not found.');
        if (existing.source === 'salary') {
          throw new Error('Payroll-deducted EMIs are corrected from the salary record.');
        }
        const loan = s.loans.find((l) => l.id === existing.loanId);
        if (!loan) throw new Error('Loan not found.');
        const account = accountOrThrow(s, input.accountId);
        if (account.currency !== loan.currency) throw new Error('Account currency must match the loan currency.');
        const emi = generateSchedule(loan).find((e) => e.id === existing.emiId);
        if (!emi) throw new Error('EMI not found.');
        const others = s.emiPayments.filter((p) => p.id !== paymentId);
        const split = splitEmiPayment(emi, others, Math.round(input.amount), input.allocation);
        if ('error' in split) throw new Error(split.error);
        return {
          ...s,
          emiPayments: s.emiPayments.map((p) =>
            p.id === paymentId
              ? {
                  ...p,
                  amount: Math.round(input.amount),
                  principal: split.principal,
                  interest: split.interest,
                  fees: Math.max(0, Math.round(input.fees ?? 0)),
                  date: normalizeDate(input.date),
                  accountId: account.id,
                }
              : p,
          ),
        };
      });
    },
    /** Correct a recorded EMI payment with an auditable reversal note. */
    reversePayment(paymentId: string, note: string) {
      store.update((s) => {
        const payment = s.emiPayments.find((p) => p.id === paymentId);
        if (!payment) throw new Error('Payment not found.');
        if (payment.source === 'salary') {
          throw new Error('Payroll-deducted EMIs are corrected from the salary record.');
        }
        return {
          ...s,
          emiPayments: s.emiPayments.filter((p) => p.id !== paymentId),
          documents: unlinkDocuments(s.documents, (link) => link.type === 'emi' && link.id === paymentId),
          transactions: note.trim()
            ? [
                ...s.transactions,
                {
                  id: uid(),
                  kind: 'expense',
                  amount: 0,
                  currency: s.loans.find((l) => l.id === payment.loanId)?.currency ?? s.settings.currency,
                  date: todayISO(),
                  category: 'Loan correction',
                  accountId: payment.accountId,
                  merchant: 'EMI reversal',
                  notes: note.trim(),
                  createdAt: nowISO(),
                },
              ]
            : s.transactions,
        };
      });
    },
  },

  budget: {
    add(input: Omit<Budget, 'id' | 'createdAt' | 'archived' | 'paused'> & { paused?: boolean }) {
      assertAmount(input.amount);
      store.update((s) => ({
        ...s,
        budgets: [...s.budgets, { ...input, id: uid(), paused: input.paused ?? false, archived: false, createdAt: nowISO() }],
      }));
    },
    update(id: string, patch: Partial<Budget>) {
      store.update((s) => ({ ...s, budgets: s.budgets.map((b) => (b.id === id ? { ...b, ...patch, id } : b)) }));
    },
    setArchived(id: string, archived: boolean) {
      store.update((s) => ({ ...s, budgets: s.budgets.map((b) => (b.id === id ? { ...b, archived } : b)) }));
    },
  },

  goal: {
    add(input: Omit<AppState['goals'][number], 'id' | 'createdAt' | 'contributions' | 'archived'>): string {
      if (!input.name.trim()) throw new Error('Goal name is required.');
      assertAmount(input.target);
      const createdId = uid();
      store.update((s) => ({
        ...s,
        goals: [...s.goals, { ...input, contributions: [], archived: false, id: createdId, createdAt: nowISO() }],
      }));
      return createdId;
    },
    update(id: string, patch: Partial<AppState['goals'][number]>) {
      store.update((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch, id } : g)) }));
    },
    contribute(
      id: string,
      input: { amount: number; accountId?: string; date?: string; direction?: 'in' | 'out' },
    ): string {
      assertAmount(input.amount);
      let createdId = '';
      store.update((s) => {
        const goal = s.goals.find((g) => g.id === id);
        if (!goal) throw new Error('Goal not found.');
        const direction = input.direction ?? 'in';
        if (direction === 'out') {
          const balance = goal.contributions.reduce(
            (t, c) => t + (c.direction === 'in' ? c.amount : -c.amount),
            0,
          );
          if (input.amount > balance) throw new Error('Withdrawal exceeds the saved amount.');
        }
        if (input.accountId) {
          const account = accountOrThrow(s, input.accountId);
          if (account.currency !== goal.currency) throw new Error('Account currency must match the goal currency.');
        }
        createdId = uid();
        return {
          ...s,
          goals: s.goals.map((g) =>
            g.id === id
              ? {
                  ...g,
                  contributions: [
                    ...g.contributions,
                    {
                      id: createdId,
                      amount: Math.round(input.amount),
                      accountId: input.accountId,
                      date: normalizeDate(input.date ?? todayISO()),
                      direction,
                      createdAt: nowISO(),
                    },
                  ],
                }
              : g,
          ),
        };
      });
      return createdId;
    },
    removeContribution(goalId: string, contributionId: string) {
      store.update((s) => ({
        ...s,
        goals: s.goals.map((g) =>
          g.id === goalId
            ? { ...g, contributions: g.contributions.filter((c) => c.id !== contributionId) }
            : g,
        ),
        documents: unlinkDocuments(
          s.documents,
          (link) => link.type === 'contribution' && link.id === contributionId,
        ),
      }));
    },
  },

  investment: {
    add(input: Omit<Investment, 'id' | 'createdAt' | 'archived'>): string {
      if (!input.name.trim()) throw new Error('Investment name is required.');
      const createdId = uid();
      store.update((s) => ({
        ...s,
        investments: [...s.investments, { ...input, archived: false, id: createdId, createdAt: nowISO() }],
      }));
      return createdId;
    },
    update(id: string, patch: Partial<Investment>) {
      store.update((s) => ({
        ...s,
        investments: s.investments.map((i) => (i.id === id ? { ...i, ...patch, id } : i)),
      }));
    },
    setArchived(id: string, archived: boolean) {
      store.update((s) => ({
        ...s,
        investments: s.investments.map((i) => (i.id === id ? { ...i, archived } : i)),
      }));
    },
  },

  bill: {
    add(input: Omit<Bill, 'id' | 'createdAt' | 'archived'>): string {
      if (!input.name.trim()) throw new Error('Bill name is required.');
      assertAmount(input.amount);
      const createdId = uid();
      store.update((s) => ({
        ...s,
        bills: [...s.bills, { ...input, archived: false, id: createdId, createdAt: nowISO() }],
      }));
      return createdId;
    },
    update(id: string, patch: Partial<Bill>) {
      store.update((s) => ({ ...s, bills: s.bills.map((b) => (b.id === id ? { ...b, ...patch, id } : b)) }));
    },
    setArchived(id: string, archived: boolean) {
      store.update((s) => ({ ...s, bills: s.bills.map((b) => (b.id === id ? { ...b, archived } : b)) }));
    },
    /** Idempotent: one payment per occurrence key, one expense transaction. */
    pay(billId: string, dueKey: string, input: { date?: string; accountId: string; amount?: number }): string {
      let createdId = '';
      store.update((s) => {
        const bill = s.bills.find((b) => b.id === billId);
        if (!bill) throw new Error('Bill not found.');
        if (s.billPayments.some((p) => p.dueKey === dueKey)) throw new Error('This bill occurrence is already paid.');
        const account = accountOrThrow(s, input.accountId);
        if (account.currency !== bill.currency) throw new Error('Account currency must match the bill currency.');
        const amount = Math.round(input.amount ?? bill.amount);
        assertAmount(amount);
        const paymentId = uid();
        createdId = paymentId;
        const date = normalizeDate(input.date ?? todayISO());
        const txn: Txn = {
          id: uid(),
          kind: 'expense',
          amount,
          currency: bill.currency,
          date,
          category: bill.category,
          accountId: account.id,
          merchant: bill.name,
          source: `bill:${paymentId}`,
          createdAt: nowISO(),
        };
        return {
          ...s,
          billPayments: [
            ...s.billPayments,
            { id: paymentId, billId, dueKey, date, amount, accountId: account.id, createdAt: nowISO() },
          ],
          transactions: [...s.transactions, txn],
        };
      });
      return createdId;
    },
    unpay(paymentId: string) {
      store.update((s) => ({
        ...s,
        billPayments: s.billPayments.filter((p) => p.id !== paymentId),
        transactions: s.transactions.filter((t) => t.source !== `bill:${paymentId}`),
        documents: unlinkDocuments(
          s.documents,
          (link) => link.type === 'bill-payment' && link.id === paymentId,
        ),
      }));
    },
    remove(id: string) {
      store.update((s) => {
        if (s.billPayments.some((p) => p.billId === id)) {
          throw new Error('This bill has payment history. Archive it instead.');
        }
        return {
          ...s,
          bills: s.bills.filter((b) => b.id !== id),
          documents: unlinkDocuments(s.documents, (link) => link.type === 'bill' && link.id === id),
        };
      });
    },
  },

  media: {
    add(media: Omit<Media, 'id' | 'createdAt'>): string {
      const id = uid();
      const record: Media = { ...media, id, createdAt: nowISO() };
      store.update((s) => ({ ...s, media: { ...s.media, [id]: record } }));
      return id;
    },
    remove(id: string) {
      store.update((s) => {
        const media = { ...s.media };
        delete media[id];
        return {
          ...s,
          media,
          accounts: s.accounts.map((a) => (a.imageId === id ? { ...a, imageId: undefined } : a)),
          profile: s.profile.avatarId === id ? { ...s.profile, avatarId: undefined } : s.profile,
          transactions: s.transactions.map((t) => (t.attachmentId === id ? { ...t, attachmentId: undefined } : t)),
          investments: s.investments.map((i) => (i.attachmentId === id ? { ...i, attachmentId: undefined } : i)),
        };
      });
    },
  },

  document: {
    add(input: Omit<VaultDoc, 'id' | 'createdAt'>): string {
      const id = uid();
      store.update((s) => ({
        ...s,
        documents: [...s.documents, { ...input, id, createdAt: nowISO() }],
      }));
      return id;
    },
    update(id: string, patch: Partial<VaultDoc>) {
      store.update((s) => ({
        ...s,
        documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch, id } : d)),
      }));
    },
    setLinks(id: string, links: DocLink[]) {
      store.update((s) => ({
        ...s,
        documents: s.documents.map((d) => (d.id === id ? { ...d, links } : d)),
      }));
    },
    remove(id: string) {
      store.update((s) => ({ ...s, documents: s.documents.filter((d) => d.id !== id) }));
    },
  },

  sms: {
    ingest(raw: string, currency: string): { id: string; duplicate: boolean } {
      const parsed = parseBankMessage(raw, currency, todayISO());
      const existing = store.state.smsDrafts.find((d) => d.fingerprint === parsed.fingerprint);
      if (existing) return { id: existing.id, duplicate: true };
      // Only match a masked hint such as "••4821" or "ending 4821"; a bare
      // number could be the amount and must not select an account.
      const hint = /(?:\*{2,}|•{2,}|x{2,}|ending\s*(?:in\s*)?|a\/c\s*(?:no\.?\s*)?)(\d{3,4})/i.exec(raw)?.[1];
      const matchedAccount = hint
        ? store.state.accounts.find((account) => {
            if (account.archived || account.currency !== parsed.currency) return false;
            const digits = (account.identifier ?? '').replace(/\D/g, '');
            return digits.length > 0 && digits.endsWith(hint);
          })
        : undefined;
      const id = uid();
      const draft: SmsDraft = {
        id,
        raw,
        amount: parsed.amount,
        currency: parsed.currency,
        direction: parsed.direction,
        merchant: parsed.merchant,
        date: parsed.date,
        accountId: matchedAccount?.id,
        category: parsed.direction === 'in' ? 'Other income' : 'Other',
        confidence: parsed.confidence,
        fingerprint: parsed.fingerprint,
        status: parsed.isFinancial ? 'pending' : 'ignored',
        createdAt: nowISO(),
      };
      store.update((s) => ({ ...s, smsDrafts: [...s.smsDrafts, draft] }));
      return { id, duplicate: false };
    },
    update(id: string, patch: Partial<SmsDraft>) {
      store.update((s) => ({
        ...s,
        smsDrafts: s.smsDrafts.map((d) => (d.id === id ? { ...d, ...patch, id } : d)),
      }));
    },
    confirm(id: string) {
      store.update((s) => {
        const draft = s.smsDrafts.find((d) => d.id === id);
        if (!draft) throw new Error('Draft not found.');
        if (draft.status === 'confirmed') throw new Error('This message is already confirmed.');
        if (!draft.amount) throw new Error('Set the transaction amount before confirming.');
        const account = accountOrThrow(s, draft.accountId);
        if (account.currency !== draft.currency) throw new Error('Draft currency must match the account.');
        const txn: Txn = {
          id: uid(),
          kind: draft.direction === 'in' ? 'income' : 'expense',
          amount: draft.amount,
          currency: draft.currency,
          date: draft.date,
          category: draft.category || (draft.direction === 'in' ? 'Other income' : 'Uncategorised'),
          accountId: account.id,
          merchant: draft.merchant,
          notes: 'Confirmed from bank message',
          createdAt: nowISO(),
        };
        return {
          ...s,
          transactions: [...s.transactions, txn],
          smsDrafts: s.smsDrafts.map((d) => (d.id === id ? { ...d, status: 'confirmed', txnId: txn.id } : d)),
        };
      });
    },
    setStatus(id: string, status: SmsDraft['status']) {
      store.update((s) => ({
        ...s,
        smsDrafts: s.smsDrafts.map((d) => (d.id === id ? { ...d, status } : d)),
      }));
    },
    remove(id: string) {
      store.update((s) => ({ ...s, smsDrafts: s.smsDrafts.filter((d) => d.id !== id) }));
    },
  },

  settings: {
    update(patch: Partial<AppState['settings']>) {
      if (patch.numberFormat) setNumberFormat(patch.numberFormat);
      store.update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
    },
    setTheme(theme: ThemePref) {
      store.update((s) => ({ ...s, settings: { ...s.settings, theme } }));
    },
    toggleBalancePrivacy() {
      store.update((s) => ({ ...s, settings: { ...s.settings, hideBalances: !s.settings.hideBalances } }));
    },
    setDashboard(patch: Partial<AppState['settings']['dashboard']>) {
      store.update((s) => ({
        ...s,
        settings: { ...s.settings, dashboard: { ...s.settings.dashboard, ...patch } },
      }));
    },
  },

  profile: {
    update(patch: Partial<AppState['profile']>) {
      store.update((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
    },
  },

  notifications: {
    markRead(key: string) {
      store.update((s) =>
        s.readNotifKeys.includes(key) ? s : { ...s, readNotifKeys: [...s.readNotifKeys, key] },
      );
    },
    markUnread(key: string) {
      store.update((s) => ({ ...s, readNotifKeys: s.readNotifKeys.filter((k) => k !== key) }));
    },
    markAllRead(keys: string[]) {
      store.update((s) => ({ ...s, readNotifKeys: Array.from(new Set([...s.readNotifKeys, ...keys])) }));
    },
    remove(key: string) {
      store.update((s) =>
        s.deletedNotifKeys.includes(key)
          ? s
          : { ...s, deletedNotifKeys: [...s.deletedNotifKeys, key], readNotifKeys: s.readNotifKeys.filter((k) => k !== key) },
      );
    },
    clear(keys: string[]) {
      store.update((s) => ({
        ...s,
        deletedNotifKeys: Array.from(new Set([...s.deletedNotifKeys, ...keys])),
        readNotifKeys: s.readNotifKeys.filter((k) => !keys.includes(k)),
      }));
    },
    restore() {
      store.update((s) => ({ ...s, deletedNotifKeys: [] }));
    },
  },

  reminder: {
    add(input: Omit<Reminder, 'id' | 'createdAt' | 'active'> & { active?: boolean }): string {
      if (!input.title.trim()) throw new Error('Reminder title is required.');
      if (!input.date) throw new Error('Choose a reminder date.');
      if (!input.time) throw new Error('Choose a reminder time.');
      if (input.amount != null && input.amount < 0) throw new Error('Reminder amount cannot be negative.');
      const id = uid();
      store.update((s) => ({
        ...s,
        reminders: [...s.reminders, { ...input, title: input.title.trim(), description: input.description?.trim() || undefined, id, active: input.active ?? true, createdAt: nowISO() }],
      }));
      return id;
    },
    update(id: string, patch: Partial<Reminder>) {
      store.update((s) => ({
        ...s,
        reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...patch, id: r.id, title: (patch.title ?? r.title).trim() } : r)),
      }));
    },
    toggle(id: string) {
      store.update((s) => ({
        ...s,
        reminders: s.reminders.map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
      }));
    },
    remove(id: string) {
      store.update((s) => ({ ...s, reminders: s.reminders.filter((r) => r.id !== id) }));
    },
  },

  search: {
    remember(term: string) {
      const clean = term.trim();
      if (!clean) return;
      store.update((s) => ({
        ...s,
        recentSearches: [clean, ...s.recentSearches.filter((t) => t !== clean)].slice(0, 8),
      }));
    },
    clear() {
      store.update((s) => ({ ...s, recentSearches: [] }));
    },
  },

  documents: {
    linkTo(docId: string, link: DocLink) {
      store.update((s) => ({
        ...s,
        documents: s.documents.map((d) =>
          d.id === docId && !d.links.some((l) => l.type === link.type && l.id === link.id)
            ? { ...d, links: [...d.links, link] }
            : d,
        ),
      }));
    },
    unlink(docId: string, link: DocLink) {
      store.update((s) => ({
        ...s,
        documents: s.documents.map((d) =>
          d.id === docId
            ? { ...d, links: d.links.filter((l) => !(l.type === link.type && l.id === link.id)) }
            : d,
        ),
      }));
    },
  },
};

export const DOC_CATEGORIES: { value: DocCategory; label: string }[] = [
  { value: 'bank-statement', label: 'Bank statement' },
  { value: 'loan-agreement', label: 'Loan agreement' },
  { value: 'emi-schedule', label: 'EMI schedule' },
  { value: 'payslip', label: 'Salary slip' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'identity', label: 'Identity document' },
  { value: 'other', label: 'Other' },
];

export const nextSalaryDates = (weekday: number, count = 4): string[] => {
  const dates: string[] = [];
  const today = todayISO();
  for (let i = 0; i < 60 && dates.length < count; i += 1) {
    const date = addDays(today, i);
    if (new Date(date).getDay() === weekday) dates.push(date);
  }
  return dates;
};

export { weekdayOccurrences, isoDate };
