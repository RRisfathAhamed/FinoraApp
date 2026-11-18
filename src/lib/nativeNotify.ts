/**
 * Device reminders for the Android build.
 *
 * Reminders are queued with AlarmManager so they appear in the notification
 * shade and on the lock screen even when Finora is closed. Only obligations the
 * user already tracks are scheduled, and the same event is never queued twice.
 */
import type { AppState } from './types';
import { addDays, todayISO, upcomingItems } from './calc';
import { formatMoney } from './money';
import { nextReminderDate, reminderAt, reminderCategoryLabel } from './reminders';

interface NotifyBridge {
  post(id: number, title: string, body: string): void;
  schedule(id: number, title: string, body: string, at: number, repeatMillis?: number): void;
  cancel(id: number): void;
}

const STORAGE_KEY = 'finora-scheduled-notifications';

function bridge(): NotifyBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  const candidate = (window as unknown as { FinoraNotifications?: NotifyBridge }).FinoraNotifications;
  return candidate && typeof candidate.schedule === 'function' ? candidate : undefined;
}

export function hasDeviceNotifications(): boolean {
  return Boolean(bridge());
}

export function postTestNotification(): boolean {
  const host = bridge();
  if (!host) return false;
  try {
    host.post(9001, 'Finora reminders are on', 'Salary, EMI and bill reminders will appear here — including on your lock screen.');
    return true;
  } catch {
    return false;
  }
}

function hashId(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 2_000_000_000) + 1000;
}

function readScheduled(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeScheduled(keys: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* storage may be unavailable */
  }
}

/**
 * Reconcile the device alarm queue with the user's current obligations.
 * Future dues are scheduled for 09:00 on (due date − reminder days).
 */
export function syncDeviceReminders(state: AppState): void {
  const host = bridge();
  if (!host) return;

  const now = Date.now();
  const lead = Math.max(0, state.settings.remindDays);
  const wanted = new Map<string, { id: number; title: string; body: string; at: number; repeatMillis?: number }>();

  for (const item of upcomingItems(state).slice(0, 40)) {
    const due = new Date(`${item.dueDate}T09:00:00`);
    if (Number.isNaN(due.getTime())) continue;
    due.setDate(due.getDate() - lead);
    const at = due.getTime();
    if (at <= now + 30_000) continue;
    const key = item.key;
    const amount = formatMoney(item.amount, item.currency);
    wanted.set(key, {
      id: hashId(item.key),
      title: item.kind === 'salary' ? 'Salary expected' : item.kind === 'emi' ? 'Loan repayment due' : 'Bill due',
      body: `${item.title} · ${amount}`,
      at,
    });
  }

  for (const reminder of state.reminders ?? []) {
    if (!reminder.active || reminder.notify !== 'device' || !reminder.date) continue;
    let date = nextReminderDate(reminder, todayISO());
    if (!date) continue;
    let at = reminderAt(reminder, date) ?? 0;
    if (at <= now + 30_000 && reminder.repeat !== 'once') {
      date = nextReminderDate(reminder, addDays(todayISO(), 1));
      at = reminderAt(reminder, date) ?? 0;
    }
    if (at <= now + 30_000) continue;
    const key = `reminder:${reminder.id}`;
    const repeatMillis = reminder.repeat === 'daily'
      ? 86_400_000
      : reminder.repeat === 'weekly'
        ? 604_800_000
        : reminder.repeat === 'monthly'
          ? -1
          : 0;
    wanted.set(key, {
      id: hashId(key),
      title: reminder.title,
      body: `${reminderCategoryLabel(reminder.category)}${reminder.amount != null ? ` · ${formatMoney(reminder.amount, reminder.currency ?? state.settings.currency)}` : ''}`,
      at,
      repeatMillis,
    });
  }

  const previous = readScheduled();
  for (const key of previous) {
    if (!wanted.has(key)) {
      try {
        host.cancel(hashId(key));
      } catch {
        /* ignore stale alarms */
      }
    }
  }

  for (const reminder of wanted.values()) {
    try {
      host.cancel(reminder.id);
      host.schedule(reminder.id, reminder.title, reminder.body, reminder.at, reminder.repeatMillis);
    } catch {
      /* ignore individual scheduling failures */
    }
  }

  writeScheduled([...wanted.keys()]);
}
