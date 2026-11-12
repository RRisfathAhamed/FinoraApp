/**
 * Home-screen widget bridge. The Android widget is a native RemoteViews card;
 * the web layer pushes a small snapshot (net worth, cash, account count) after
 * each change so the widget always matches the app.
 */
import type { AppState } from './types';
import { financialSummary } from './calc';
import { formatMoney } from './money';

interface WidgetBridge {
  updateWidget(json: string): void;
  addWidget?(): void;
}

declare global {
  interface Window {
    FinoraNativeHost?: {
      exitApp?: () => void;
      setChromeColor?: (hex: string) => void;
      setLightStatusBars?: (light: boolean) => void;
      updateWidget?: (json: string) => void;
      addWidget?: () => void;
    };
  }
}

function host(): WidgetBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  const candidate = window.FinoraNativeHost;
  return candidate && typeof candidate.updateWidget === 'function' ? (candidate as WidgetBridge) : undefined;
}

export function hasHomeWidgetBridge(): boolean {
  return Boolean(host());
}

export function syncHomeWidget(state: AppState): void {
  const bridge = host();
  if (!bridge) return;
  const currency = state.settings.currency;
  const summary = financialSummary(state);
  const netWorth = summary.netWorth.get(currency) ?? 0;
  const cash = summary.cash.get(currency) ?? 0;
  const accounts = state.accounts.filter((a) => !a.archived).length;
  const hide = state.settings.hideBalances;
  const now = new Date();
  try {
    bridge.updateWidget(
      JSON.stringify({
        label: 'NET WORTH',
        value: formatMoney(netWorth, currency, { hide }),
        sub: hide ? 'Balances hidden' : `${formatMoney(cash, currency, { compact: true })} cash · ${accounts} accounts`,
        updated: `Updated ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      }),
    );
  } catch {
    /* widget updates are best-effort */
  }
}

export function requestHomeWidget(): boolean {
  if (typeof window === 'undefined') return false;
  const add = window.FinoraNativeHost?.addWidget;
  if (typeof add !== 'function') return false;
  try {
    add();
    return true;
  } catch {
    return false;
  }
}
