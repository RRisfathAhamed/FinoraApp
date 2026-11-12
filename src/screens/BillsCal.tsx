import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Receipt,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { Bill, BillFrequency } from '../lib/types';
import { useApp, navigate } from '../lib/hooks';
import {
  addDays,
  billOccurrenceList,
  billOccurrences,
  formatDate,
  formatMonth,
  generateSchedule,
  emiPaid,
  monthEnd,
  monthStart,
  parseISODate,
  salaryPeriods,
  todayISO,
  WEEKDAYS,
  isoDate,
} from '../lib/calc';
import { formatMoney } from '../lib/money';
import { actions } from '../lib/store';
import { ALL_CATEGORIES } from '../lib/categories';
import { toast } from '../lib/toast';
import {
  Btn,
  Card,
  Confirm,
  CurrencySelect,
  Empty,
  Field,
  IconBtn,
  Input,
  MoneyField,
  MoneyInput,
  Screen,
  Segmented,
  Select,
  Sheet,
  Textarea,
} from '../components/ui';
import { StatusPill } from '../components/bits';

/* -------------------------------------------------------------------- bills */

const FREQUENCIES: { value: BillFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'once', label: 'One time' },
];

export function BillsScreen() {
  const state = useApp();
  const today = todayISO();
  const hide = state.settings.hideBalances;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [paying, setPaying] = useState<{ bill: Bill; dueKey: string; dueDate: string } | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(today);
  const [payAccount, setPayAccount] = useState('');
  const [payError, setPayError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);

  const occurrences = useMemo(
    () => billOccurrenceList(state, addDays(today, -90), addDays(today, 180), today),
    [state, today],
  );
  const unpaid = occurrences.filter((o) => !o.paid);
  const paid = occurrences.filter((o) => o.paid).slice(-12).reverse();
  const monthly = state.bills
    .filter((b) => !b.archived && b.frequency === 'monthly' && b.currency === state.settings.currency)
    .reduce((t, b) => t + b.amount, 0);

  const openPay = (bill: Bill, dueKey: string, dueDate: string) => {
    setPaying({ bill, dueKey, dueDate });
    setPayAmount(bill.amount);
    setPayDate(today);
    setPayAccount(bill.accountId ?? state.accounts.find((a) => !a.archived && a.currency === bill.currency)?.id ?? '');
    setPayError('');
  };

  return (
    <Screen
      title="Bills"
      subtitle="Recurring and one-off obligations"
      back
      actions={<IconBtn label="Add bill" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={20} /></IconBtn>}
    >
      <div className="summary">
        <div className="summary__top">
          <div>
            <p className="summary__label">Monthly commitments</p>
            <p className="summary__net">{formatMoney(monthly, state.settings.currency, { hide })}</p>
          </div>
          <Receipt size={22} style={{ opacity: 0.85 }} />
        </div>
        <div className="summary__grid">
          <div className="summary__cell">
            <p className="summary__cell-label">Unpaid</p>
            <p className="summary__cell-value">{unpaid.length}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Overdue</p>
            <p className="summary__cell-value">{unpaid.filter((o) => o.status === 'overdue').length}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Paid recently</p>
            <p className="summary__cell-value">{paid.length}</p>
          </div>
        </div>
        <div className="summary__foot"><span>Schedules generate each occurrence once</span><span>{state.settings.currency}</span></div>
      </div>

      <section>
        <div className="section-head">
          <h2 className="section-title">Due & upcoming</h2>
          <button className="link-btn" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={14} /> Add bill</button>
        </div>
        <Card className="card--flush">
          {unpaid.length ? (
            unpaid.map((occurrence) => (
              <div key={occurrence.dueKey} className="list-row" style={{ alignItems: 'flex-start' }}>
                <span className="list-row__icon"><Receipt size={17} /></span>
                <span className="list-row__text">
                  <span className="list-row__title">{occurrence.bill.name}</span>
                  <span className="list-row__sub">
                    {occurrence.bill.category} · {formatDate(occurrence.dueDate, state.settings.dateFormat)} · {formatMoney(occurrence.bill.amount, occurrence.bill.currency, { hide })}
                  </span>
                  <span style={{ display: 'inline-flex', marginTop: 4 }}><StatusPill status={occurrence.status} /></span>
                </span>
                <span className="list-row__trail" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => openPay(occurrence.bill, occurrence.dueKey, occurrence.dueDate)}
                  >
                    Pay
                  </button>
                  <button
                    className="link-btn"
                    onClick={() => { setEditing(occurrence.bill); setFormOpen(true); }}
                  >
                    Edit
                  </button>
                </span>
              </div>
            ))
          ) : (
            <Empty
              icon={<Receipt size={20} />}
              title="No bills due"
              body="Add rent, utilities or subscriptions to get reminders and one-tap payments."
              action={<Btn size="sm" variant="soft" onClick={() => { setEditing(null); setFormOpen(true); }}>Add a bill</Btn>}
            />
          )}
        </Card>
      </section>

      {paid.length ? (
        <section>
          <div className="section-head"><h2 className="section-title">Recently paid</h2></div>
          <Card className="card--flush">
            {paid.map((occurrence) => (
              <div key={occurrence.dueKey} className="list-row">
                <span className="list-row__icon"><Receipt size={17} /></span>
                <span className="list-row__text">
                  <span className="list-row__title">{occurrence.bill.name}</span>
                  <span className="list-row__sub">
                    {formatDate(occurrence.dueDate, state.settings.dateFormat)} · {formatMoney(occurrence.payment?.amount ?? occurrence.bill.amount, occurrence.bill.currency, { hide })}
                  </span>
                </span>
                <span className="list-row__trail">
                  <button
                    className="icon-btn icon-btn--plain"
                    aria-label="Mark this occurrence unpaid"
                    onClick={() => {
                      if (!occurrence.payment) return;
                      actions.bill.unpay(occurrence.payment.id);
                      toast('Bill occurrence reversed');
                    }}
                  >
                    <RotateCcw size={15} />
                  </button>
                </span>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {state.bills.length ? (
        <section>
          <div className="section-head"><h2 className="section-title">Recurring schedules</h2></div>
          <Card className="card--flush">
            {state.bills.map((bill) => (
              <button key={bill.id} className="list-row" onClick={() => { setEditing(bill); setFormOpen(true); }}>
                <span className="list-row__icon"><CalendarDays size={17} /></span>
                <span className="list-row__text">
                  <span className="list-row__title">{bill.name}</span>
                  <span className="list-row__sub">
                    {bill.frequency} · next {billOccurrences(bill, today, addDays(today, 400))[0] ? formatDate(billOccurrences(bill, today, addDays(today, 400))[0], state.settings.dateFormat) : 'no upcoming occurrence'}
                  </span>
                </span>
                <span className="list-row__trail">
                  <span className="num small">{formatMoney(bill.amount, bill.currency, { hide })}</span>
                  <ChevronRight size={16} className="muted" />
                </span>
              </button>
            ))}
          </Card>
        </section>
      ) : null}

      {formOpen ? (
        <BillSheet
          key={editing?.id ?? 'new'}
          editing={editing}
          onClose={() => setFormOpen(false)}
          onDelete={(bill) => { setFormOpen(false); setDeleteTarget(bill); }}
        />
      ) : null}

      <Sheet
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title="Pay bill"
        subtitle={paying ? `${paying.bill.name} · due ${formatDate(paying.dueDate, state.settings.dateFormat)}` : undefined}
        footer={
          <>
            <Btn variant="soft" onClick={() => setPaying(null)}>Cancel</Btn>
            <Btn
              onClick={() => {
                if (!paying) return;
                setPayError('');
                if (!payAccount) { setPayError('Select the account to pay from.'); return; }
                try {
                  actions.bill.pay(paying.bill.id, paying.dueKey, { accountId: payAccount, date: payDate, amount: payAmount });
                  toast('Bill paid');
                  setPaying(null);
                } catch (err) {
                  setPayError((err as Error).message);
                }
              }}
            >
              Confirm payment
            </Btn>
          </>
        }
      >
        {payError ? <div className="form-error" role="alert">{payError}</div> : null}
        <MoneyField label="Amount" value={payAmount} currency={paying?.bill.currency ?? state.settings.currency} onChange={setPayAmount} />
        <Field label="Paid from">
          <Select value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
            <option value="">Select account</option>
            {state.accounts.filter((a) => !a.archived && a.currency === paying?.bill.currency).map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {a.currency}</option>
            ))}
          </Select>
        </Field>
        <Field label="Payment date"><Input type="date" value={payDate} max={todayISO()} onChange={(e) => setPayDate(e.target.value)} /></Field>
        <p className="hint">Paying creates one expense transaction for this occurrence. The same occurrence can never be paid twice.</p>
      </Sheet>

      <Confirm
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete bill?"
        message="Only bills without payment history can be deleted. Others can be archived."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          actions.bill.remove(deleteTarget.id);
          setDeleteTarget(null);
          toast('Bill deleted');
        }}
      />
    </Screen>
  );
}

