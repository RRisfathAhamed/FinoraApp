/**
 * Finora domain model.
 * All monetary values are stored as integer minor units (e.g. cents) to avoid
 * floating point drift. A currency's minor-unit exponent lives in money.ts.
 */

export type ID = string;

export type AccountKind = 'bank' | 'cash' | 'wallet' | 'credit' | 'other';

export interface Account {
  id: ID;
  name: string;
  bankName?: string;
  branch?: string;
  kind: AccountKind;
  identifier?: string;
  currency: string;
  openingBalance: number;
  color?: string;
  imageId?: ID;
  notes?: string;
  archived: boolean;
  createdAt: string;
}

export type TxnKind = 'income' | 'expense' | 'transfer';

export interface Txn {
  id: ID;
  kind: TxnKind;
  amount: number;
  currency: string;
  date: string; // YYYY-MM-DD
  category?: string;
  accountId?: ID;
  toAccountId?: ID;
  merchant?: string;
  notes?: string;
  attachmentId?: ID;
  /** System-generated records are linked back to their source document. */
  source?: string;
  createdAt: string;
}

export type SalaryType = 'monthly' | 'weekly-fixed' | 'weekly-allocation' | 'contract';

export interface Job {
  id: ID;
  company: string;
  title: string;
  salaryType: SalaryType;
  currency: string;
  /** Monthly salary, weekly amount, or contract amount depending on type. */
  baseSalary: number;
  /** Monthly allocation for 'weekly-allocation' jobs. */
  monthlyAllocation?: number;
  /** 0 = Sunday ... 6 = Saturday */
  paymentWeekday: number;
  paymentDay?: number;
  accountId?: ID;
  startDate?: string;
  endDate?: string;
  status: 'active' | 'ended';
  notes?: string;
  createdAt: string;
}

export interface SalaryPayment {
  id: ID;
  date: string;
  amount: number;
  accountId: ID;
  createdAt: string;
}

export interface SalaryLoanPosting {
  loanId: ID;
  amount: number;
  emiPaymentIds: ID[];
}

export interface SalaryRecord {
  id: ID;
  jobId: ID;
  /** YYYY-MM for monthly periods, YYYY-MM-DD for weekly periods. */
  periodKey: string;
  periodDate: string;
  adjustments: SalaryAdjustments;
  /** Loan repaid directly by payroll deduction, if any. */
  loanId?: ID;
  payments: SalaryPayment[];
  loanPostings: SalaryLoanPosting[];
  notes?: string;
  createdAt: string;
}

export interface SalaryAdjustments {
  commission: number;
  overtimeHours: number;
  overtimeRate: number;
  overtimeMultiplier: number;
  overtimeManual: number;
  allowances: number;
  bonus: number;
  unpaidLeave: number;
  halfDay: number;
  hourlyDeduction: number;
  loanDeduction: number;
  advance: number;
  tax: number;
  other: number;
}

export type LoanMethod = 'reducing' | 'flat';
export type LoanStatus = 'active' | 'closed';

/** Loan shape drives which fields the form asks for and how repayment works. */
export type LoanCategory = 'bank' | 'personal' | 'vehicle' | 'gold' | 'friend' | 'other';
export type InterestMode = 'reducing' | 'flat' | 'interest-only' | 'none';

export interface Loan {
  id: ID;
  name: string;
  lender: string;
  currency: string;
  principal: number;
  amountReceived: number;
  annualRate: number;
  method: LoanMethod;
  termMonths: number;
  startDate: string;
  accountId?: ID;
  notes?: string;
  status: LoanStatus;
  createdAt: string;
  /** Defaults to 'bank' for records created before categories existed. */
  category?: LoanCategory;
  interestMode?: InterestMode;
  /** Friend / family borrowing: who to repay. */
  contactName?: string;
  contactPhone?: string;
  /** Date the borrower promised to return the money. */
  promisedDate?: string;
  /** Gold pawning details. */
  goldItem?: string;
  goldWeight?: number;
  goldPurity?: number;
  monthlyRate?: number;
}

export interface Emi {
  id: ID;
  loanId: ID;
  index: number;
  dueDate: string;
  principalDue: number;
  interestDue: number;
  totalDue: number;
}

export interface EmiPayment {
  id: ID;
  loanId: ID;
  emiId: ID;
  date: string;
  amount: number;
  principal: number;
  interest: number;
  fees: number;
  accountId: ID;
  source: 'manual' | 'salary';
  salaryRecordId?: ID;
  createdAt: string;
}

