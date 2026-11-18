import { useEffect, useState } from 'react';
import {
  Briefcase,
  ChevronRight,
  Pencil,
  Paperclip,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react';
import type { Job, SalaryAdjustments, SalaryPayment, SalaryRecord, SalaryType } from '../lib/types';
import { useApp, navigate, goBack } from '../lib/hooks';
import {
  addMonthsClamped,
  emptyAdjustments,
  formatDate,
  formatMonth,
  jobExpectedMonthly,
  monthKey,
  monthStart,
  overtimeAmount,
  salaryBaseFor,
  salaryGross,
  salaryNet,
  salaryPeriods,
  salaryReceived,
  salaryRemaining,
  salaryStatus,
  todayISO,
  WEEKDAYS,
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
  Input,
  MoneyField,
  Screen,
  Select,
  Sheet,
  Textarea,
} from '../components/ui';
import { StatusPill } from '../components/bits';

const SALARY_TYPES: { value: SalaryType; label: string; hint: string }[] = [
  { value: 'monthly', label: 'Monthly', hint: 'One payment every month' },
  { value: 'weekly-fixed', label: 'Weekly fixed', hint: 'Same amount each payment weekday' },
  { value: 'weekly-allocation', label: 'Weekly from monthly allocation', hint: 'Monthly amount split across the month’s payment days' },
  { value: 'contract', label: 'Contract based', hint: 'Contract amount per period' },
];

function typeLabel(type: SalaryType): string {
  return SALARY_TYPES.find((t) => t.value === type)?.label ?? type;
}

function nextPeriodFor(job: Job): { periodKey: string; date: string; base: number } {
  const thisMonth = monthKey(todayISO());
  const periods = salaryPeriods(job, thisMonth);
  const found = periods.find((p) => p.date >= todayISO());
  if (found) return found;
  const next = salaryPeriods(job, addMonthsClamped(`${thisMonth}-01`, 1));
  return next[0] ?? { periodKey: thisMonth, date: `${thisMonth}-01`, base: 0 };
}

export function SalaryScreen() {
  const state = useApp();
  const today = todayISO();
  const thisMonth = monthKey(today);
  const activeJobs = state.jobs.filter((j) => j.status === 'active');
  const records = [...state.salaryRecords].sort(
    (a, b) => b.periodDate.localeCompare(a.periodDate) || b.createdAt.localeCompare(a.createdAt),
  );
  const hide = state.settings.hideBalances;
  const currency = state.settings.currency;

  const expected = activeJobs.reduce(
    (total, job) => (job.currency === currency ? total + jobExpectedMonthly(job) : total),
    0,
  );
  const receivedThisMonth = state.salaryRecords.reduce((total, record) => {
    const job = state.jobs.find((j) => j.id === record.jobId);
    if (!job || job.currency !== currency) return total;
    return (
      total +
      record.payments
        .filter((p) => monthKey(p.date) === thisMonth)
        .reduce((sum, p) => sum + p.amount, 0)
    );
  }, 0);
  const remaining = Math.max(0, expected - receivedThisMonth);
  const multiCurrency = new Set(activeJobs.map((j) => j.currency)).size > 1;

  return (
    <Screen
      title="Salary"
      subtitle="Expected pay is never posted as cash until received"
      actions={
        <button className="icon-btn" onClick={() => navigate('/salary/new')} aria-label="Add job">
          <Plus size={20} />
        </button>
      }
    >
      <div className="summary">
        <div className="summary__top">
          <div>
            <p className="summary__label">Expected this month</p>
            <p className="summary__net">{formatMoney(expected, currency, { hide })}</p>
          </div>
          <Briefcase size={22} style={{ opacity: 0.85 }} />
        </div>
        <div className="summary__grid">
          <div className="summary__cell">
            <p className="summary__cell-label">Received</p>
            <p className="summary__cell-value">{formatMoney(receivedThisMonth, currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Remaining</p>
            <p className="summary__cell-value">{formatMoney(remaining, currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Active jobs</p>
            <p className="summary__cell-value">{activeJobs.length}</p>
          </div>
        </div>
        <div className="summary__foot">
          <span>{formatMonth(`${thisMonth}-01`)}</span>
          <span>{multiCurrency ? 'Multiple currencies — shown in ' + currency : currency}</span>
        </div>
      </div>

      <section>
        <div className="section-head">
          <div>
            <h2 className="section-title">Jobs</h2>
            <p className="section-sub">Salary sources and schedules</p>
          </div>
          <button className="link-btn" onClick={() => navigate('/salary/new')}>
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="stack">
          {activeJobs.length ? (
            activeJobs.map((job) => {
              const next = nextPeriodFor(job);
              const periods = salaryPeriods(job, thisMonth);
              return (
                <Card key={job.id}>
                  <div className="spread">
                    <div style={{ minWidth: 0 }}>
                      <h3 className="card-title">{job.company}</h3>
                      <p className="card-sub">{job.title} · {typeLabel(job.salaryType)}</p>
                    </div>
                    <button
                      className="icon-btn"
                      aria-label="Edit job"
                      onClick={() => navigate(`/salary/new/${job.id}`)}
                    >
                      <Pencil size={17} />
                    </button>
                  </div>
                  <div className="meta-grid">
                    <div className="meta-box">
                      <p className="meta-box__label">
                        {job.salaryType === 'weekly-allocation' ? 'Monthly allocation' : job.salaryType === 'weekly-fixed' ? 'Per week' : 'Monthly salary'}
                      </p>
                      <p className="meta-box__value">
                        {formatMoney(job.salaryType === 'weekly-allocation' ? job.monthlyAllocation ?? 0 : job.baseSalary, job.currency, { hide })}
                      </p>
                    </div>
                    <div className="meta-box">
                      <p className="meta-box__label">Scheduled this month</p>
                      <p className="meta-box__value">
                        {periods.length} {periods.length === 1 ? 'payment' : 'payments'}
                      </p>
                    </div>
                    <div className="meta-box">
                      <p className="meta-box__label">Next payment</p>
                      <p className="meta-box__value">{formatDate(next.date, state.settings.dateFormat)}</p>
                    </div>
                    <div className="meta-box">
                      <p className="meta-box__label">Next gross</p>
                      <p className="meta-box__value">{formatMoney(next.base, job.currency, { hide })}</p>
                    </div>
                  </div>
                  <Btn
                    variant="soft"
                    size="sm"
                    block
                    onClick={() => navigate(`/salary/record/${job.id}/${next.periodKey}`)}
                  >
                    Record salary
                  </Btn>
                </Card>
              );
            })
          ) : (
            <Card>
              <Empty
                icon={<Briefcase size={22} />}
                title="No salary jobs yet"
                body="Add a job to calculate monthly or weekly pay and record it as real income when it arrives."
                action={<Btn onClick={() => navigate('/salary/new')}>Add a job</Btn>}
              />
            </Card>
          )}
        </div>
      </section>

      <section>
        <div className="section-head">
          <div>
            <h2 className="section-title">Salary history</h2>
            <p className="section-sub">Gross, deductions and received amounts</p>
          </div>
        </div>
        <Card className="card--flush">
          {records.length ? (
            records.map((record) => {
              const job = state.jobs.find((j) => j.id === record.jobId);
              if (!job) return null;
              const net = salaryNet(record, job);
              const received = salaryReceived(record);
              return (
                <button
                  key={record.id}
                  className="list-row"
                  onClick={() => navigate(`/salary/record/${job.id}/${record.periodKey}`)}
                >
                  <span className="list-row__icon"><Briefcase size={17} /></span>
                  <span className="list-row__text">
                    <span className="list-row__title">{job.company}</span>
                    <span className="list-row__sub">
                      {record.periodKey.length === 7 ? formatMonth(`${record.periodKey}-01`) : formatDate(record.periodKey)}
                      {' · '}
                      {formatMoney(received, job.currency, { hide })} of {formatMoney(net, job.currency, { hide })}
                    </span>
                  </span>
                  <span className="list-row__trail" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <StatusPill status={salaryStatus(record, job)} />
                    <ChevronRight size={16} className="muted" />
                  </span>
                </button>
              );
            })
          ) : (
            <Empty title="No salary recorded yet" body="A record is created the first time you save a payroll period." />
          )}
        </Card>
      </section>
    </Screen>
  );
}

/* ------------------------------------------------------------------- job form */

export function JobForm({ jobId }: { jobId?: string }) {
  const state = useApp();
  const existing = jobId ? state.jobs.find((j) => j.id === jobId) : undefined;
  const [company, setCompany] = useState(existing?.company ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [salaryType, setSalaryType] = useState<SalaryType>(existing?.salaryType ?? 'monthly');
  const [currency, setCurrency] = useState(existing?.currency ?? state.settings.currency);
  const [baseSalary, setBaseSalary] = useState(existing?.baseSalary ?? 0);
  const [monthlyAllocation, setMonthlyAllocation] = useState(existing?.monthlyAllocation ?? 0);
  const [paymentWeekday, setPaymentWeekday] = useState(existing?.paymentWeekday ?? 5);
  const [paymentDay, setPaymentDay] = useState(existing?.paymentDay ?? 25);
  const [accountId, setAccountId] = useState(existing?.accountId ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayISO());
  const [status, setStatus] = useState<Job['status']>(existing?.status ?? 'active');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const draft: Job = {
    id: existing?.id ?? 'draft',
    company: company || 'Company',
    title,
    salaryType,
    currency,
    baseSalary,
    monthlyAllocation,
    paymentWeekday,
    paymentDay,
    accountId,
    status,
    startDate,
    createdAt: existing?.createdAt ?? '',
  };
  const preview = salaryPeriods(draft, monthStart(todayISO()));
  const accounts = state.accounts.filter((a) => !a.archived && a.currency === currency);
  const hasHistory = existing ? state.salaryRecords.some((r) => r.jobId === existing.id) : false;

  const submit = () => {
    setError('');
    if (!company.trim()) { setError('Company name is required.'); return; }
    if (baseSalary <= 0 && !(salaryType === 'weekly-allocation' && monthlyAllocation > 0)) {
      setError('Enter a salary amount greater than zero.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        company: company.trim(),
        title: title.trim(),
        salaryType,
        currency,
        baseSalary,
        monthlyAllocation: salaryType === 'weekly-allocation' ? monthlyAllocation : undefined,
        paymentWeekday,
        paymentDay,
        accountId: accountId || undefined,
        startDate,
        status,
        notes: notes.trim() || undefined,
      };
      if (existing) actions.job.update(existing.id, payload);
      else actions.job.add({ ...payload, endDate: undefined });
      toast(existing ? 'Job updated' : 'Job added');
      goBack('/salary');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <FullForm
      title={existing ? 'Edit job' : 'New salary job'}
      subtitle="Payroll schedule and payment account"
      onClose={() => goBack('/salary')}
      footer={
        <>
          <Btn variant="soft" onClick={() => goBack('/salary')} disabled={busy}>Cancel</Btn>
          <Btn onClick={submit} loading={busy}>Save job</Btn>
        </>
      }
    >
      <div className="form-stack">
        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <Field label="Company">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Acme Ltd" autoFocus />
        </Field>
        <Field label="Job title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Product designer" />
        </Field>

        <Field label="Salary type" hint={SALARY_TYPES.find((t) => t.value === salaryType)?.hint}>
          <Select value={salaryType} onChange={(e) => setSalaryType(e.target.value as SalaryType)}>
            {SALARY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>

        <CurrencySelect value={currency} onChange={setCurrency} />

        {salaryType === 'weekly-allocation' ? (
          <>
            <MoneyField
              label="Monthly salary allocation"
              value={monthlyAllocation}
              currency={currency}
              onChange={setMonthlyAllocation}
              hint="Divided across the actual number of payment weekdays in each month — never multiplied by weeks."
            />
            <MoneyField
              label="Fixed component per payment (optional)"
              value={baseSalary}
              currency={currency}
              onChange={setBaseSalary}
              hint="Leave at zero to use the allocated weekly amount only."
            />
          </>
        ) : (
          <MoneyField
            label={
              salaryType === 'weekly-fixed' ? 'Weekly salary' :
              salaryType === 'contract' ? 'Contract amount' : 'Monthly salary'
            }
            value={baseSalary}
            currency={currency}
            onChange={setBaseSalary}
          />
        )}

        {salaryType === 'weekly-fixed' || salaryType === 'weekly-allocation' ? (
          <Field label="Payment weekday">
            <Select value={paymentWeekday} onChange={(e) => setPaymentWeekday(Number(e.target.value))}>
              {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Payment day of month" hint="Clamped to the last day in shorter months">
            <Input
              type="number"
              min={1}
              max={31}
              value={paymentDay}
              onChange={(e) => setPaymentDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
            />
          </Field>
        )}

        <Field label="Linked account" hint="Salary payments are credited here">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">No default account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.currency}</option>)}
          </Select>
        </Field>

        <div className="row">
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Job['status'])}>
              <option value="active">Active</option>
              <option value="ended">Ended</option>
            </Select>
          </Field>
        </div>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>

        <Card className="card--soft">
          <div className="spread">
            <div>
              <h3 className="card-title">This month’s schedule</h3>
              <p className="card-sub">{formatMonth(monthStart(todayISO()))}</p>
            </div>
            <span className="pill pill--info">{preview.length} payments</span>
          </div>
          {preview.map((period) => (
            <div key={period.periodKey} className="spread">
              <span className="small muted">{formatDate(period.date, state.settings.dateFormat)}</span>
              <span className="small strong">{formatMoney(period.base, currency)}</span>
            </div>
          ))}
          <div className="divider" />
          <div className="spread">
            <span className="small">Total this month</span>
            <span className="small strong">{formatMoney(preview.reduce((t, p) => t + p.base, 0), currency)}</span>
          </div>
          {salaryType === 'weekly-allocation' ? (
            <p className="tiny muted">
              Each weekly payment is the allocation divided by the number of payment weekdays in that calendar month. A 4-week month pays a larger share than a 5-week month, and the month always totals the allocation.
            </p>
          ) : null}
        </Card>

        {existing ? (
          <div className="form-section">
            <p className="form-section__title">Job actions</p>
            {status === 'active' ? (
              <Btn variant="soft" onClick={() => setEndOpen(true)}>End employment</Btn>
            ) : null}
            <Btn variant="ghost" icon={<Trash2 size={16} />} onClick={() => setDeleteOpen(true)}>Delete job</Btn>
            {hasHistory ? <p className="hint">Jobs with salary history can be ended but not deleted.</p> : null}
          </div>
        ) : null}
      </div>

      <Confirm
        open={endOpen}
        onClose={() => setEndOpen(false)}
        danger={false}
        title="End this employment?"
        message="The job stops appearing in expected salary. All recorded payroll history is kept."
        confirmLabel="End job"
        onConfirm={() => {
          if (!existing) return;
          actions.job.end(existing.id);
          setEndOpen(false);
          toast('Job ended');
          goBack('/salary');
        }}
      />

      <Confirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete job?"
        message="Only jobs without salary records can be deleted."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!existing) return;
          actions.job.remove(existing.id);
          setDeleteOpen(false);
          toast('Job deleted');
          goBack('/salary');
        }}
      />
    </FullForm>
  );
}

/* --------------------------------------------------------- salary record form */

export function SalaryRecordForm({ jobId, periodKey: routePeriod }: { jobId: string; periodKey: string }) {
  const state = useApp();
  const job = state.jobs.find((j) => j.id === jobId);
  const [periodKey, setPeriodKey] = useState(routePeriod);
  const [monthISO, setMonthISO] = useState(routePeriod.slice(0, 7));
  const [adjustments, setAdjustments] = useState<SalaryAdjustments>(emptyAdjustments());
  const [loanId, setLoanId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [paymentFor, setPaymentFor] = useState<{ recordId: string; remaining: number } | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(todayISO());
  const [payAccount, setPayAccount] = useState('');
  const [payError, setPayError] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [attachments, setAttachments] = useState<FilePayload[]>([]);
  const [paymentAttachments, setPaymentAttachments] = useState<FilePayload[]>([]);
  const [docPayment, setDocPayment] = useState<SalaryPayment | null>(null);
  const [paymentDocDraft, setPaymentDocDraft] = useState<FilePayload[]>([]);
  const [editPayment, setEditPayment] = useState<SalaryPayment | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editDate, setEditDate] = useState(todayISO());
  const [editAccount, setEditAccount] = useState('');

  const record = state.salaryRecords.find(
    (r) => r.jobId === jobId && r.periodKey === periodKey,
  );

  useEffect(() => {
    setAdjustments(record?.adjustments ?? emptyAdjustments());
    setLoanId(record?.loanId ?? '');
    setNotes(record?.notes ?? '');
  }, [record?.id, periodKey]);

  if (!job) {
    return (
      <FullForm title="Record salary" onClose={() => goBack('/salary')}>
        <Empty title="Job not found" body="It may have been deleted." />
      </FullForm>
    );
  }

  const periods = salaryPeriods(job, monthISO);
  const period = periods.find((p) => p.periodKey === periodKey) ?? periods[0];
  const base = salaryBaseFor(job, periodKey);
  const jobCurrency = job.currency;
  const draft: SalaryRecord = {
    id: record?.id ?? 'draft',
    jobId: job.id,
    periodKey,
    periodDate: period?.date ?? routePeriod,
    adjustments,
    loanId: loanId || undefined,
    payments: record?.payments ?? [],
    loanPostings: [],
    createdAt: record?.createdAt ?? '',
  };
  const gross = salaryGross(draft, job);
  const net = salaryNet(draft, job);
  const received = salaryReceived(draft);
  const remaining = salaryRemaining(draft, job);
  const activeLoans = state.loans.filter((l) => l.status === 'active' && l.currency === jobCurrency);
  const paymentAccounts = state.accounts.filter((a) => !a.archived && a.currency === jobCurrency);
  const monthlyTotal = periods.reduce((t, p) => t + p.base, 0);

  const set = <K extends keyof SalaryAdjustments>(key: K, value: SalaryAdjustments[K]) =>
    setAdjustments((prev) => ({ ...prev, [key]: value }));

  const beginPayment = (recordId: string, amount: number) => {
    const defaultAccount = paymentAccounts.find((a) => a.id === job.accountId)?.id ?? paymentAccounts[0]?.id ?? '';
    setPaymentFor({ recordId, remaining: amount });
    setPayAmount(amount);
    setPayDate(todayISO());
    setPayAccount(defaultAccount);
    setPayError('');
    setPaymentAttachments([]);
  };

  const submit = () => {
    setError('');
    setBusy(true);
    try {
      totalChecks();
      const savedId = actions.salary.save({
        id: record?.id,
        jobId: job.id,
        periodKey,
        periodDate: period?.date ?? routePeriod,
        adjustments,
        loanId: loanId || undefined,
        notes: notes.trim() || undefined,
      });
      if (attachments.length) {
        commitRecordAttachments(attachments, [{ type: 'salary', id: savedId }], 'payslip');
        setAttachments([]);
      }
      toast(record ? 'Salary record updated' : 'Salary record saved');
      // Continue directly into payment confirmation: saving a payroll record
      // must never look like the salary was already received.
      if (remaining > 0) beginPayment(savedId, remaining);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const totalChecks = () => {
    if (net <= 0) throw new Error('Net salary must be greater than zero.');
    const alreadyReceived = salaryReceived({ ...draft, payments: record?.payments ?? [] });
    if (alreadyReceived > net) {
      throw new Error('Received payments exceed the new net salary. Remove a payment first.');
    }
    if (adjustments.loanDeduction > 0 && !loanId) {
      throw new Error('Choose the loan that this payroll deduction repays.');
    }
    if (!period) throw new Error('This payroll period is not on the job schedule.');
  };

  const openPayment = () => {
    if (record) beginPayment(record.id, remaining);
  };

  const savePayment = () => {
    setPayError('');
    if (!paymentFor) { setPayError('Save the salary record first.'); return; }
    if (payAmount <= 0) { setPayError('Enter an amount greater than zero.'); return; }
    if (!payAccount) { setPayError('Select the account that received the money.'); return; }
    setPayBusy(true);
    try {
      const completesPeriod = payAmount >= paymentFor.remaining;
      const paymentId = actions.salary.addPayment(paymentFor.recordId, { date: payDate, amount: payAmount, accountId: payAccount });
      if (paymentAttachments.length) {
        commitRecordAttachments(
          paymentAttachments,
          [{ type: 'salary-payment', id: paymentId }, { type: 'salary', id: paymentFor.recordId }],
          'payslip',
        );
      }
      setPaymentFor(null);
      toast('Salary payment recorded as income');
      if (completesPeriod) goBack('/salary');
    } catch (err) {
      setPayError((err as Error).message);
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <FullForm
      title="Record salary"
      subtitle={`${job.company} · ${job.title}`}
      onClose={() => goBack('/salary')}
      footer={
        <>
          <Btn variant="soft" onClick={() => goBack('/salary')}>Close</Btn>
          <Btn onClick={submit} loading={busy}>Save record</Btn>
        </>
      }
    >
      <div className="form-stack">
        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <Card>
          <div className="spread">
            <div>
              <h3 className="card-title">Payroll period</h3>
              <p className="card-sub">{typeLabel(job.salaryType)}</p>
            </div>
            <span className="pill pill--neutral">{jobCurrency}</span>
          </div>

          {job.salaryType === 'weekly-fixed' || job.salaryType === 'weekly-allocation' ? (
            <>
              <Field label="Month">
                <Input
                  type="month"
                  value={monthISO}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    setMonthISO(value);
                    const first = salaryPeriods(job, value)[0];
                    if (first) setPeriodKey(first.periodKey);
                  }}
                />
              </Field>
              <Field label={`Payment date (${WEEKDAYS[job.paymentWeekday]})`}>
                <Select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
                  {periods.map((p) => (
                    <option key={p.periodKey} value={p.periodKey}>
                      {formatDate(p.date, state.settings.dateFormat)} — {formatMoney(p.base, jobCurrency)}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : (
            <Field label="Month">
              <Input
                type="month"
                value={monthISO}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  setMonthISO(value);
                  setPeriodKey(value);
                }}
              />
            </Field>
          )}

          <div className="meta-grid">
            <div className="meta-box">
              <p className="meta-box__label">Scheduled dates</p>
              <p className="meta-box__value">{periods.length}</p>
            </div>
            <div className="meta-box">
              <p className="meta-box__label">Base this period</p>
              <p className="meta-box__value">{formatMoney(base, jobCurrency)}</p>
            </div>
            <div className="meta-box">
              <p className="meta-box__label">Month total</p>
              <p className="meta-box__value">{formatMoney(monthlyTotal, jobCurrency)}</p>
            </div>
            <div className="meta-box">
              <p className="meta-box__label">Pays into</p>
              <p className="meta-box__value">
                {state.accounts.find((a) => a.id === job.accountId)?.name ?? 'Choose on payment'}
              </p>
            </div>
          </div>
          {job.salaryType === 'weekly-allocation' ? (
            <p className="tiny muted">
              Your monthly allocation is split across {periods.length} {WEEKDAYS[job.paymentWeekday]} payments this month, so each payment is {formatMoney(base, jobCurrency)}.
            </p>
          ) : null}
        </Card>

        <Card className="card--soft">
          <div className="stat-grid">
            <div className="stat">
              <p className="stat__label">Gross</p>
              <p className="stat__value">{formatMoney(gross, jobCurrency)}</p>
            </div>
            <div className="stat">
              <p className="stat__label">Net</p>
              <p className="stat__value" style={{ color: 'var(--ok)' }}>{formatMoney(net, jobCurrency)}</p>
            </div>
            <div className="stat">
              <p className="stat__label">Received</p>
              <p className="stat__value">{formatMoney(received, jobCurrency)}</p>
            </div>
            <div className="stat">
              <p className="stat__label">Remaining</p>
              <p className="stat__value">{formatMoney(remaining, jobCurrency)}</p>
            </div>
          </div>
          {period ? <p className="tiny muted">Pay date {formatDate(period.date, state.settings.dateFormat)} · {record ? 'Saved record' : 'Not saved yet'}</p> : null}
        </Card>

        <div className="form-section">
          <p className="form-section__title">Earnings</p>
          <MoneyField label="Commission" value={adjustments.commission} currency={jobCurrency} onChange={(v) => set('commission', v)} hint="Attached to this job and payroll period only" />
          <MoneyField label="Allowances" value={adjustments.allowances} currency={jobCurrency} onChange={(v) => set('allowances', v)} />
          <MoneyField label="Bonus" value={adjustments.bonus} currency={jobCurrency} onChange={(v) => set('bonus', v)} />
          <div className="row row--3">
            <Field label="OT hours">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.25"
                value={adjustments.overtimeHours || ''}
                onChange={(e) => set('overtimeHours', Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            <MoneyField label="Hourly rate" value={adjustments.overtimeRate} currency={jobCurrency} onChange={(v) => set('overtimeRate', v)} />
            <Field label="Multiplier">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.25"
                value={adjustments.overtimeMultiplier}
                onChange={(e) => set('overtimeMultiplier', Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
          </div>
          <MoneyField
            label="Manual overtime amount"
            value={adjustments.overtimeManual}
            currency={jobCurrency}
            onChange={(v) => set('overtimeManual', v)}
            hint={adjustments.overtimeManual > 0 ? 'Overrides the calculated overtime — no double counting.' : 'Leave blank to use hours × rate × multiplier.'}
          />
          {overtimeAmount(adjustments) > 0 ? (
            <p className="tiny muted">Overtime applied: {formatMoney(overtimeAmount(adjustments), jobCurrency)}</p>
          ) : null}
        </div>

        <div className="form-section">
          <p className="form-section__title">Deductions</p>
          <div className="row">
            <MoneyField label="Unpaid leave" value={adjustments.unpaidLeave} currency={jobCurrency} onChange={(v) => set('unpaidLeave', v)} />
            <MoneyField label="Half day" value={adjustments.halfDay} currency={jobCurrency} onChange={(v) => set('halfDay', v)} />
          </div>
          <MoneyField label="Hourly deductions" value={adjustments.hourlyDeduction} currency={jobCurrency} onChange={(v) => set('hourlyDeduction', v)} />
          <MoneyField label="Salary advance recovery" value={adjustments.advance} currency={jobCurrency} onChange={(v) => set('advance', v)} />
          <div className="row">
            <MoneyField label="Tax / statutory" value={adjustments.tax} currency={jobCurrency} onChange={(v) => set('tax', v)} />
            <MoneyField label="Other deductions" value={adjustments.other} currency={jobCurrency} onChange={(v) => set('other', v)} />
          </div>

          <Field label="Loan repayment from salary" hint="Repays the loan directly, reducing net pay">
            <Select value={loanId} onChange={(e) => setLoanId(e.target.value)}>
              <option value="">No linked loan</option>
              {activeLoans.map((l) => (
                <option key={l.id} value={l.id}>{l.name} — {l.currency}</option>
              ))}
            </Select>
          </Field>
          <MoneyField
            label="Loan deduction amount"
            value={adjustments.loanDeduction}
            currency={jobCurrency}
            onChange={(v) => set('loanDeduction', v)}
            hint="Applied to the oldest unpaid EMI. Payroll-deducted EMIs never debit your bank account again."
          />

          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional payroll note" />
          </Field>
          <RecordAttachments
            links={record ? [{ type: 'salary', id: record.id }] : []}
            category="payslip"
            staged={attachments}
            onStagedChange={setAttachments}
            title="Payslip & salary documents"
          />
        </div>

        {record ? (
          <div className="form-section">
            <p className="form-section__title">Payments received</p>
            <div className="spread">
              <span className="small muted">
                {formatMoney(received, jobCurrency)} of {formatMoney(net, jobCurrency)}
              </span>
              <StatusPill status={salaryStatus(record, job)} />
            </div>
            {record.payments.length ? (
              <Card className="card--flush">
                {record.payments.map((payment) => (
                  <div key={payment.id} className="list-row">
                    <span className="list-row__icon"><Wallet size={16} /></span>
                    <span className="list-row__text">
                      <span className="list-row__title">{formatMoney(payment.amount, jobCurrency)}</span>
                      <span className="list-row__sub">
                        {formatDate(payment.date, state.settings.dateFormat)} · {state.accounts.find((a) => a.id === payment.accountId)?.name ?? 'Account'}
                      </span>
                    </span>
                    <button
                      className="icon-btn icon-btn--plain"
                      aria-label={`Edit payment ${formatMoney(payment.amount, jobCurrency)}`}
                      onClick={() => {
                        setEditPayment(payment);
                        setEditAmount(payment.amount);
                        setEditDate(payment.date);
                        setEditAccount(payment.accountId);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-btn icon-btn--plain"
                      aria-label={`Documents for payment ${formatMoney(payment.amount, jobCurrency)}`}
                      onClick={() => { setDocPayment(payment); setPaymentDocDraft([]); }}
                    >
                      <Paperclip size={16} />
                    </button>
                    <button
                      className="icon-btn icon-btn--plain"
                      aria-label="Remove payment"
                      onClick={() => {
                        actions.salary.removePayment(record.id, payment.id);
                        toast('Payment removed');
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </Card>
            ) : null}
            <Btn variant="soft" block onClick={openPayment} disabled={remaining <= 0}>
              {remaining <= 0 ? 'Fully paid' : 'Record a payment'}
            </Btn>
            {record.loanPostings.length ? (
              <div className="form-note">
                Loan deduction posted to {record.loanPostings.map((p) => formatMoney(p.amount, jobCurrency)).join(', ')} across {record.loanPostings.reduce((t, p) => t + p.emiPaymentIds.length, 0)} EMI payment(s).
              </div>
            ) : null}
            <div className="btn-row">
              <Btn variant="soft" onClick={() => navigate('/vault')}>Payslips in vault</Btn>
              <Btn variant="ghost" icon={<Trash2 size={16} />} onClick={() => setDeleteOpen(true)}>Delete record</Btn>
            </div>
          </div>
        ) : (
          <div className="form-note">
            Save this record first, then record full or partial payments. Only received money becomes income and increases your account balance.
          </div>
        )}
      </div>

      <Sheet
        open={Boolean(paymentFor)}
        onClose={() => setPaymentFor(null)}
        title="Record salary payment"
        subtitle={`${formatMoney(received, jobCurrency)} received · ${formatMoney(remaining, jobCurrency)} remaining`}
        footer={
          <>
            <Btn variant="soft" onClick={() => setPaymentFor(null)} disabled={payBusy}>Cancel</Btn>
            <Btn onClick={savePayment} loading={payBusy}>Record payment</Btn>
          </>
        }
      >
        {payError ? <div className="form-error" role="alert">{payError}</div> : null}
        <MoneyField label="Amount received" value={payAmount} currency={jobCurrency} onChange={setPayAmount} />
        <Field label="Date received">
          <Input type="date" value={payDate} max={todayISO()} onChange={(e) => setPayDate(e.target.value)} />
        </Field>
        <Field label="Account credited">
          <Select value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
            <option value="">Select account</option>
            {paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.currency}</option>)}
          </Select>
        </Field>
        <RecordAttachments
          links={[]}
          category="payslip"
          staged={paymentAttachments}
          onStagedChange={setPaymentAttachments}
          title="Bank credit slip"
        />
        <p className="hint">Partial payments are supported. Finora creates an income transaction for exactly this amount and updates the account balance.</p>
      </Sheet>

      <Sheet
        open={Boolean(editPayment)}
        onClose={() => setEditPayment(null)}
        title="Edit salary payment"
        footer={
          <>
            <Btn variant="soft" onClick={() => setEditPayment(null)}>Cancel</Btn>
            <Btn
              onClick={() => {
                if (!editPayment || !record) return;
                try {
                  actions.salary.updatePayment(record.id, editPayment.id, {
                    amount: editAmount,
                    date: editDate,
                    accountId: editAccount,
                  });
                  setEditPayment(null);
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
        <MoneyField label="Amount received" value={editAmount} currency={jobCurrency} onChange={setEditAmount} />
        <Field label="Payment date">
          <Input type="date" value={editDate} max={todayISO()} onChange={(e) => setEditDate(e.target.value)} />
        </Field>
        <Field label="Paid into account">
          <Select value={editAccount} onChange={(e) => setEditAccount(e.target.value)}>
            <option value="">Select account</option>
            {state.accounts.filter((a) => !a.archived && a.currency === jobCurrency).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
      </Sheet>

      <Sheet
        open={Boolean(docPayment)}
        onClose={() => setDocPayment(null)}
        title="Salary payment documents"
        subtitle={docPayment ? `${formatMoney(docPayment.amount, jobCurrency)} · ${formatDate(docPayment.date, state.settings.dateFormat)}` : undefined}
        footer={<Btn variant="soft" onClick={() => setDocPayment(null)}>Done</Btn>}
      >
        {docPayment ? (
          <RecordAttachments
            links={[{ type: 'salary-payment', id: docPayment.id }]}
            category="payslip"
            staged={paymentDocDraft}
            onStagedChange={(files) => {
              if (files.length) {
                commitRecordAttachments(
                  files,
                  [{ type: 'salary-payment', id: docPayment.id }, { type: 'salary', id: record?.id ?? '' }],
                  'payslip',
                );
              }
              setPaymentDocDraft([]);
            }}
            title="Bank credit slip"
          />
        ) : null}
      </Sheet>

      <Confirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete salary record?"
        message="Payments already received will be reversed, their income transactions removed, and any payroll-deducted loan repayments unlinked."
        confirmLabel="Delete record"
        onConfirm={() => {
          if (!record) return;
          actions.salary.remove(record.id);
          setDeleteOpen(false);
          toast('Salary record deleted');
          goBack('/salary');
        }}
      />
    </FullForm>
  );
}