function BillSheet({
  editing,
  onClose,
  onDelete,
}: {
  editing: Bill | null;
  onClose: () => void;
  onDelete: (bill: Bill) => void;
}) {
  const state = useApp();
  const [name, setName] = useState(editing?.name ?? '');
  const [amount, setAmount] = useState(editing?.amount ?? 0);
  const [currency, setCurrency] = useState(editing?.currency ?? state.settings.currency);
  const [category, setCategory] = useState(editing?.category ?? 'Utilities');
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? todayISO());
  const [frequency, setFrequency] = useState<BillFrequency>(editing?.frequency ?? 'monthly');
  const [reminderDays, setReminderDays] = useState(editing?.reminderDays ?? 3);
  const [accountId, setAccountId] = useState(editing?.accountId ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [error, setError] = useState('');
  const accounts = state.accounts.filter((a) => !a.archived && a.currency === currency);

  const save = () => {
    setError('');
    if (!name.trim()) { setError('Bill name is required.'); return; }
    if (amount <= 0) { setError('Enter the bill amount.'); return; }
    try {
      const payload = {
        name: name.trim(), amount, currency, category, dueDate, frequency,
        reminderDays, accountId: accountId || undefined, notes: notes.trim() || undefined,
      };
      if (editing) actions.bill.update(editing.id, payload);
      else actions.bill.add(payload);
      toast(editing ? 'Bill updated' : 'Bill added');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Edit bill' : 'New bill'}
      footer={<><Btn variant="soft" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Save bill</Btn></>}
    >
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <Field label="Bill name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Electricity" autoFocus /></Field>
      <MoneyField label="Amount" value={amount} currency={currency} onChange={setAmount} />
      <div className="row">
        <CurrencySelect value={currency} onChange={setCurrency} />
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </div>
      <div className="row">
        <Field label="First due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        <Field label="Frequency">
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value as BillFrequency)}>
            {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </Field>
      </div>
      <div className="row">
        <Field label="Remind days before">
          <Input type="number" min={0} max={30} value={reminderDays} onChange={(e) => setReminderDays(Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <Field label="Default account">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Choose when paying</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
      {editing ? (
        <Btn variant="ghost" icon={<Trash2 size={16} />} onClick={() => onDelete(editing)}>Delete bill</Btn>
      ) : null}
      <p className="tiny muted">Recurring occurrences are generated from this schedule and are idempotent — the same due date is never created twice.</p>
    </Sheet>
  );
}

/* ----------------------------------------------------------------- calendar */

type CalEvent = {
  key: string;
  date: string;
  kind: 'salary' | 'emi' | 'bill' | 'goal';
  title: string;
  amount: number;
  currency: string;
  link: string;
  status: string;
};

export function CalendarScreen() {
  const state = useApp();
  const today = todayISO();
  const [monthISO, setMonthISO] = useState(monthStart(today));
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<'month' | 'agenda'>('month');

  const events = useMemo<CalEvent[]>(() => {
    const list: CalEvent[] = [];
    const from = monthStart(monthISO);
    const to = monthEnd(monthISO);

    for (const job of state.jobs.filter((j) => j.status === 'active')) {
      for (const period of salaryPeriods(job, monthISO)) {
        list.push({
          key: `salary:${job.id}:${period.periodKey}`,
          date: period.date,
          kind: 'salary',
          title: `${job.company} salary`,
          amount: period.base,
          currency: job.currency,
          link: `#/salary/record/${job.id}/${period.periodKey}`,
          status: period.date < today ? 'overdue' : 'upcoming',
        });
      }
    }
    for (const loan of state.loans.filter((l) => l.status === 'active')) {
      for (const emi of generateSchedule(loan)) {
        if (emi.dueDate < from || emi.dueDate > to) continue;
        const remaining = emi.totalDue - emiPaid(state.emiPayments, emi.id).amount;
        if (remaining <= 0) continue;
        list.push({
          key: `emi:${emi.id}`,
          date: emi.dueDate,
          kind: 'emi',
          title: `${loan.name} EMI ${emi.index}`,
          amount: remaining,
          currency: loan.currency,
          link: `#/loans/${loan.id}`,
          status: emi.dueDate < today ? 'overdue' : 'upcoming',
        });
      }
    }
    for (const occurrence of billOccurrenceList(state, from, to, today)) {
      if (occurrence.paid) continue;
      list.push({
        key: occurrence.dueKey,
        date: occurrence.dueDate,
        kind: 'bill',
        title: occurrence.bill.name,
        amount: occurrence.bill.amount,
        currency: occurrence.bill.currency,
        link: '#/bills',
        status: occurrence.status,
      });
    }
    for (const goal of state.goals.filter((g) => !g.archived && g.targetDate)) {
      const date = goal.targetDate as string;
      if (date < from || date > to) continue;
      list.push({
        key: `goal:${goal.id}`,
        date,
        kind: 'goal',
        title: `${goal.name} target date`,
        amount: goal.target,
        currency: goal.currency,
        link: '#/savings',
        status: 'upcoming',
      });
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [state, monthISO, today]);

  const first = parseISODate(`${monthISO}-01`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // Monday-first grid
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoDate(new Date(first.getFullYear(), first.getMonth(), i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const dayEvents = events.filter((e) => e.date === selected);
  const monthLabel = formatMonth(`${monthISO}-01`);

  const shiftMonth = (delta: number) => {
    const d = parseISODate(`${monthISO}-01`);
    const next = new Date(d.getFullYear(), d.getMonth() + delta, 1);
    setMonthISO(isoDate(next));
    if (monthKeyOf(selected) !== isoDate(next).slice(0, 7)) setSelected(isoDate(next));
  };

  return (
    <Screen title="Financial calendar" subtitle="Salary, EMIs, bills and savings milestones" back>
      <div className="spread">
        <button className="icon-btn" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={20} /></button>
        <div style={{ textAlign: 'center' }}>
          <p className="card-title">{monthLabel}</p>
          <p className="tiny muted">{events.length} events</p>
        </div>
        <button className="icon-btn" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={20} /></button>
      </div>

      <Segmented
        ariaLabel="Calendar view"
        value={view}
        onChange={setView}
        options={[{ value: 'month', label: 'Month' }, { value: 'agenda', label: 'Agenda' }]}
      />

      <Card>
        <div className="cal-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} className="cal-dow">{d}</span>)}
          {cells.map((date, index) => {
            if (!date) return <span key={`empty-${index}`} className="cal-cell cal-cell--empty" />;
            const day = Number(date.slice(8));
            const dots = [...new Set(events.filter((e) => e.date === date).map((e) => e.kind))];
            return (
              <button
                key={date}
                className={`cal-cell ${date === today ? 'cal-cell--today' : ''} ${date === selected ? 'cal-cell--selected' : ''}`}
                onClick={() => setSelected(date)}
                aria-label={`${formatDate(date)}${dots.length ? `, ${dots.length} events` : ''}`}
              >
                <span>{day}</span>
                <span className="cal-dots">
                  {dots.map((kind) => <i key={kind} className={`d-${kind}`} />)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="legend">
          <span className="legend__item"><i className="dot d-salary" style={{ background: 'var(--brand)' }} /> Salary</span>
          <span className="legend__item"><i className="dot" style={{ background: 'var(--warn)' }} /> EMI</span>
          <span className="legend__item"><i className="dot" style={{ background: 'var(--danger)' }} /> Bill</span>
          <span className="legend__item"><i className="dot" style={{ background: 'var(--info)' }} /> Savings</span>
        </div>
      </Card>

      {view === 'month' ? (
        <section>
          <div className="section-head">
            <div>
              <h2 className="section-title">{formatDate(selected, state.settings.dateFormat)}</h2>
              <p className="section-sub">{dayEvents.length ? `${dayEvents.length} financial events` : 'Nothing scheduled'}</p>
            </div>
          </div>
          <Card className="card--flush">
            {dayEvents.length ? dayEvents.map((event) => <EventRow key={event.key} event={event} />) : (
              <Empty title="Nothing on this day" body="Pick another date or browse the agenda." />
            )}
          </Card>
        </section>
      ) : (
        <Card className="card--flush">
          {events.length ? events.map((event) => <EventRow key={event.key} event={event} />) : (
            <Empty title="No events this month" body="Salary schedules, EMIs and bills appear automatically." />
          )}
        </Card>
      )}
    </Screen>
  );
}

function EventRow({ event }: { event: CalEvent }) {
  const state = useApp();
  const hide = state.settings.hideBalances;
  return (
    <button className="list-row" onClick={() => navigate(event.link.replace('#', ''))}>
      <span className="list-row__icon">
        {event.kind === 'salary' ? <CalendarDays size={17} /> : event.kind === 'emi' ? <Receipt size={17} /> : <CalendarDays size={17} />}
      </span>
      <span className="list-row__text">
        <span className="list-row__title">{event.title}</span>
        <span className="list-row__sub">{formatDate(event.date, state.settings.dateFormat)} · {event.kind}</span>
      </span>
      <span className="list-row__trail" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <span className="num small">{formatMoney(event.amount, event.currency, { hide })}</span>
        {event.status === 'overdue' ? <StatusPill status="overdue" /> : null}
      </span>
    </button>
  );
}

function monthKeyOf(date: string) {
  return date.slice(0, 7);
}

void WEEKDAYS;
void MoneyInput;
