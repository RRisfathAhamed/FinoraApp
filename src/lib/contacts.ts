/**
 * Contact picker bridge. The Android build opens the system contact picker so a
 * friend loan can be linked to a real person without Finora reading the whole
 * address book. On the web the bridge is absent and the form falls back to
 * typing a name and phone number.
 */
import { requestNativePermission } from './nativePerms';

export interface PickedContact {
  name: string;
  phone: string;
}

interface ContactsBridge {
  pick(): void;
}

declare global {
  interface Window {
    FinoraContacts?: ContactsBridge;
    FinoraContactsPicked?: (json: string) => void;
  }
}

export function hasContactPicker(): boolean {
  return typeof window !== 'undefined' && Boolean(window.FinoraContacts?.pick);
}

export async function pickContact(): Promise<PickedContact | null> {
  if (!hasContactPicker()) return null;
  await requestNativePermission('contacts');
  return new Promise<PickedContact | null>((resolve) => {
    let settled = false;
    const finish = (value: PickedContact | null) => {
      if (settled) return;
      settled = true;
      delete window.FinoraContactsPicked;
      resolve(value);
    };
    window.FinoraContactsPicked = (json: string) => {
      try {
        const parsed = JSON.parse(json) as PickedContact;
        finish(parsed?.name || parsed?.phone ? parsed : null);
      } catch {
        finish(null);
      }
    };
    try {
      window.FinoraContacts?.pick();
    } catch {
      finish(null);
    }
    window.setTimeout(() => finish(null), 90_000);
  });
}
