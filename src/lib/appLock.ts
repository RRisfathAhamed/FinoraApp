export type LockTimeout = 0 | 30_000 | 60_000 | 300_000 | 900_000;

export interface AppLockSettings {
  enabled: boolean;
  timeout: LockTimeout;
  lockOnBackground: boolean;
}

export const LOCK_SETTINGS_EVENT = 'finora:app-lock-settings';
export const LOCK_TIMEOUTS: { value: LockTimeout; label: string }[] = [
  { value: 0, label: 'Immediately when Finora leaves the screen' },
  { value: 30_000, label: 'After 30 seconds' },
  { value: 60_000, label: 'After 1 minute' },
  { value: 300_000, label: 'After 5 minutes' },
  { value: 900_000, label: 'After 15 minutes' },
];

const STORAGE_KEY = 'finora.app-lock.v1';
const DEFAULTS: AppLockSettings = {
  enabled: false,
  timeout: 60_000,
  lockOnBackground: false,
};

let locked = false;

function isTimeout(value: unknown): value is LockTimeout {
  return LOCK_TIMEOUTS.some((option) => option.value === value);
}

export function loadLockSettings(): AppLockSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppLockSettings>;
    return {
      enabled: parsed.enabled === true,
      timeout: isTimeout(parsed.timeout) ? parsed.timeout : DEFAULTS.timeout,
      lockOnBackground: parsed.lockOnBackground === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveLockSettings(settings: AppLockSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* Preferences stay in memory when storage is unavailable. */
  }
  window.dispatchEvent(new CustomEvent<AppLockSettings>(LOCK_SETTINGS_EVENT, { detail: settings }));
}

/** Shared with the native Back bridge so Back can never dismiss the lock. */
export function isAppLocked(): boolean {
  return locked;
}

export function setAppLocked(next: boolean): void {
  locked = next;
}

export function timeoutLabel(timeout: LockTimeout): string {
  return LOCK_TIMEOUTS.find((option) => option.value === timeout)?.label ?? 'After 1 minute';
}
