/**
 * Runtime permission bridge for the Android build.
 *
 * The web build has no bridge and falls back to the browser Notification API.
 * In the APK, the native host owns the Android permission dialogs so SMS,
 * notifications, phone calls, camera and photo access can all be requested
 * from inside Finora instead of dumping the user into system settings.
 */

export type NativePermKey = 'notifications' | 'sms' | 'calls' | 'camera' | 'photos' | 'phone' | 'contacts';

interface NativePermsBridge {
  has(key: string): string | boolean;
  request(key: string): void;
  requestAll(): void;
}

function bridge(): NativePermsBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  const candidate = (window as unknown as { FinoraNativePerms?: NativePermsBridge }).FinoraNativePerms;
  return candidate && typeof candidate.request === 'function' ? candidate : undefined;
}

export function hasNativePermsBridge(): boolean {
  return Boolean(bridge());
}

export async function nativeHasPermission(key: NativePermKey): Promise<boolean> {
  const host = bridge();
  if (!host) return false;
  try {
    const value = host.has(key);
    return value === true || value === 'true';
  } catch {
    return false;
  }
}

/** Fires the Android dialog, then polls until the user answers or we time out. */
export async function requestNativePermission(key: NativePermKey, timeoutMs = 9000): Promise<boolean> {
  const host = bridge();
  if (!host) return false;
  try {
    if (await nativeHasPermission(key)) return true;
    host.request(key);
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 220));
      if (await nativeHasPermission(key)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Ask for the whole set once, on first run. Dialog results are independent. */
export async function requestAllNativePermissions(): Promise<void> {
  const host = bridge();
  if (!host) return;
  try {
    host.requestAll();
    await new Promise((resolve) => setTimeout(resolve, 600));
  } catch {
    /* permission dialogs are best-effort */
  }
}