export type BudgetPeriod = 'monthly' | 'weekly' | 'custom';

export interface Budget {
  id: ID;
  name: string;
  period: BudgetPeriod;
  amount: number;
  currency: string;
  categories: string[];
  startDate: string;
  endDate?: string;
  rollover: boolean;
  alertAt: number; // percentage threshold 1-100
  paused: boolean;
  archived: boolean;
  createdAt: string;
}

export interface SavingsContribution {
  id: ID;
  date: string;
  amount: number;
  accountId?: ID;
  direction: 'in' | 'out';
  createdAt: string;
}

export interface SavingsGoal {
  id: ID;
  name: string;
  target: number;
  currency: string;
  targetDate?: string;
  accountId?: ID;
  icon?: string;
  notes?: string;
  contributions: SavingsContribution[];
  archived: boolean;
  createdAt: string;
}

export interface Investment {
  id: ID;
  name: string;
  type: string;
  quantity: number;
  currency: string;
  purchaseDate: string;
  costBasis: number;
  currentValue: number;
  notes?: string;
  attachmentId?: ID;
  archived: boolean;
  createdAt: string;
}

export type BillFrequency = 'monthly' | 'weekly' | 'yearly' | 'once';

export interface Bill {
  id: ID;
  name: string;
  amount: number;
  currency: string;
  category: string;
  dueDate: string;
  frequency: BillFrequency;
  reminderDays: number;
  accountId?: ID;
  notes?: string;
  archived: boolean;
  createdAt: string;
}

export interface BillPayment {
  id: ID;
  billId: ID;
  /** Stable occurrence key (billId + due date) — prevents duplicate schedules. */
  dueKey: string;
  date: string;
  amount: number;
  accountId: ID;
  createdAt: string;
}

export type DocCategory =
  | 'bank-statement'
  | 'loan-agreement'
  | 'emi-schedule'
  | 'payslip'
  | 'receipt'
  | 'invoice'
  | 'identity'
  | 'other';

export interface DocLink {
  type: 'account' | 'txn' | 'loan' | 'emi' | 'salary' | 'bill' | 'goal' | 'investment';
  id: ID;
}

export interface VaultDoc {
  id: ID;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  category: DocCategory;
  links: DocLink[];
  notes?: string;
  createdAt: string;
}

export interface Media {
  id: ID;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  createdAt: string;
}

export type SmsStatus = 'pending' | 'confirmed' | 'ignored' | 'failed';

export interface SmsDraft {
  id: ID;
  raw: string;
  amount: number | null;
  currency: string;
  direction: 'in' | 'out';
  merchant: string;
  date: string;
  accountId?: ID;
  category?: string;
  confidence: 'high' | 'medium' | 'low';
  fingerprint: string;
  status: SmsStatus;
  txnId?: ID;
  createdAt: string;
}

export type ThemePref = 'light' | 'dark' | 'system';

export interface DashboardPrefs {
  order: string[];
  hidden: string[];
}

export interface Settings {
  theme: ThemePref;
  currency: string;
  dateFormat: 'DD MMM YYYY' | 'MMM DD, YYYY' | 'YYYY-MM-DD';
  numberFormat: 'standard' | 'indian';
  hideBalances: boolean;
  notifySalary: boolean;
  notifyEmi: boolean;
  notifyBills: boolean;
  notifyBudgets: boolean;
  notifySavings: boolean;
  remindDays: number;
  dashboard: DashboardPrefs;
}

export interface Profile {
  name: string;
  email: string;
  phone?: string;
  avatarId?: ID;
  occupation?: string;
  location?: string;
  /** First-run introduction completed or skipped. */
  onboarded?: boolean;
}

export interface AppState {
  schemaVersion: number;
  profile: Profile;
  settings: Settings;
  accounts: Account[];
  transactions: Txn[];
  jobs: Job[];
  salaryRecords: SalaryRecord[];
  loans: Loan[];
  emiPayments: EmiPayment[];
  budgets: Budget[];
  goals: SavingsGoal[];
  investments: Investment[];
  bills: Bill[];
  billPayments: BillPayment[];
  documents: VaultDoc[];
  media: Record<ID, Media>;
  smsDrafts: SmsDraft[];
  readNotifKeys: string[];
  recentSearches: string[];
}

export interface BackupManifest {
  app: 'finora';
  schemaVersion: number;
  createdAt: string;
  counts: Record<string, number>;
  currency: string;
  files: { path: string; size: number; checksum: string; mime: string }[];
  documentFiles: { path: string; size: number; checksum: string; mime: string }[];
}
