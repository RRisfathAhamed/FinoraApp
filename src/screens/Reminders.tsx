import { useMemo, useState } from 'react';
import { Bell, CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Reminder, ReminderCategory, ReminderRepeat } from '../lib/types';
import { useApp } from '../lib/hooks';
import { actions } from '../lib/store';
import { formatDate, todayISO } from '../lib/calc';
import { formatMoney } from '../lib/money';
import { nextReminderDate, reminderCategoryLabel, REMINDER_CATEGORIES, REMINDER_REPEATS, repeatLabel } from '../lib/reminders';
import { hasDeviceNotifications } from '../lib/nativeNotify';
import { requestNativePermission } from '../lib/nativePerms';
import { toast } from '../lib/toast';
import {
  Btn,
  Card,
  Confirm,
  CurrencySelect,
  Empty,
  Field,
  Input,
  MoneyField,
  Screen,
  Segmented,
  Select,
  Sheet,
  Textarea,
  Toggle,
} from '../components/ui';

interface Draft {
  title: string;
  description: string;
  category: ReminderCategory;
  amount: number;
  currency: string;
  accountId: string;
  date: string;
  time: string;
  repeat: ReminderRepeat;
  notify: 'in-app' | 'device';
  active: boolean;
}

function blankDraft(currency: string): Draft {
  return {
    title: '',
    description: '',
    category: 'custom',
    amount: 0,
    currency,
    accountId: '',
    date: todayISO(),
    time: '09:00',
    repeat: 'once',
    notify: 'in-app',
    active: true,
  };
}

function draftFrom(reminder: Reminder): Draft {
  return {
    title: reminder.title,
    description: reminder.description ?? '',
    category: reminder.category,
    amount: reminder.amount ?? 0,
    currency: reminder.currency ?? 'LKR',
    accountId: reminder.accountId ?? '',
    date: reminder.date,
    time: reminder.time || '09:00',
    repeat: reminder.repeat,
    notify: reminder.notify,
    active: reminder.active,
  };
}

