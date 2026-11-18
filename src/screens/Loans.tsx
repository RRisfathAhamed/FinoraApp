import { useMemo, useState, type ReactNode } from 'react';
import {
  Briefcase,
  Building2,
  Car,
  CreditCard,
  Gem,
  GraduationCap,
  HandCoins,
  House,
  Landmark,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import type { Emi, EmiPayment, InterestMode, Loan, LoanCategory, LoanFrequency, LoanMethod } from '../lib/types';
import { useApp, navigate, goBack } from '../lib/hooks';
import {
  daysBetween,
  emiPaid,
  emiStatus,
  formatDate,
  generateSchedule,
  isFlexibleLoan,
  loanCategory,
  loanFeesPaid,
  loanFrequency,
  loanFrequencyLabel,
  loanInterestPaid,
  loanOutstanding,
  loanPrincipalRepaid,
  loanScheduleTotals,
  loanSettlementRows,
  splitEmiPayment,
  todayISO,
  type PaymentAllocation,
} from '../lib/calc';
import { formatMoney } from '../lib/money';
import { actions } from '../lib/store';
import { toast } from '../lib/toast';
import type { FilePayload } from '../lib/files';
import { commitRecordAttachments, RecordAttachments } from '../components/RecordAttachments';
import {
  Btn,
  Card,
  Confirm,
  CurrencySelect,
  Empty,
  Field,
  FullForm,
  IconBtn,
  Input,
  MoneyField,
  Progress,
  Screen,
  Select,
  Sheet,
  Textarea,
} from '../components/ui';
import { StatusPill } from '../components/bits';
import { hasContactPicker, pickContact } from '../lib/contacts';

const CATEGORY_LABEL: Record<LoanCategory, string> = {
  bank: 'Bank loan',
  personal: 'Personal loan',
  vehicle: 'Vehicle lease',
  home: 'Home loan',
  business: 'Business loan',
  education: 'Education loan',
  gold: 'Gold pawning',
  friend: 'Friend / family',
  other: 'Other borrowing',
};

function describeLoan(loan: Loan): string {
  if (loanCategory(loan) === 'gold') {
    const rate = loan.monthlyRate ?? Math.round((loan.annualRate / 12) * 100) / 100;
    return `${rate}% per month · ${loan.goldWeight ?? 0} g`;
  }
  if (isFlexibleLoan(loan)) return 'No interest · part payments allowed';
  if (loanFrequency(loan) === 'end-of-term') return `End of term · simple interest ${loan.annualRate}%`;
  return `${loanFrequencyLabel(loanFrequency(loan))} · ${loan.method === 'reducing' ? 'reducing' : 'flat'} ${loan.annualRate}%`;
}

export function LoansScreen() {
  const state = useApp();
  const hide = state.settings.hideBalances;
  const currency = state.settings.currency;
  const activeLoans = state.loans.filter((l) => l.status === 'active' && l.currency === currency);
  const closedLoans = state.loans.filter((l) => l.status === 'closed');

  const borrowed = activeLoans.reduce((t, l) => t + l.principal, 0);
  const outstanding = activeLoans.reduce((t, l) => t + loanOutstanding(l, state.emiPayments), 0);
  const repaid = state.loans
    .filter((l) => l.currency === currency)
    .reduce((t, l) => t + loanPrincipalRepaid(l, state.emiPayments), 0);
  const interest = state.loans
    .filter((l) => l.currency === currency)
    .reduce((t, l) => t + loanInterestPaid(l, state.emiPayments), 0);
  const fees = state.loans
    .filter((l) => l.currency === currency)
    .reduce((t, l) => t + loanFeesPaid(l, state.emiPayments), 0);

  const nextEmi = (loan: Loan) =>
    generateSchedule(loan).find((emi) => emiPaid(state.emiPayments, emi.id).amount < emi.totalDue);

  return (
    <Screen
      title="Loans"
      subtitle="Disbursements are liabilities, never income"
      actions={
        <IconBtn label="Add loan" onClick={() => navigate('/loans/new')}>
          <Plus size={20} />
        </IconBtn>
      }
    >
      <div className="summary">
        <div className="summary__top">
          <div>
            <p className="summary__label">Total outstanding</p>
            <p className="summary__net">{formatMoney(outstanding, currency, { hide })}</p>
          </div>
          <Landmark size={22} style={{ opacity: 0.85 }} />
        </div>
        <div className="summary__grid">
          <div className="summary__cell">
            <p className="summary__cell-label">Borrowed</p>
            <p className="summary__cell-value">{formatMoney(borrowed, currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Principal repaid</p>
            <p className="summary__cell-value">{formatMoney(repaid, currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Interest paid</p>
            <p className="summary__cell-value">{formatMoney(interest + fees, currency, { hide })}</p>
          </div>
        </div>
        <div className="summary__foot">
          <span>{activeLoans.length} active loans</span>
          <span>{currency}</span>
        </div>
      </div>

      <section>
        <div className="section-head">
          <div>
            <h2 className="section-title">Active loans</h2>
            <p className="section-sub">EMI schedule and repayment progress</p>
          </div>
        </div>
        <div className="stack">
          {state.loans.filter((l) => l.status === 'active').length ? (
            state.loans.filter((l) => l.status === 'active').map((loan) => {
              const schedule = generateSchedule(loan);
              const paid = loanPrincipalRepaid(loan, state.emiPayments);
              const due = nextEmi(loan);
              const status = due ? emiStatus(due, state.emiPayments) : 'paid';
              return (
                <Card key={loan.id} onClick={() => navigate(`/loans/${loan.id}`)} className="card--pressable">
                  <div className="spread">
                    <div style={{ minWidth: 0 }}>
                      <h3 className="card-title">{loan.name}</h3>
                      <p className="card-sub">
                        {[loan.lender, CATEGORY_LABEL[loanCategory(loan)], isFlexibleLoan(loan) ? 'flexible' : `${schedule.length} ${loanFrequencyLabel(loanFrequency(loan)).toLowerCase()} instalments`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <StatusPill status={status} />
                  </div>
                  <div className="stat-grid">
                    <div className="stat">
                      <p className="stat__label">Balance to repay</p>
                      <p className="stat__value">{formatMoney(loanOutstanding(loan, state.emiPayments), loan.currency, { hide, compact: true })}</p>
                    </div>
                    <div className="stat">
                      <p className="stat__label">Principal repaid</p>
                      <p className="stat__value">{Math.round((paid / Math.max(1, loan.principal)) * 100)}%</p>
                    </div>
                  </div>
                  <Progress value={paid} max={loan.principal || 1} label={`${loan.name} repayment`} />
                  {due ? (
                    <div className="spread">
                      <span className="tiny muted">
                        {isFlexibleLoan(loan) ? 'Promised by' : 'Next EMI'} {formatDate(due.dueDate, state.settings.dateFormat)}
                      </span>
                      <span className="small strong">{formatMoney(due.totalDue - emiPaid(state.emiPayments, due.id).amount, loan.currency, { hide })}</span>
                    </div>
                  ) : null}
                </Card>
              );
            })
          ) : (
            <Card>
              <Empty
                icon={<Landmark size={22} />}
                title="No active loans"
                body="Add a loan to generate its EMI schedule, track interest and record repayments safely."
                action={<Btn onClick={() => navigate('/loans/new')}>Add a loan</Btn>}
              />
            </Card>
          )}
        </div>
      </section>

      {closedLoans.length ? (
        <section>
          <div className="section-head">
            <h2 className="section-title">Closed loans</h2>
          </div>
          <Card className="card--flush">
            {closedLoans.map((loan) => (
              <button key={loan.id} className="list-row" onClick={() => navigate(`/loans/${loan.id}`)}>
                <span className="list-row__icon"><Landmark size={17} /></span>
                <span className="list-row__text">
                  <span className="list-row__title">{loan.name}</span>
                  <span className="list-row__sub">{loan.lender} · closed</span>
                </span>
                <span className="list-row__trail"><StatusPill status="closed" /></span>
              </button>
            ))}
          </Card>
        </section>
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ loan form */

const METHODS: { value: LoanMethod; label: string; hint: string }[] = [
  { value: 'reducing', label: 'Reducing balance', hint: 'Interest is charged on the remaining balance each month.' },
  { value: 'flat', label: 'Flat rate', hint: 'Interest is calculated on the original principal for the whole term.' },
];

const LOAN_TYPES: { value: LoanCategory; label: string; hint: string; icon: ReactNode }[] = [
  { value: 'bank', label: 'Bank', hint: 'Fixed EMI with bank interest', icon: <Landmark size={17} /> },
  { value: 'personal', label: 'Personal', hint: 'Finance company loan', icon: <Wallet size={17} /> },
  { value: 'vehicle', label: 'Vehicle', hint: 'Car or bike lease', icon: <Car size={17} /> },
  { value: 'home', label: 'Home', hint: 'Housing loan or mortgage', icon: <House size={17} /> },
  { value: 'business', label: 'Business', hint: 'Working capital or equipment', icon: <Briefcase size={17} /> },
  { value: 'education', label: 'Education', hint: 'Tuition or student loan', icon: <GraduationCap size={17} /> },
  { value: 'gold', label: 'Gold pawn', hint: 'Pledged gold, monthly interest', icon: <Gem size={17} /> },
  { value: 'friend', label: 'Friend', hint: 'No interest, pays in parts', icon: <HandCoins size={17} /> },
  { value: 'other', label: 'Other', hint: 'Anything else you owe', icon: <Building2 size={17} /> },
];

export function LoanForm({ loanId }: { loanId?: string }) {
  const state = useApp();
  const existing = loanId ? state.loans.find((l) => l.id === loanId) : undefined;
  const hasPayments = Boolean(existing && state.emiPayments.some((p) => p.loanId === existing.id));
  const [name, setName] = useState(existing?.name ?? '');
  const [lender, setLender] = useState(existing?.lender ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? state.settings.currency);
  const [principal, setPrincipal] = useState(existing?.principal ?? 0);
  const [amountReceived, setAmountReceived] = useState(existing?.amountReceived ?? 0);
  const [annualRate, setAnnualRate] = useState(existing?.annualRate ?? 0);
  const [method, setMethod] = useState<LoanMethod>(existing?.method ?? 'reducing');
  const [termMonths, setTermMonths] = useState(existing?.termMonths ?? 12);
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayISO());
  const [accountId, setAccountId] = useState(existing?.accountId ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [category, setCategory] = useState<LoanCategory>(existing?.category ?? 'bank');
  const [contactName, setContactName] = useState(existing?.contactName ?? '');
  const [contactPhone, setContactPhone] = useState(existing?.contactPhone ?? '');
  const [promisedDate, setPromisedDate] = useState(existing?.promisedDate ?? '');
  const [goldItem, setGoldItem] = useState(existing?.goldItem ?? '');
  const [goldWeight, setGoldWeight] = useState(existing?.goldWeight ?? 0);
  const [goldPurity, setGoldPurity] = useState(existing?.goldPurity ?? 22);
  const [monthlyRate, setMonthlyRate] = useState(existing?.monthlyRate ?? 0);
  const [frequency, setFrequency] = useState<LoanFrequency>(existing?.frequency ?? 'monthly');
  const [assetDescription, setAssetDescription] = useState(existing?.assetDescription ?? '');
  const [loanReference, setLoanReference] = useState(existing?.loanReference ?? '');
  const [downPayment, setDownPayment] = useState(existing?.downPayment ?? 0);
  const [insurance, setInsurance] = useState(existing?.insurance ?? 0);
  const [attachments, setAttachments] = useState<FilePayload[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const interestMode: InterestMode =
    category === 'friend' ? 'none' : category === 'gold' ? 'interest-only' : method;
  const draft: Loan = {
    id: existing?.id ?? 'draft',
    name: name || 'Loan',
    lender,
    currency,
    principal,
    amountReceived: amountReceived || principal,
    annualRate: category === 'friend' ? 0 : category === 'gold' ? Math.round(monthlyRate * 12 * 100) / 100 : annualRate,
    method: category === 'gold' ? 'flat' : method,
    termMonths: Math.max(1, termMonths),
    startDate,
    promisedDate: promisedDate || undefined,
    monthlyRate: category === 'gold' ? monthlyRate : undefined,
    frequency,
    assetDescription: assetDescription.trim() || undefined,
    loanReference: loanReference.trim() || undefined,
    downPayment: downPayment || undefined,
    insurance: insurance || undefined,
    category,
    interestMode,
    accountId,
    status: 'active',
    createdAt: existing?.createdAt ?? '',
  };
  const totals = loanScheduleTotals(draft);
  const installmentCount = generateSchedule(draft).length;
  const goldMonthlyInterest = Math.round((principal * monthlyRate) / 100);
  const goldTerm = Math.max(1, termMonths);
  const accounts = state.accounts.filter((a) => !a.archived && a.currency === currency);

  const submit = () => {
    setError('');
    if (!name.trim()) { setError('Loan name is required.'); return; }
    if (principal <= 0) { setError(category === 'friend' ? 'Enter the amount you borrowed.' : 'Enter the loan principal.'); return; }
    if (category === 'friend' && !lender.trim() && !contactName.trim()) {
      setError('Add the person you borrowed from.');
      return;
    }
    if (category === 'gold' && goldWeight <= 0) { setError('Enter the gold weight pledged in grams.'); return; }
    if (category !== 'friend' && termMonths < 1) { setError('Term must be at least one month.'); return; }
    if (amountReceived > principal) { setError('Amount received cannot exceed the principal.'); return; }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        lender: (category === 'friend' ? lender || contactName : lender).trim(),
        currency,
        principal,
        amountReceived: amountReceived || principal,
        annualRate: category === 'friend' ? 0 : category === 'gold' ? Math.round(monthlyRate * 12 * 100) / 100 : annualRate,
        method: category === 'gold' ? ('flat' as LoanMethod) : method,
        termMonths: Math.max(1, termMonths),
        startDate,
        category,
        interestMode,
        contactName: category === 'friend' ? (contactName.trim() || lender.trim()) : undefined,
        contactPhone: category === 'friend' ? contactPhone.trim() || undefined : undefined,
        promisedDate: category === 'friend' || category === 'gold' ? promisedDate || undefined : undefined,
        goldItem: category === 'gold' ? goldItem.trim() || undefined : undefined,
        goldWeight: category === 'gold' ? goldWeight : undefined,
        goldPurity: category === 'gold' ? goldPurity : undefined,
        monthlyRate: category === 'gold' ? monthlyRate : undefined,
        frequency,
        assetDescription: (category === 'vehicle' || category === 'home') ? assetDescription.trim() || undefined : undefined,
        loanReference: loanReference.trim() || undefined,
        downPayment: (category === 'vehicle' || category === 'home') ? downPayment || undefined : undefined,
        insurance: (category === 'vehicle' || category === 'home' || category === 'business') ? insurance || undefined : undefined,
        accountId: accountId || undefined,
        notes: notes.trim() || undefined,
      };
      let savedId = existing?.id ?? '';
      if (existing) actions.loan.update(existing.id, payload);
      else savedId = actions.loan.add({ ...payload, status: 'active' });
      if (attachments.length) {
        commitRecordAttachments(attachments, [{ type: 'loan', id: savedId }], category === 'gold' ? 'receipt' : 'loan-agreement');
      }
      toast(existing ? 'Loan updated' : 'Loan added');
      goBack('/loans');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <FullForm
      title={existing ? 'Edit loan' : 'Add loan'}
      subtitle="Schedule, liability and repayment tracking"
      onClose={() => goBack('/loans')}
      footer={
        <>
          <Btn variant="soft" onClick={() => goBack('/loans')} disabled={busy}>Cancel</Btn>
          <Btn onClick={submit} loading={busy}>Save loan</Btn>
        </>
      }
    >
      <div className="form-stack">
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        {hasPayments ? (
          <div className="banner banner--warn">
            This loan already has payments, so structural terms (principal, rate, method, term, start date) are locked to keep the schedule auditable.
          </div>
        ) : null}

        <div className="field">
          <span className="label">Loan type</span>
          <div className="loan-type-grid">
            {LOAN_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                className={`loan-type ${category === type.value ? 'loan-type--active' : ''}`}
                onClick={() => setCategory(type.value)}
                disabled={hasPayments}
                aria-pressed={category === type.value}
              >
                <span className="loan-type__icon">{type.icon}</span>
                <span className="loan-type__label">{type.label}</span>
              </button>
            ))}
          </div>
          <p className="hint">{LOAN_TYPES.find((type) => type.value === category)?.hint}</p>
        </div>

        <Field label={category === 'friend' ? 'What did you borrow for?' : 'Loan name'}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={category === 'friend' ? 'e.g. Borrowed from Nimal' : category === 'gold' ? 'e.g. Gold necklace pledge' : 'e.g. Vehicle loan'}
            autoFocus
          />
        </Field>
        <Field label={category === 'friend' ? 'Borrowed from' : category === 'gold' ? 'Pawn shop or bank' : 'Lender'}>
          <Input
            value={lender}
            onChange={(e) => setLender(e.target.value)}
            placeholder={category === 'friend' ? 'Person’s name' : category === 'gold' ? 'e.g. City Pawn Brokers' : 'e.g. Commercial Bank'}
          />
        </Field>
        {category === 'friend' ? (
          <>
            <div className="row">
              <Field label="Contact name">
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="From your contacts" autoComplete="name" />
              </Field>
              <Field label="Phone">
                <Input type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Optional" autoComplete="tel" />
              </Field>
            </div>
            {hasContactPicker() ? (
              <Btn
                variant="soft"
                size="sm"
                icon={<Users size={15} />}
                onClick={async () => {
                  const contact = await pickContact();
                  if (!contact) {
                    toast('No contact selected', 'info');
                    return;
                  }
                  if (contact.name) setContactName(contact.name);
                  if (contact.phone) setContactPhone(contact.phone);
                  if (!lender.trim() && contact.name) setLender(contact.name);
                  toast('Contact added');
                }}
              >
                Pick from contacts
              </Btn>
            ) : null}
          </>
        ) : null}
        <CurrencySelect value={currency} onChange={setCurrency} disabled={hasPayments} />

        <MoneyField
          label={category === 'friend' ? 'Loan amount' : category === 'gold' ? 'Amount pledged' : 'Loan principal'}
          value={principal}
          currency={currency}
          onChange={setPrincipal}
          hint={category === 'friend' ? 'The amount you borrowed from them.' : undefined}
        />
        {category === 'friend' ? null : (
          <MoneyField
            label="Amount actually received"
            value={amountReceived}
            currency={currency}
            onChange={setAmountReceived}
            hint="Cash credited to your account. Loan proceeds are never income."
          />
        )}

        {category === 'gold' ? (
          <>
            <div className="row">
              <Field label="Gold item" hint="Optional">
                <Input value={goldItem} onChange={(e) => setGoldItem(e.target.value)} placeholder="e.g. 2 bangles" />
              </Field>
              <Field label="Purity">
                <Select value={String(goldPurity)} onChange={(e) => setGoldPurity(Number(e.target.value) || 22)}>
                  <option value="24">24K</option>
                  <option value="22">22K</option>
                  <option value="21">21K</option>
                  <option value="18">18K</option>
                </Select>
              </Field>
            </div>
            <div className="row">
              <Field label="Gold weight (grams)">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={goldWeight || ''}
                  onChange={(e) => setGoldWeight(Math.max(0, Number(e.target.value) || 0))}
                />
              </Field>
              <Field label="Monthly interest %">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={monthlyRate || ''}
                  disabled={hasPayments}
                  onChange={(e) => setMonthlyRate(Math.max(0, Number(e.target.value) || 0))}
                />
              </Field>
            </div>
            <Field label="Pawning period (months)">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={termMonths}
                disabled={hasPayments}
                onChange={(e) => setTermMonths(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          </>
        ) : null}

        {category === 'bank' || category === 'personal' || category === 'vehicle' || category === 'home' || category === 'business' || category === 'education' || category === 'other' ? (
          <>
            {(category === 'vehicle' || category === 'home') ? (
              <>
                <Field label={category === 'vehicle' ? 'Vehicle details' : 'Property details'}>
                  <Input value={assetDescription} onChange={(e) => setAssetDescription(e.target.value)} placeholder={category === 'vehicle' ? 'e.g. Toyota Aqua 2021' : 'e.g. 3-bedroom house, Colombo'} />
                </Field>
                <div className="row">
                  <MoneyField label="Down payment" value={downPayment} currency={currency} onChange={setDownPayment} hint="Paid upfront, not part of the loan principal." />
                  <MoneyField label="Insurance / charges" value={insurance} currency={currency} onChange={setInsurance} hint="Optional upfront cost." />
                </div>
              </>
            ) : null}
            <Field label="Agreement / reference number" hint="Optional">
              <Input value={loanReference} onChange={(e) => setLoanReference(e.target.value)} placeholder="e.g. LN-2026-0182" />
            </Field>
            <div className="row">
              <Field label="Annual interest rate %">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={annualRate || ''}
                  disabled={hasPayments}
                  onChange={(e) => setAnnualRate(Math.max(0, Number(e.target.value) || 0))}
                />
              </Field>
              <Field label="Term (months)">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={termMonths}
                  disabled={hasPayments}
                  onChange={(e) => setTermMonths(Math.max(1, Number(e.target.value) || 1))}
                />
              </Field>
            </div>

            <Field
              label="Interest method"
              hint={frequency === 'end-of-term'
                ? 'End-of-term settlement uses simple interest on the principal; the reducing/flat choice applies to instalment schedules.'
                : METHODS.find((m) => m.value === method)?.hint}
            >
              <Select value={method} onChange={(e) => setMethod(e.target.value as LoanMethod)} disabled={hasPayments || frequency === 'end-of-term'}>
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
            <Field label="Repayment schedule" hint="How often you make a payment. End of term settles once at maturity.">
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as LoanFrequency)} disabled={hasPayments}>
                <option value="monthly">Monthly payments</option>
                <option value="quarterly">Quarterly payments</option>
                <option value="annual">Annual payments</option>
                <option value="end-of-term">End-of-term settlement</option>
              </Select>
            </Field>
          </>
        ) : null}

        <div className="row">
          <Field label={category === 'friend' ? 'Date borrowed' : category === 'gold' ? 'Pawning date' : 'Disbursement / start date'}>
            <Input type="date" value={startDate} disabled={hasPayments} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          {category === 'friend' || category === 'gold' ? (
            <Field label={category === 'friend' ? 'Promised to return' : 'Redeem by'} hint="Optional">
              <Input type="date" value={promisedDate} min={startDate} onChange={(e) => setPromisedDate(e.target.value)} />
            </Field>
          ) : (
            <Field label="Linked account" hint="Receives the disbursement">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">No account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          )}
        </div>

        {category === 'friend' || category === 'gold' ? (
          <Field label="Linked account" hint="Receives the money, if any">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">No account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        ) : null}

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
        <RecordAttachments
          links={existing ? [{ type: 'loan', id: existing.id }] : []}
          category={category === 'gold' ? 'receipt' : 'loan-agreement'}
          staged={attachments}
          onStagedChange={setAttachments}
          title={category === 'gold' ? 'Pawn ticket & gold documents' : 'Loan agreement & documents'}
        />

        <Card className="card--soft">
          <div className="spread">
            <h3 className="card-title">Repayment preview</h3>
            <span className="pill pill--info">{CATEGORY_LABEL[category]}</span>
          </div>
          {category === 'friend' ? (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <p className="stat__label">Balance</p>
                  <p className="stat__value">{formatMoney(principal, currency)}</p>
                </div>
                <div className="stat">
                  <p className="stat__label">Interest</p>
                  <p className="stat__value">{formatMoney(0, currency)}</p>
                </div>
                <div className="stat">
                  <p className="stat__label">Promised return</p>
                  <p className="stat__value">{promisedDate ? formatDate(promisedDate, state.settings.dateFormat) : 'Open'}</p>
                </div>
                <div className="stat">
                  <p className="stat__label">Payments</p>
                  <p className="stat__value">Any parts</p>
                </div>
              </div>
              <p className="tiny muted">
                No interest and no fixed term. Record part payments whenever they return money and the balance updates automatically.
              </p>
            </>
          ) : category === 'gold' ? (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <p className="stat__label">Monthly interest</p>
                  <p className="stat__value">{formatMoney(goldMonthlyInterest, currency)}</p>
                </div>
                <div className="stat">
                  <p className="stat__label">Interest total</p>
                  <p className="stat__value">{formatMoney(goldMonthlyInterest * goldTerm, currency)}</p>
                </div>
                <div className="stat">
                  <p className="stat__label">Redeem price</p>
                  <p className="stat__value">{formatMoney(principal + goldMonthlyInterest * goldTerm, currency)}</p>
                </div>
                <div className="stat">
                  <p className="stat__label">Gold pledged</p>
                  <p className="stat__value">{goldWeight || 0} g · {goldPurity}K</p>
                </div>
              </div>
              <p className="tiny muted">
                Interest is paid monthly and the pledged amount is settled when you redeem the gold.
              </p>
            </>
          ) : (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <p className="stat__label">{frequency === 'monthly' ? 'Monthly EMI' : 'Per instalment'}</p>
                  <p className="stat__value">{formatMoney(totals.emi, currency)}</p>
                </div>
                <div className="stat">
                  <p className="stat__label">Total interest</p>
                  <p className="stat__value">{formatMoney(totals.interest, currency)}</p>
                </div>
                <div className="stat">
                  <p className="stat__label">Total payable</p>
                  <p className="stat__value">{formatMoney(totals.total, currency)}</p>
                </div>
                <div className="stat">
                  <p className="stat__label">Instalments</p>
                  <p className="stat__value">{installmentCount} · {loanFrequencyLabel(frequency)}</p>
                </div>
              </div>
              <p className="tiny muted">
                Disbursement increases cash and the loan liability by the same amount, so net worth does not change. It is never counted as income.
              </p>
            </>
          )}
        </Card>

        {existing ? (
          <div className="form-section">
            <p className="form-section__title">Loan management</p>
            <Btn
              variant="soft"
              onClick={() => {
                actions.loan.setStatus(existing.id, existing.status === 'closed' ? 'active' : 'closed');
                toast(existing.status === 'closed' ? 'Loan reopened' : 'Loan closed');
                goBack('/loans');
              }}
            >
              {existing.status === 'closed' ? 'Reopen loan' : 'Mark loan as closed'}
            </Btn>
            {!hasPayments ? (
              <Btn
                variant="ghost"
                icon={<Trash2 size={16} />}
                onClick={() => {
                  actions.loan.remove(existing.id);
                  toast('Loan deleted');
                  goBack('/loans');
                }}
              >
                Delete loan
              </Btn>
            ) : (
              <p className="hint">Loans with recorded payments cannot be deleted; close them instead to preserve the audit trail.</p>
            )}
          </div>
        ) : null}
      </div>
    </FullForm>
  );
}

/* --------------------------------------------------------------- loan detail */

export function LoanDetail({ loanId }: { loanId: string }) {
  const state = useApp();
  const loan = state.loans.find((l) => l.id === loanId);
  const hide = state.settings.hideBalances;
  const [activeEmi, setActiveEmi] = useState<Emi | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payFees, setPayFees] = useState(0);
  const [payDate, setPayDate] = useState(todayISO());
  const [payAccount, setPayAccount] = useState('');
  const [payAllocation, setPayAllocation] = useState<PaymentAllocation>('auto');
  const [payError, setPayError] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [payAttachments, setPayAttachments] = useState<FilePayload[]>([]);
  const [settleAttachments, setSettleAttachments] = useState<FilePayload[]>([]);
  const [editingPayment, setEditingPayment] = useState<EmiPayment | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editFees, setEditFees] = useState(0);
  const [editDate, setEditDate] = useState(todayISO());
  const [editAccount, setEditAccount] = useState('');
  const [editAllocation, setEditAllocation] = useState<PaymentAllocation>('auto');
  const [editAttachments, setEditAttachments] = useState<FilePayload[]>([]);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseNote, setReverseNote] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [settlement, setSettlement] = useState<{ accountId: string; date: string; error: string } | null>(null);
  const [limit, setLimit] = useState(12);

  const schedule = useMemo(() => (loan ? generateSchedule(loan) : []), [loan]);
  const payments = useMemo(
    () => state.emiPayments.filter((p) => p.loanId === loanId).sort((a, b) => b.date.localeCompare(a.date)),
    [state.emiPayments, loanId],
  );

  if (!loan) {
    return (
      <Screen title="Loan" back>
        <Empty title="Loan not found" body="It may have been deleted." />
      </Screen>
    );
  }

  const outstanding = loanOutstanding(loan, state.emiPayments);
  const repaid = loanPrincipalRepaid(loan, state.emiPayments);
  const interest = loanInterestPaid(loan, state.emiPayments);
  const fees = loanFeesPaid(loan, state.emiPayments);
  const next = schedule.find((emi) => emiPaid(state.emiPayments, emi.id).amount < emi.totalDue);
  const accounts = state.accounts.filter((a) => !a.archived && a.currency === loan.currency);
  const settlementRows = loanSettlementRows(loan, state.emiPayments);
  const settlementTotal = settlementRows.reduce((total, row) => total + row.remaining, 0);
  const splitPreview = activeEmi ? splitEmiPayment(activeEmi, state.emiPayments, payAmount, payAllocation) : null;

  const openPayment = (emi: Emi) => {
    const paid = emiPaid(state.emiPayments, emi.id).amount;
    setActiveEmi(emi);
    setPayAmount(Math.max(0, emi.totalDue - paid));
    setPayFees(0);
    setPayDate(todayISO());
    setPayAccount(accounts[0]?.id ?? '');
    setPayAllocation('auto');
    setPayError('');
    setPayAttachments([]);
  };

  const submitPayment = () => {
    if (!activeEmi) return;
    setPayError('');
    if (!payAccount) { setPayError('Select the account this payment came from.'); return; }
    setPayBusy(true);
    try {
      const paymentId = actions.loan.payEmi({
        loanId: loan.id,
        emiId: activeEmi.id,
        amount: payAmount,
        date: payDate,
        accountId: payAccount,
        fees: payFees,
        allocation: payAllocation,
      });
      if (payAttachments.length) {
        commitRecordAttachments(
          payAttachments,
          [{ type: 'emi', id: paymentId }, { type: 'loan', id: loan.id }],
          'receipt',
        );
      }
      setActiveEmi(null);
      toast('EMI payment recorded');
    } catch (err) {
      setPayError((err as Error).message);
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <Screen
      title={loan.name}
      subtitle={`${loan.lender || CATEGORY_LABEL[loanCategory(loan)]} · ${describeLoan(loan)}`}
      back
      actions={
        <IconBtn label="Edit loan" onClick={() => navigate(`/loans/${loan.id}/edit`)}>
          <Pencil size={18} />
        </IconBtn>
      }
    >
      <div className="summary">
        <div className="summary__top">
          <div>
            <p className="summary__label">Balance to repay</p>
            <p className="summary__net">{formatMoney(outstanding, loan.currency, { hide })}</p>
          </div>
          <StatusPill status={loan.status} />
        </div>
        <div className="summary__grid">
          <div className="summary__cell">
            <p className="summary__cell-label">Principal</p>
            <p className="summary__cell-value">{formatMoney(loan.principal, loan.currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Repaid</p>
            <p className="summary__cell-value">{formatMoney(repaid, loan.currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Interest paid</p>
            <p className="summary__cell-value">{formatMoney(interest + fees, loan.currency, { hide })}</p>
          </div>
        </div>
        <div className="summary__foot">
          <span>
            {isFlexibleLoan(loan)
              ? `Flexible repayment${loan.promisedDate ? ` · promised ${formatDate(loan.promisedDate, state.settings.dateFormat)}` : ''}`
              : loanCategory(loan) === 'gold'
                ? `${loan.goldWeight ?? 0} g · ${loan.goldPurity ?? 22}K · ${loan.monthlyRate ?? 0}% / month`
                : `${schedule.length} ${loanFrequencyLabel(loanFrequency(loan)).toLowerCase()} instalments · term ${loan.termMonths} months`}
          </span>
          <span>{loan.currency}</span>
        </div>
      </div>

      <div className="banner banner--muted">
        <span>
          Loan proceeds are not income. Each payment reduces cash by the total paid, reduces the liability by the principal portion and records interest as an expense.
        </span>
      </div>

      {loan.assetDescription || loan.loanReference || loan.downPayment || loan.insurance ? (
        <Card>
          <h2 className="card-title">Loan details</h2>
          <div className="meta-grid">
            {loan.assetDescription ? (
              <div className="meta-box">
                <p className="meta-box__label">{loanCategory(loan) === 'home' ? 'Property' : 'Vehicle'}</p>
                <p className="meta-box__value">{loan.assetDescription}</p>
              </div>
            ) : null}
            {loan.loanReference ? (
              <div className="meta-box">
                <p className="meta-box__label">Reference</p>
                <p className="meta-box__value">{loan.loanReference}</p>
              </div>
            ) : null}
            {loan.downPayment ? (
              <div className="meta-box">
                <p className="meta-box__label">Down payment</p>
                <p className="meta-box__value">{formatMoney(loan.downPayment, loan.currency, { hide })}</p>
              </div>
            ) : null}
            {loan.insurance ? (
              <div className="meta-box">
                <p className="meta-box__label">Insurance / charges</p>
                <p className="meta-box__value">{formatMoney(loan.insurance, loan.currency, { hide })}</p>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {next ? (
        <Card>
          <div className="spread">
            <div>
              <h3 className="card-title">                {isFlexibleLoan(loan) ? 'Balance due' : loanFrequency(loan) === 'monthly' ? 'Next EMI' : 'Next instalment'}</h3>
              <p className="card-sub">
                {formatDate(next.dueDate, state.settings.dateFormat)} · {daysBetween(todayISO(), next.dueDate) >= 0
                  ? `in ${daysBetween(todayISO(), next.dueDate)} days`
                  : `${Math.abs(daysBetween(todayISO(), next.dueDate))} days overdue`}
              </p>
            </div>
            <StatusPill status={emiStatus(next, state.emiPayments)} />
          </div>
          <div className="meta-grid">
            <div className="meta-box">
              <p className="meta-box__label">Total due</p>
              <p className="meta-box__value">{formatMoney(next.totalDue - emiPaid(state.emiPayments, next.id).amount, loan.currency, { hide })}</p>
            </div>
            <div className="meta-box">
              <p className="meta-box__label">Principal / interest</p>
              <p className="meta-box__value">
                {formatMoney(next.principalDue, loan.currency, { compact: true, hide })} / {formatMoney(next.interestDue, loan.currency, { compact: true, hide })}
              </p>
            </div>
          </div>
          <Btn onClick={() => openPayment(next)} disabled={loan.status === 'closed'}>
            {isFlexibleLoan(loan) ? 'Make a payment' : 'Pay this EMI'}
          </Btn>
        </Card>
      ) : null}

      {loan.notes ? <p className="tiny muted">{loan.notes}</p> : null}

      <RecordAttachments
        links={[{ type: 'loan', id: loan.id }]}
        category={loanCategory(loan) === 'gold' ? 'receipt' : 'loan-agreement'}
        staged={[]}
        onStagedChange={() => undefined}
        readOnly
        title={loanCategory(loan) === 'gold' ? 'Pawn ticket & documents' : 'Loan documents'}
      />

      <Card className="card--flush">
        <div className="card-head" style={{ padding: '14px 14px 6px' }}>
          <div>
            <h2 className="card-title">{isFlexibleLoan(loan) ? 'Running balance' : loanCategory(loan) === 'gold' ? 'Interest and redemption' : 'EMI schedule'}</h2>
            <p className="card-sub">Full and part payments supported</p>
          </div>
        </div>
        {schedule.slice(0, limit).map((emi) => {
          const paid = emiPaid(state.emiPayments, emi.id);
          const status = emiStatus(emi, state.emiPayments);
          return (
            <div key={emi.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <span className="list-row__icon"><CreditCard size={17} /></span>
              <span className="list-row__text">
                <span className="list-row__title">
                  {isFlexibleLoan(loan)
                    ? `Balance ${formatMoney(emi.totalDue, loan.currency, { hide })}`
                    : loanCategory(loan) === 'gold'
                      ? `Instalment ${emi.index} · ${formatMoney(emi.totalDue, loan.currency, { hide })}`
                      : `EMI ${emi.index} · ${formatMoney(emi.totalDue, loan.currency, { hide })}`}
                </span>
                <span className="list-row__sub">
                  {formatDate(emi.dueDate, state.settings.dateFormat)} · P {formatMoney(emi.principalDue, loan.currency, { compact: true, hide })} · I {formatMoney(emi.interestDue, loan.currency, { compact: true, hide })}
                </span>
                {paid.amount > 0 && paid.amount < emi.totalDue ? (
                  <span style={{ display: 'block', marginTop: 5 }}>
                    <Progress value={paid.amount} max={emi.totalDue} tone="warn" label={`EMI ${emi.index} part paid`} />
                  </span>
                ) : null}
              </span>
              <span className="list-row__trail" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                <StatusPill status={status} />
                {status !== 'paid' && loan.status !== 'closed' ? (
                  <Btn size="sm" variant="soft" onClick={() => openPayment(emi)}>Pay</Btn>
                ) : null}
              </span>
            </div>
          );
        })}
        {schedule.length > limit ? (
          <div style={{ padding: 12 }}>
            <Btn variant="soft" block size="sm" onClick={() => setLimit((n) => n + 12)}>Show more instalments</Btn>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="card-title">Payment history</h2>
        {payments.length ? (
          payments.map((payment) => (
            <div key={payment.id} className="list-row">
              <span className="list-row__icon"><CreditCard size={16} /></span>
              <span className="list-row__text">
                <span className="list-row__title">
                  {formatMoney(payment.amount, loan.currency, { hide })}
                  {isFlexibleLoan(loan) ? ' · balance payment' : ` · EMI ${schedule.find((e) => e.id === payment.emiId)?.index ?? '—'}`}
                </span>
                <span className="list-row__sub">
                  {formatDate(payment.date, state.settings.dateFormat)} · P {formatMoney(payment.principal, loan.currency, { hide })} · I {formatMoney(payment.interest, loan.currency, { hide })}
                  {payment.source === 'salary' ? ' · payroll deduction' : ''}
                </span>
              </span>
              <span className="list-row__trail">
                {payment.source === 'salary' ? (
                  <span className="pill pill--info">Salary</span>
                ) : (
                  <>
                    <button
                      className="icon-btn icon-btn--plain"
                      aria-label="Edit this payment"
                      onClick={() => {
                        setEditingPayment(payment);
                        setEditAmount(payment.amount);
                        setEditFees(payment.fees);
                        setEditDate(payment.date);
                        setEditAccount(payment.accountId);
                        setEditAllocation('auto');
                        setEditAttachments([]);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-btn icon-btn--plain"
                      aria-label="Correct this payment"
                      onClick={() => {
                        setReverseId(payment.id);
                        setReverseNote('');
                      }}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </>
                )}
              </span>
            </div>
          ))
        ) : (
          <p className="tiny muted">No payments recorded yet.</p>
        )}
        <div className="btn-row">
          {loan.status !== 'closed' && settlementTotal > 0 ? (
            <Btn
              variant="soft"
              size="sm"
              disabled={accounts.length === 0}
              onClick={() => { setSettleAttachments([]); setSettlement({ accountId: accounts[0]?.id ?? '', date: todayISO(), error: '' }); }}
            >
              Settle loan
            </Btn>
          ) : null}
          <Btn variant="ghost" size="sm" onClick={() => setCloseOpen(true)} disabled={loan.status === 'closed'}>
            {loan.status === 'closed' ? 'Loan closed' : 'Close loan'}
          </Btn>
        </div>
      </Card>

      <Sheet
        open={Boolean(activeEmi)}
        onClose={() => setActiveEmi(null)}
        title={activeEmi ? (isFlexibleLoan(loan) ? 'Record a payment' : `Pay ${loanFrequency(loan) === 'monthly' ? 'EMI' : 'instalment'} ${activeEmi.index}`) : 'Record a payment'}
        subtitle={activeEmi ? `${formatMoney(activeEmi.totalDue, loan.currency)} due ${formatDate(activeEmi.dueDate, state.settings.dateFormat)}` : undefined}
        footer={
          <>
            <Btn variant="soft" onClick={() => setActiveEmi(null)} disabled={payBusy}>Cancel</Btn>
            <Btn onClick={submitPayment} loading={payBusy} disabled={accounts.length === 0}>Confirm payment</Btn>
          </>
        }
      >
        {payError ? <div className="form-error" role="alert">{payError}</div> : null}
        {activeEmi ? (
          <div className="form-note">
            Remaining on this EMI: <strong>{formatMoney(activeEmi.totalDue - emiPaid(state.emiPayments, activeEmi.id).amount, loan.currency)}</strong>
            {payFees > 0 ? <> · total cash out {formatMoney(payAmount + payFees, loan.currency)}</> : null}
          </div>
        ) : null}
        <MoneyField
          label={isFlexibleLoan(loan) ? 'Payment amount' : 'EMI payment amount'}
          value={payAmount}
          currency={loan.currency}
          onChange={setPayAmount}
        />
        {!isFlexibleLoan(loan) ? (
          <Field label="Payment type" hint="Principal-only never reduces interest; interest-only never reduces principal.">
            <Select
              value={payAllocation}
              onChange={(e) => {
                const mode = e.target.value as PaymentAllocation;
                setPayAllocation(mode);
                if (!activeEmi) return;
                const paid = emiPaid(state.emiPayments, activeEmi.id);
                if (mode === 'principal') setPayAmount(Math.max(0, activeEmi.principalDue - paid.principal));
                else if (mode === 'interest') setPayAmount(Math.max(0, activeEmi.interestDue - paid.interest));
                else setPayAmount(Math.max(0, activeEmi.totalDue - paid.amount));
              }}
            >
              <option value="auto">Principal + interest (interest first)</option>
              <option value="principal">Principal only</option>
              <option value="interest">Interest only</option>
            </Select>
          </Field>
        ) : null}
        <MoneyField label="Fees" value={payFees} currency={loan.currency} onChange={setPayFees} hint="Optional bank charges, recorded as an expense" />
        <Field label="Payment date">
          <Input type="date" value={payDate} max={todayISO()} onChange={(e) => setPayDate(e.target.value)} />
        </Field>
        {accounts.length === 0 ? (
          <div className="banner banner--warn">
            <span>Add a {loan.currency} account first so this EMI has a real source of cash.</span>
            <Btn size="sm" variant="soft" onClick={() => { setActiveEmi(null); navigate('/money/account/new'); }}>
              Add account
            </Btn>
          </div>
        ) : null}
        <Field label="Paid from account">
          <Select value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.currency}</option>)}
          </Select>
        </Field>
        {splitPreview && !('error' in splitPreview) ? (
          <div className="meta-grid">
            <div className="meta-box">
              <p className="meta-box__label">Principal portion</p>
              <p className="meta-box__value">{formatMoney(splitPreview.principal, loan.currency)}</p>
            </div>
            <div className="meta-box">
              <p className="meta-box__label">Interest portion</p>
              <p className="meta-box__value">{formatMoney(splitPreview.interest, loan.currency)}</p>
            </div>
          </div>
        ) : splitPreview && 'error' in splitPreview ? (
          <div className="banner banner--warn">{splitPreview.error}</div>
        ) : null}
        <RecordAttachments
          links={[]}
          category="receipt"
          staged={payAttachments}
          onStagedChange={setPayAttachments}
          title="Repayment receipt"
        />
        <p className="hint">Principal and interest are recorded separately. Overpaying a completed instalment is blocked.</p>
      </Sheet>

      <Sheet
        open={Boolean(settlement)}
        onClose={() => setSettlement(null)}
        title="Settle this loan?"
        subtitle="Full scheduled payoff — principal plus remaining scheduled interest"
        footer={
          <>
            <Btn variant="soft" onClick={() => setSettlement(null)}>Cancel</Btn>
            <Btn
              disabled={accounts.length === 0 || !settlement?.accountId || !settlement.date}
              onClick={() => {
                if (!settlement) return;
                try {
                  const paymentIds = actions.loan.settleLoan({
                    loanId: loan.id,
                    date: settlement.date,
                    accountId: settlement.accountId,
                  });
                  if (settleAttachments.length) {
                    commitRecordAttachments(
                      settleAttachments,
                      [{ type: 'loan', id: loan.id }, ...paymentIds.map((id) => ({ type: 'emi' as const, id }))],
                      'receipt',
                    );
                  }
                  setSettlement(null);
                  toast('Loan settled and closed');
                } catch (err) {
                  setSettlement((current) => current ? { ...current, error: (err as Error).message } : current);
                }
              }}
            >
              Confirm settlement
            </Btn>
          </>
        }
      >
        {settlement?.error ? <div className="form-error" role="alert">{settlement.error}</div> : null}
        <div className="form-note">
          This pays {settlementRows.length} remaining instalment{settlementRows.length === 1 ? '' : 's'} and records principal and interest separately. The calculated amount is the full remaining schedule, including future scheduled interest.
        </div>
        <div className="meta-grid">
          <div className="meta-box">
            <p className="meta-box__label">Settlement amount</p>
            <p className="meta-box__value">{formatMoney(settlementTotal, loan.currency, { hide })}</p>
          </div>
          <div className="meta-box">
            <p className="meta-box__label">Outstanding principal</p>
            <p className="meta-box__value">{formatMoney(outstanding, loan.currency, { hide })}</p>
          </div>
        </div>
        <Field label="Paid from account">
          <Select
            value={settlement?.accountId ?? ''}
            onChange={(e) => setSettlement((current) => current ? { ...current, accountId: e.target.value } : current)}
          >
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.currency}</option>)}
          </Select>
        </Field>
        <Field label="Settlement date">
          <Input
            type="date"
            value={settlement?.date ?? ''}
            max={todayISO()}
            onChange={(e) => setSettlement((current) => current ? { ...current, date: e.target.value } : current)}
          />
        </Field>
        <RecordAttachments
          links={[]}
          category="receipt"
          staged={settleAttachments}
          onStagedChange={setSettleAttachments}
          title="Settlement receipt"
        />
      </Sheet>

      <Sheet
        open={Boolean(editingPayment)}
        onClose={() => setEditingPayment(null)}
        title="Edit recorded payment"
        subtitle={editingPayment ? `EMI ${schedule.find((e) => e.id === editingPayment.emiId)?.index ?? '—'} · ${formatDate(editingPayment.date, state.settings.dateFormat)}` : undefined}
        footer={
          <>
            <Btn variant="soft" onClick={() => setEditingPayment(null)}>Cancel</Btn>
            <Btn
              disabled={accounts.length === 0}
              onClick={() => {
                if (!editingPayment) return;
                try {
                  actions.loan.updatePayment(editingPayment.id, {
                    amount: editAmount,
                    fees: editFees,
                    date: editDate,
                    accountId: editAccount,
                    allocation: editAllocation,
                  });
                  if (editAttachments.length) {
                    commitRecordAttachments(
                      editAttachments,
                      [{ type: 'emi', id: editingPayment.id }, { type: 'loan', id: loan.id }],
                      'receipt',
                    );
                  }
                  setEditingPayment(null);
                  toast('Payment updated');
                } catch (err) {
                  toast((err as Error).message, 'error');
                }
              }}
            >
              Save payment
            </Btn>
          </>
        }
      >
        <MoneyField label="Amount" value={editAmount} currency={loan.currency} onChange={setEditAmount} />
        <MoneyField label="Fees" value={editFees} currency={loan.currency} onChange={setEditFees} />
        <Field label="Payment date">
          <Input type="date" value={editDate} max={todayISO()} onChange={(e) => setEditDate(e.target.value)} />
        </Field>
        <Field label="Paid from account">
          <Select value={editAccount} onChange={(e) => setEditAccount(e.target.value)}>
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.currency}</option>)}
          </Select>
        </Field>
        {isFlexibleLoan(loan) ? (
          <Field label="Allocation">
            <Select value={editAllocation} onChange={(e) => setEditAllocation(e.target.value as PaymentAllocation)}>
              <option value="auto">Principal + interest (interest first)</option>
              <option value="principal">Principal only</option>
              <option value="interest">Interest only</option>
            </Select>
          </Field>
        ) : null}
        <RecordAttachments
          links={editingPayment ? [{ type: 'emi', id: editingPayment.id }] : []}
          category="receipt"
          staged={editAttachments}
          onStagedChange={setEditAttachments}
          title="Repayment documents"
        />
      </Sheet>

      <Sheet
        open={Boolean(reverseId)}
        onClose={() => setReverseId(null)}
        title="Correct a recorded payment"
        subtitle="Reversal keeps an audit note"
        footer={
          <>
            <Btn variant="soft" onClick={() => setReverseId(null)}>Cancel</Btn>
            <Btn
              variant="danger"
              onClick={() => {
                if (!reverseId) return;
                if (!reverseNote.trim()) {
                  toast('Add a reason for the correction', 'error');
                  return;
                }
                actions.loan.reversePayment(reverseId, reverseNote.trim());
                setReverseId(null);
                toast('Payment reversed with an audit note');
              }}
            >
              Reverse payment
            </Btn>
          </>
        }
      >
        <div className="form-note">
          Reversing removes the EMI payment and its cash movement, restoring the outstanding balance. Finora records the reason as a zero-value correction note so the history is auditable.
        </div>
        <Field label="Reason">
          <Textarea value={reverseNote} onChange={(e) => setReverseNote(e.target.value)} placeholder="e.g. Payment recorded against the wrong EMI" />
        </Field>
      </Sheet>

      <Confirm
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        danger={false}
        title="Close this loan?"
        message={`Outstanding principal is ${formatMoney(outstanding, loan.currency)}. You can reopen the loan later.`}
        confirmLabel="Close loan"
        onConfirm={() => {
          actions.loan.setStatus(loan.id, 'closed');
          setCloseOpen(false);
          toast('Loan closed');
        }}
      />
    </Screen>
  );
}

