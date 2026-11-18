import { describe, expect, it } from 'vitest';
import { nextReminderDate, reminderOccurrencesInMonth } from './reminders';
import type { Reminder } from './types';

function reminder(patch: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    title: 'Test reminder',
    category: 'custom',
    date: '2026-11-15',
    time: '09:00',
    repeat: 'once',
    notify: 'in-app',
    active: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...patch,
  };
}

describe('reminder scheduling', () => {
  it('keeps an overdue one-time reminder visible until it is handled', () => {
    expect(nextReminderDate(reminder({ date: '2026-11-10' }), '2026-11-15')).toBe('2026-11-10');
    expect(nextReminderDate(reminder({ date: '2026-11-20' }), '2026-11-15')).toBe('2026-11-20');
  });

  it('returns null for paused reminders so they are never notified', () => {
    expect(nextReminderDate(reminder({ active: false }), '2026-11-15')).toBeNull();
    expect(reminderOccurrencesInMonth(reminder({ active: false, repeat: 'daily' }), '2026-11')).toEqual([]);
  });

  it('finds the next weekly occurrence from the start weekday', () => {
    // 2026-11-15 is a Sunday; the reminder started on a Wednesday.
    expect(nextReminderDate(reminder({ date: '2026-10-21', repeat: 'weekly' }), '2026-11-15')).toBe('2026-11-18');
  });

  it('clamps monthly reminders to the last day of short months', () => {
    expect(nextReminderDate(reminder({ date: '2026-01-31', repeat: 'monthly' }), '2026-02-01')).toBe('2026-02-28');
    expect(nextReminderDate(reminder({ date: '2026-01-31', repeat: 'monthly' }), '2026-03-01')).toBe('2026-03-31');
  });

  it('lists every daily occurrence in the requested calendar month', () => {
    const occurrences = reminderOccurrencesInMonth(reminder({ repeat: 'daily' }), '2026-02');
    expect(occurrences).toHaveLength(28);
    expect(occurrences[0]).toBe('2026-02-01');
    expect(occurrences[occurrences.length - 1]).toBe('2026-02-28');
  });

  it('shows one monthly and one one-time occurrence in the calendar', () => {
    expect(reminderOccurrencesInMonth(reminder({ date: '2026-01-31', repeat: 'monthly' }), '2026-02')).toEqual(['2026-02-28']);
    expect(reminderOccurrencesInMonth(reminder({ date: '2026-02-12' }), '2026-02')).toEqual(['2026-02-12']);
    expect(reminderOccurrencesInMonth(reminder({ date: '2026-03-12' }), '2026-02')).toEqual([]);
  });
});