export function RemindersScreen() {
  const state = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [filter, setFilter] = useState<'active' | 'all' | 'inactive'>('active');
  const [draft, setDraft] = useState<Draft>(() => blankDraft(state.settings.currency));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reminders = useMemo(() => {
    const list = [...state.reminders].sort((a, b) => a.date.localeCompare(b.date));
    if (filter === 'active') return list.filter((r) => r.active);
    if (filter === 'inactive') return list.filter((r) => !r.active);
    return list;
  }, [state.reminders, filter]);

  const openNew = () => {
    setEditing(null);
    setDraft(blankDraft(state.settings.currency));
    setError('');
    setFormOpen(true);
  };

  const openEdit = (reminder: Reminder) => {
    setEditing(reminder);
    setDraft(draftFrom(reminder));
    setError('');
    setFormOpen(true);
  };

  const save = () => {
    setError('');
    if (!draft.title.trim()) { setError('Reminder title is required.'); return; }
    if (!draft.date) { setError('Choose a reminder date.'); return; }
    if (!draft.time) { setError('Choose a reminder time.'); return; }
    setBusy(true);
    try {
      const payload = {
        title: draft.title,
        description: draft.description || undefined,
        category: draft.category,
        amount: draft.amount > 0 ? draft.amount : undefined,
        currency: draft.amount > 0 ? draft.currency : undefined,
        accountId: draft.accountId || undefined,
        date: draft.date,
        time: draft.time,
        repeat: draft.repeat,
        notify: draft.notify,
        active: draft.active,
      };
      if (editing) actions.reminder.update(editing.id, payload);
      else actions.reminder.add(payload);
      if (draft.notify === 'device') {
        if (!hasDeviceNotifications()) {
          toast('Device alerts are available in the Android app. This reminder is still saved in-app.', 'info');
        } else {
          void requestNativePermission('notifications').then((granted) => {
            if (!granted) toast('Notifications are blocked; the reminder is still available in-app.', 'info');
          });
        }
      }
      toast(editing ? 'Reminder updated' : 'Reminder created');
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Reminders"
      subtitle={`${state.reminders.filter((r) => r.active).length} active · stored on this device`}
      back
      actions={<Btn size="sm" variant="soft" icon={<Plus size={16} />} onClick={openNew}>New</Btn>}
    >
      <Segmented
        ariaLabel="Reminder filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'all', label: 'All' },
          { value: 'inactive', label: 'Paused' },
        ]}
      />

      {reminders.length ? (
        <div className="reminder-list">
          {reminders.map((reminder) => {
            const next = nextReminderDate(reminder);
            return (
              <Card key={reminder.id} className="reminder-card">
                <div className="spread">
                  <div className="hstack">
                    <span className="reminder-card__icon"><CalendarClock size={17} /></span>
                    <div>
                      <p className="reminder-card__title">{reminder.title}</p>
                      <p className="tiny muted">
                        {formatDate(next ?? reminder.date, state.settings.dateFormat)} · {reminder.time} · {repeatLabel(reminder.repeat)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={reminder.active}
                    aria-label={`${reminder.title} active`}
                    className={`switch ${reminder.active ? 'switch--on' : ''}`}
                    onClick={() => actions.reminder.toggle(reminder.id)}
                  >
                    <span className="switch__thumb" />
                  </button>
                </div>
                <div className="hstack wrap reminder-card__meta">
                  <span className="pill pill--muted">{reminderCategoryLabel(reminder.category)}</span>
                  {reminder.amount != null ? (
                    <span className="num small">{formatMoney(reminder.amount, reminder.currency ?? state.settings.currency, { hide: state.settings.hideBalances })}</span>
                  ) : null}
                  <span className="tiny muted">{reminder.notify === 'device' ? 'Device alert' : 'In-app alert'}</span>
                </div>
                {reminder.description ? <p className="small muted">{reminder.description}</p> : null}
                <div className="btn-row">
                  <Btn size="sm" variant="soft" icon={<Pencil size={15} />} onClick={() => openEdit(reminder)}>Edit</Btn>
                  <Btn size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={() => setDeleteTarget(reminder)}>Delete</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty
            icon={<Bell size={22} />}
            title={filter === 'active' ? 'No active reminders' : 'No reminders yet'}
            body="Set a reminder for rent, a credit-card payment, an insurance renewal or anything else you do not want to miss."
            action={<Btn onClick={openNew}>Create a reminder</Btn>}
          />
        </Card>
      )}

      <div className="form-note">
        Device alerts use Android’s alarm scheduler and appear even when Finora is closed. In-app reminders appear in the notification centre and Home. Repeating reminders use the next due date.
      </div>

      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit reminder' : 'New reminder'}
        subtitle="In-app and device notifications"
        footer={
          <>
            <Btn variant="soft" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</Btn>
            <Btn onClick={save} loading={busy}>{editing ? 'Save reminder' : 'Create reminder'}</Btn>
          </>
        }
      >
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <Field label="Title *"><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Credit card payment" autoFocus /></Field>
        <Field label="Description"><Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Optional details" /></Field>
        <div className="row">
          <Field label="Category">
            <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ReminderCategory })}>
              {REMINDER_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Repeat">
            <Select value={draft.repeat} onChange={(e) => setDraft({ ...draft, repeat: e.target.value as ReminderRepeat })}>
              {REMINDER_REPEATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="row">
          <Field label="Date *"><Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
          <Field label="Time *"><Input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></Field>
        </div>
        <div className="row">
          <MoneyField label="Amount (optional)" value={draft.amount} currency={draft.currency} onChange={(value) => setDraft({ ...draft, amount: value })} />
          <CurrencySelect value={draft.currency} onChange={(currency) => setDraft({ ...draft, currency })} />
        </div>
        <Field label="Related account (optional)">
          <Select
            value={draft.accountId}
            onChange={(e) => {
              const account = state.accounts.find((a) => a.id === e.target.value);
              setDraft({ ...draft, accountId: e.target.value, currency: account?.currency ?? draft.currency });
            }}
          >
            <option value="">None</option>
            {state.accounts.filter((a) => !a.archived).map((account) => (
              <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notification method">
          <Select value={draft.notify} onChange={(e) => setDraft({ ...draft, notify: e.target.value as Draft['notify'] })}>
            <option value="in-app">In-app notification</option>
            <option value="device">Device notification (Android)</option>
          </Select>
        </Field>
        <Toggle checked={draft.active} onChange={(active) => setDraft({ ...draft, active })} label="Active" description="Paused reminders stay saved but do not alert." />
      </Sheet>

      <Confirm
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete reminder?"
        message={`“${deleteTarget?.title ?? 'This reminder'}” will be removed from your notifications and device alarms.`}
        confirmLabel="Delete reminder"
        onConfirm={() => {
          if (!deleteTarget) return;
          actions.reminder.remove(deleteTarget.id);
          setDeleteTarget(null);
          toast('Reminder deleted');
        }}
      />
    </Screen>
  );
}
