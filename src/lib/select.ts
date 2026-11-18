import type { AppState, VaultDoc } from './types';
import {
  addDays,
  addMonthsClamped,
  billOccurrenceList,
  budgetSpent,
  budgetStatus,
  daysBetween,
  emiPaid,
  emiStatus,
  generateSchedule,
  goalBalance,
  isFlexibleLoan,
  loanOutstanding,
  monthEnd,
  monthStart,
  salaryNet,
  salaryReceived,
  salaryStatus,
  todayISO,
} from './calc';
import { monthKey } from './calc';
import { formatMoney } from './money';
import { nextReminderDate, reminderCategoryLabel } from './reminders';

export interface NotificationItem {
  key: string;
  kind: 'salary' | 'emi' | 'bill' | 'budget' | 'savings' | 'sms' | 'reminder';
  title: string;
  body: string;
  date: string;
  link: string;
  urgency: 'info' | 'warning' | 'danger';
}

const money = (amount: number, currency: string) => formatMoney(amount, currency);

/** Notifications are derived every read and de-duplicated by a stable key. */
export function buildNotifications(state: AppState): NotificationItem[] {
  const today = todayISO();
  const out: NotificationItem[] = [];
  const days = state.settings.remindDays;

  if (state.settings.notifySalary) {
    for (const job of state.jobs) {
      if (job.status !== 'active') continue;
      for (const record of state.salaryRecords) {
        if (record.jobId !== job.id) continue;
        const net = salaryNet(record, job);
        const remaining = Math.max(0, net - salaryReceived(record));
        if (remaining <= 0) continue;
        const due = record.periodDate;
        const overdue = due < today;
        out.push({
          key: `salary-due:${record.id}`,
          kind: 'salary',
          title: overdue ? 'Salary payment outstanding' : 'Salary expected',
          body: `${job.company} · ${money(remaining, job.currency)} remaining for ${record.periodKey}`,
          date: due,
          link: `#/salary/record/${job.id}/${record.periodKey}`,
          urgency: overdue ? 'warning' : 'info',
        });
      }
    }
  }

  if (state.settings.notifyEmi) {
    for (const loan of state.loans) {
      if (loan.status === 'closed') continue;
      for (const emi of generateSchedule(loan)) {
        const status = emiStatus(emi, state.emiPayments, today);
        if (status === 'paid' || status === 'upcoming' || status === 'partial') continue;
        const remaining = emi.totalDue - emiPaid(state.emiPayments, emi.id).amount;
        if (remaining <= 0) continue;
        if (daysBetween(today, emi.dueDate) > days) continue;
        out.push({
          key: `emi-due:${emi.id}`,
          kind: 'emi',
          title: isFlexibleLoan(loan)
            ? status === 'overdue'
              ? 'Repayment overdue'
              : 'Repayment due soon'
            : status === 'overdue'
              ? 'EMI overdue'
              : 'EMI due soon',
          body: `${loan.name} · ${money(remaining, loan.currency)} due ${emi.dueDate}`,
          date: emi.dueDate,
          link: `#/loans/${loan.id}`,
          urgency: status === 'overdue' ? 'danger' : 'warning',
        });
      }

      // Gold pawning matures on a specific redemption date. Notify on the
      // standard 30/15/7/3-day ladder, on maturity, and after it passes.
      if (loan.category === 'gold' && loan.promisedDate) {
        const left = daysBetween(today, loan.promisedDate);
        if (left <= 30) {
          const milestone = left < 0 ? -1 : left <= 3 ? 3 : left <= 7 ? 7 : left <= 15 ? 15 : 30;
          const outstanding = loanOutstanding(loan, state.emiPayments);
          out.push({
            key: `gold-maturity:${loan.id}:${milestone}`,
            kind: 'emi',
            title: left < 0
              ? 'Gold pawn overdue for redemption'
              : left === 0
                ? 'Gold pawn matures today'
                : `Gold pawn matures in ${left} day${left === 1 ? '' : 's'}`,
            body: `${loan.name} · ${money(outstanding, loan.currency)} outstanding · redeem by ${loan.promisedDate}`,
            date: loan.promisedDate,
            link: `#/loans/${loan.id}`,
            urgency: left <= 3 ? 'danger' : 'warning',
          });
        }
      }
    }
  }

  if (state.settings.notifyBills) {
    for (const occurrence of billOccurrenceList(state, addDays(today, -30), addDays(today, 45), today)) {
      if (occurrence.paid) continue;
      if (occurrence.status === 'upcoming') continue;
      if (daysBetween(today, occurrence.dueDate) > days) continue;
      out.push({
        key: `bill-due:${occurrence.dueKey}`,
        kind: 'bill',
        title: occurrence.status === 'overdue' ? 'Bill overdue' : 'Bill due soon',
        body: `${occurrence.bill.name} · ${money(occurrence.bill.amount, occurrence.bill.currency)}`,
        date: occurrence.dueDate,
        link: '#/bills',
        urgency: occurrence.status === 'overdue' ? 'danger' : 'warning',
      });
    }
  }

  if (state.settings.notifyBudgets) {
    for (const budget of state.budgets) {
      if (budget.archived || budget.paused) continue;
      const spent = budgetSpent(state, budget, today);
      const status = budgetStatus(spent, budget);
      if (status === 'ok') continue;
      out.push({
        key: `budget:${budget.id}:${monthKey(today)}:${status}`,
        kind: 'budget',
        title: status === 'over' ? 'Budget exceeded' : 'Budget warning',
        body: `${budget.name} · ${money(spent, budget.currency)} of ${money(budget.amount, budget.currency)} used`,
        date: today,
        link: '#/budgets',
        urgency: status === 'over' ? 'danger' : 'warning',
      });
    }
  }

  if (state.settings.notifySavings) {
    for (const goal of state.goals) {
      if (goal.archived) continue;
      const balance = goalBalance(goal);
      if (goal.target > 0 && balance >= goal.target) {
        out.push({
          key: `goal-complete:${goal.id}`,
          kind: 'savings',
          title: 'Savings goal reached',
          body: `${goal.name} is fully funded.`,
          date: today,
          link: '#/savings',
          urgency: 'info',
        });
      } else if (goal.target > 0 && balance / goal.target >= 0.75) {
        out.push({
          key: `goal-progress:${goal.id}`,
          kind: 'savings',
          title: 'Savings milestone',
          body: `${goal.name} is ${Math.round((balance / goal.target) * 100)}% funded.`,
          date: today,
          link: '#/savings',
          urgency: 'info',
        });
      } else if (goal.targetDate && goal.targetDate < addDays(today, 14)) {
        out.push({
          key: `goal-due:${goal.id}`,
          kind: 'savings',
          title: 'Savings target date approaching',
          body: `${goal.name} · ${money(Math.max(0, goal.target - balance), goal.currency)} remaining`,
          date: goal.targetDate,
          link: '#/savings',
          urgency: 'warning',
        });
      }
    }
  }

  for (const reminder of state.reminders ?? []) {
    if (!reminder.active) continue;
    const date = nextReminderDate(reminder, today);
    if (!date) continue;
    if (date > addDays(today, Math.max(days, 0))) continue;
    const overdue = reminder.repeat === 'once' && date < today;
    const body = [
      reminderCategoryLabel(reminder.category),
      reminder.amount != null ? money(reminder.amount, reminder.currency ?? state.settings.currency) : null,
      reminder.time ? `at ${reminder.time}` : null,
    ].filter(Boolean).join(' · ');
    out.push({
      key: `reminder:${reminder.id}`,
      kind: 'reminder',
      title: reminder.title,
      body,
      date,
      link: '#/reminders',
      urgency: overdue ? 'danger' : 'info',
    });
  }

  for (const draft of state.smsDrafts) {
    if (draft.status !== 'pending') continue;
    out.push({
      key: `sms:${draft.id}`,
      kind: 'sms',
      title: 'Bank message needs review',
      body: `${draft.merchant}${draft.amount ? ` · ${money(draft.amount, draft.currency)}` : ''}`,
      date: draft.date,
      link: '#/sms',
      urgency: 'info',
    });
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Notifications still visible after individual deletes and "clear all". */
export function visibleNotifications(state: AppState): NotificationItem[] {
  const deleted = new Set(state.deletedNotifKeys ?? []);
  return buildNotifications(state).filter((item) => !deleted.has(item.key));
}

/* ----------------------------------------------------------------- search */

export interface SearchGroup {
  type: string;
  label: string;
  items: { id: string; title: string; subtitle: string; amount?: string; link: string }[];
}

export function globalSearch(state: AppState, term: string): SearchGroup[] {
  const q = term.trim().toLowerCase();
  if (q.length < 1) return [];
  const hit = (...values: (string | undefined)[]) =>
    values.some((v) => (v ?? '').toLowerCase().includes(q));
  const money = (amount: number, currency: string) => formatMoney(amount, currency);
  const groups: SearchGroup[] = [];

  const accounts = state.accounts
    .filter((a) => hit(a.name, a.bankName, a.identifier))
    .map((a) => ({
      id: a.id,
      title: a.name,
      subtitle: `${a.kind} · ${a.currency}`,
      link: `#/money/account/${a.id}`,
    }));
  if (accounts.length) groups.push({ type: 'account', label: 'Accounts', items: accounts });

  const txns = state.transactions
    .filter((t) => hit(t.merchant, t.notes, t.category))
    .slice(0, 25)
    .map((t) => ({
      id: t.id,
      title: t.merchant || t.category || 'Transaction',
      subtitle: `${t.date} · ${t.kind}`,
      amount: money(t.amount, t.currency),
      link: `#/money/txn/${t.id}`,
    }));
  if (txns.length) groups.push({ type: 'txn', label: 'Transactions', items: txns });

  const jobs = state.jobs
    .map((j) => ({ j, r: state.salaryRecords.find((x) => x.jobId === j.id && hit(x.periodKey)) }))
    .filter(({ j, r }) => hit(j.company, j.title) || r)
    .map(({ j }) => ({
      id: j.id,
      title: j.company,
      subtitle: `${j.title} · ${j.salaryType}`,
      link: `#/salary/new/${j.id}`,
    }));
  if (jobs.length) groups.push({ type: 'salary', label: 'Salary jobs', items: jobs });

  const loans = state.loans
    .filter((l) => hit(l.name, l.lender))
    .map((l) => ({
      id: l.id,
      title: l.name,
      subtitle: l.lender,
      amount: money(l.principal, l.currency),
      link: `#/loans/${l.id}`,
    }));
  if (loans.length) groups.push({ type: 'loan', label: 'Loans', items: loans });

  const bills = state.bills
    .filter((b) => hit(b.name, b.category))
    .map((b) => ({
      id: b.id,
      title: b.name,
      subtitle: `${b.frequency} · ${b.category}`,
      amount: money(b.amount, b.currency),
      link: '#/bills',
    }));
  if (bills.length) groups.push({ type: 'bill', label: 'Bills', items: bills });

  const docs = state.documents
    .filter((d) => hit(d.name, d.category))
    .map((d) => ({
      id: d.id,
      title: d.name,
      subtitle: d.category.replace('-', ' '),
      link: `#/vault/${d.id}`,
    }));
  if (docs.length) groups.push({ type: 'document', label: 'Documents', items: docs });

  const goals = state.goals
    .filter((g) => hit(g.name))
    .map((g) => ({
      id: g.id,
      title: g.name,
      subtitle: 'Savings goal',
      amount: money(goalBalance(g), g.currency),
      link: '#/savings',
    }));
  if (goals.length) groups.push({ type: 'goal', label: 'Savings goals', items: goals });

  const categories = [...new Set(state.transactions.map((t) => t.category).filter(Boolean))]
    .filter((c) => hit(c))
    .map((c) => ({
      id: c as string,
      title: c as string,
      subtitle: 'Category',
      link: `#/insights?category=${encodeURIComponent(c as string)}`,
    }));
  if (categories.length) groups.push({ type: 'category', label: 'Categories', items: categories });

  const reminders = state.reminders
    .filter((r) => hit(r.title, r.description, reminderCategoryLabel(r.category)))
    .map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: `${reminderCategoryLabel(r.category)} · ${r.date} ${r.time}`,
      amount: r.amount != null ? money(r.amount, r.currency ?? state.settings.currency) : undefined,
      link: '#/reminders',
    }));
  if (reminders.length) groups.push({ type: 'reminder', label: 'Reminders', items: reminders });

  const notifications = visibleNotifications(state)
    .filter((n) => hit(n.title, n.body))
    .slice(0, 12)
    .map((n) => ({
      id: n.key,
      title: n.title,
      subtitle: n.body,
      link: n.link,
    }));
  if (notifications.length) groups.push({ type: 'notification', label: 'Notifications', items: notifications });

  return groups;
}

/* --------------------------------------------------------------- insights */

export interface ReportRow {
  label: string;
  value: number;
}

export function nextSalaryOccurrence(weekday: number): string {
  const today = todayISO();
  for (let i = 0; i < 14; i += 1) {
    const d = addDays(today, i);
    if (new Date(`${d}T00:00:00`).getDay() === weekday) return d;
  }
  return today;
}

export function lastSixMonths(): { from: string; to: string; label: string }[] {
  const today = todayISO();
  const out: { from: string; to: string; label: string }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const base = addMonthsClamped(monthStart(today), -i);
    out.push({ from: monthStart(base), to: monthEnd(base), label: base.slice(0, 7) });
  }
  return out;
}

export function salaryStatusLabel(state: AppState, jobId: string, periodKey: string): string {
  const record = state.salaryRecords.find((r) => r.jobId === jobId && r.periodKey === periodKey);
  const job = state.jobs.find((j) => j.id === jobId);
  if (!record || !job) return 'Not recorded';
  return salaryStatus(record, job);
}

export function linkedDocuments(state: AppState, type: VaultDoc['links'][number]['type'], id: string): VaultDoc[] {
  return state.documents.filter((d) => d.links.some((l) => l.type === type && l.id === id));
}
