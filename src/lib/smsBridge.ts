/**
 * Bridge to a native Android host.
 *
 * A browser cannot read SMS. An Android build that is installed as the user's
 * default messaging app (or otherwise holds READ_SMS) can expose this interface
 * on `window.FinoraNative.sms`. Finora will then read bank messages on launch,
 * parse them on-device into drafts, and require the user to accept or deny each
 * one before any transaction is created.
 *
 * The web build deliberately has no bridge: `getSmsBridge()` returns undefined
 * and the UI explains that messages must be pasted instead.
 */

export interface NativeSmsMessage {
  /** Platform message id, used by the host to avoid re-reading the same row. */
  id?: string;
  /** Sender / originating address. */
  address?: string;
  body: string;
  /** Milliseconds since epoch. */
  date?: number;
}

export interface NativeSmsBridge {
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  readMessages(options: { sinceDays: number }): Promise<NativeSmsMessage[]>;
}

declare global {
  interface Window {
    FinoraNative?: {
      sms?: NativeSmsBridge;
    };
  }
}

export function getSmsBridge(): NativeSmsBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  if ((window as any).AndroidSmsBridge && (!window.FinoraNative || !window.FinoraNative.sms)) {
    window.FinoraNative = window.FinoraNative || {};
    window.FinoraNative.sms = {
      hasPermission: async () => {
        try {
          const res = (window as any).AndroidSmsBridge.hasPermission();
          return res === 'true' || res === true;
        } catch {
          return false;
        }
      },
      requestPermission: async () => {
        try {
          (window as any).AndroidSmsBridge.requestPermission();
          // requestPermissions is asynchronous; wait for the runtime result
          // instead of reporting success before the user has answered.
          for (let attempt = 0; attempt < 40; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            if ((window as any).AndroidSmsBridge.hasPermission() === 'true') return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      readMessages: async (options: { sinceDays: number }) => {
        try {
          const json = (window as any).AndroidSmsBridge.readMessages(options.sinceDays || 30);
          return JSON.parse(json);
        } catch {
          return [];
        }
      },
    };
  }
  const bridge = window.FinoraNative?.sms;
  if (!bridge) return undefined;
  return typeof bridge.readMessages === 'function' ? bridge : undefined;
}

export function hasSmsBridge(): boolean {
  return Boolean(getSmsBridge());
}

export async function requestSmsPermission(): Promise<boolean> {
  const bridge = getSmsBridge();
  if (!bridge) return false;
  try {
    if (await bridge.hasPermission()) return true;
    return await bridge.requestPermission();
  } catch {
    return false;
  }
}

export async function readDeviceMessages(sinceDays = 30): Promise<NativeSmsMessage[]> {
  const bridge = getSmsBridge();
  if (!bridge) return [];
  try {
    if (!(await bridge.hasPermission())) return [];
    const messages = await bridge.readMessages({ sinceDays });
    return Array.isArray(messages) ? messages.filter((message) => Boolean(message?.body)) : [];
  } catch (error) {
    console.warn('Finora: could not read device messages', error);
    return [];
  }
}
