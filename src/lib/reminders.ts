import type { Reminder, ReminderCategory, ReminderRepeat } from './types';
import { addDays, isoDate, monthEnd, monthStart, parseISODate, todayISO } from './calc';

export const REMINDER_CATEGORIES: { value: ReminderCategory; label: string }[] = [
  { value: 'bill', label: 'Bill payment' },
  { value: 'credit-card', label: 'Credit card' },
  { value: 'loan', label: 'Loan installment' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'rent', label: 'Rent' },
  { value: 'savings', label: 'Savings goal' },
  { value: 'custom', label: 'Custom reminder' },
];

export const REMINDER_REPEATS: { value: ReminderRepeat; label: string }[] = [
  { value: 'once', label: 'One time' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
];

export function reminderCategoryLabel(category: ReminderCategory): string {
  return REMINDER_CATEGORIES.find((c) => c.value === category)?.label ?? 'Reminder';
}

export function repeatLabel(repeat: ReminderRepeat): string {
  return REMINDER_REPEATS.find((r) => r.value === repeat)?.label ?? 'One time';
}

function clampDay(year: number, month: number, day: number): string {
  const last = new Date(year, month + 1, 0).getDate();
  return isoDate(new Date(year, month, Math.min(day, last)));
}

/** Next occurrence on or after `from`, or null for a finished one-time reminder. */
export function nextReminderDate(reminder: Reminder, from = todayISO()): string | null {
  if (!reminder.active) return null;
  const start = reminder.date;
  if (!start) return null;
  if (reminder.repeat === 'once') return start >= from ? start : start;
  if (start >= from) return start;
  if (reminder.repeat === 'daily') return from;
  if (reminder.repeat === 'weekly') {
    const startDate = parseISODate(start);
    const current = parseISODate(from);
    const diff = (startDate.getDay() - current.getDay() + 7) % 7;
    return addDays(from, diff);
  }
  const startDate = parseISODate(start);
  const current = parseISODate(from);
  let candidate = clampDay(current.getFullYear(), current.getMonth(), startDate.getDate());
  if (candidate < from) candidate = clampDay(current.getFullYear(), current.getMonth() + 1, startDate.getDate());
  return candidate;
}

export function reminderAt(reminder: Reminder, date = nextReminderDate(reminder)): number | null {
  if (!date) return null;
  const at = new Date(`${date}T${reminder.time || '09:00'}:00`);
  return Number.isNaN(at.getTime()) ? null : at.getTime();
}

/** Occurrences visible in a calendar month, including recurring schedules. */
export function reminderOccurrencesInMonth(reminder: Reminder, monthISO: string): string[] {
  if (!reminder.active) return [];
  const from = monthStart(monthISO);
  const to = monthEnd(monthISO);
  if (reminder.repeat === 'once') return reminder.date >= from && reminder.date <= to ? [reminder.date] : [];
  if (reminder.repeat === 'daily') {
    const out: string[] = [];
    for (let day = from; day <= to; day = addDays(day, 1)) out.push(day);
    return out;
  }
  if (reminder.repeat === 'weekly') {
    const start = parseISODate(reminder.date);
    const out: string[] = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (parseISODate(day).getDay() === start.getDay()) out.push(day);
    }
    return out;
  }
  const start = parseISODate(reminder.date);
  const month = parseISODate(`${monthISO}-01`);
  const candidate = clampDay(month.getFullYear(), month.getMonth(), start.getDate());
  return candidate >= from && candidate <= to ? [candidate] : [];
}
