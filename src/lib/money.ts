/**
 * Decimal-safe money helpers. Every stored amount is an integer in the
 * currency's minor unit. No arithmetic is performed on parsed floats.
 */

/** Display grouping follows the user's number-format preference. */
let activeGrouping: 'standard' | 'indian' = 'standard';

export function setNumberFormat(format: 'standard' | 'indian') {
  activeGrouping = format;
}

function groupIndian(whole: number): string {
  const text = String(whole);
  if (text.length <= 3) return text;
  const last3 = text.slice(-3);
  const rest = text.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${grouped},${last3}`;
}

export interface CurrencyInfo {
  code: string;
  symbol: string;
  digits: number;
  locale: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'LKR', symbol: 'Rs', digits: 2, locale: 'en-LK' },
  { code: 'USD', symbol: '$', digits: 2, locale: 'en-US' },
  { code: 'EUR', symbol: '€', digits: 2, locale: 'de-DE' },
  { code: 'GBP', symbol: '£', digits: 2, locale: 'en-GB' },
  { code: 'INR', symbol: '₹', digits: 2, locale: 'en-IN' },
  { code: 'AUD', symbol: 'A$', digits: 2, locale: 'en-AU' },
  { code: 'CAD', symbol: 'C$', digits: 2, locale: 'en-CA' },
  { code: 'AED', symbol: 'AED', digits: 2, locale: 'en-AE' },
  { code: 'SGD', symbol: 'S$', digits: 2, locale: 'en-SG' },
  { code: 'JPY', symbol: '¥', digits: 0, locale: 'ja-JP' },
  { code: 'MYR', symbol: 'RM', digits: 2, locale: 'ms-MY' },
  { code: 'PKR', symbol: '₨', digits: 2, locale: 'en-PK' },
];

export function currencyInfo(code: string): CurrencyInfo {
  return (
    CURRENCIES.find((c) => c.code === code) ?? { code, symbol: code, digits: 2, locale: 'en-US' }
  );
}

export function isSupportedCurrency(code: string): boolean {
  return CURRENCIES.some((c) => c.code === code);
}

/** Parse a user-entered decimal string into integer minor units. */
export function parseAmount(input: string, currency = 'USD'): number | null {
  const digits = currencyInfo(currency).digits;
  const clean = input.replace(/[,\s]/g, '').replace(/[^\d.-]/g, '');
  if (!clean || clean === '-' || clean === '.' || clean === '-.') return null;
  const sign = clean.startsWith('-') ? -1 : 1;
  const body = clean.replace(/-/g, '');
  const match = /^(\d*)(?:\.(\d*))?$/.exec(body);
  if (!match) return null;
  const whole = match[1] || '0';
  let frac = match[2] ?? '';
  if (digits === 0) {
    const rounded = frac ? Math.round(Number(`0.${frac}`)) : 0;
    return sign * (Number(whole) + rounded);
  }
  if (frac.length > digits) {
    // Round half away from zero on the first dropped digit.
    const keep = frac.slice(0, digits);
    const next = Number(frac[digits]);
    let minor = Number(whole) * 10 ** digits + Number(keep || '0');
    if (next >= 5) minor += 1;
    return sign * minor;
  }
  frac = frac.padEnd(digits, '0');
  return sign * (Number(whole) * 10 ** digits + Number(frac));
}

/** Convert minor units to an editable decimal string ("1,234.50" → "1234.50"). */
export function toDecimalString(minor: number, currency = 'USD'): string {
  const digits = currencyInfo(currency).digits;
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));
  if (digits === 0) return `${negative ? '-' : ''}${abs}`;
  const factor = 10 ** digits;
  const whole = Math.floor(abs / factor);
  const frac = String(abs % factor).padStart(digits, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function formatMoney(
  minor: number,
  currency = 'USD',
  opts: { symbol?: boolean; compact?: boolean; signed?: boolean; hide?: boolean } = {},
): string {
  if (opts.hide) return '••••';
  const info = currencyInfo(currency);
  const { symbol = true, compact = false, signed = false } = opts;
  const negative = minor < 0;
  let abs = Math.abs(minor);
  const digits = info.digits;
  const factor = 10 ** digits;

  if (compact && abs >= factor) {
    const units: [number, string][] = [
      [1_000_000_000, 'B'],
      [1_000_000, 'M'],
      [1_000, 'K'],
    ];
    for (const [value, suffix] of units) {
      if (abs >= value * factor) {
        const scaled = abs / (value * factor);
        const text = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, '');
        return `${negative ? '−' : signed ? '+' : ''}${symbol ? info.symbol + ' ' : ''}${text}${suffix}`;
      }
    }
  }

  const whole = Math.floor(abs / factor);
  const frac = abs % factor;
  const locale = opts.hide ? 'en-US' : info.locale;
  let wholeText: string;
  if (activeGrouping === 'indian') {
    wholeText = groupIndian(whole);
  } else {
    try {
      wholeText = whole.toLocaleString(locale, { useGrouping: true, maximumFractionDigits: 0 });
    } catch {
      wholeText = String(whole);
    }
  }
  const fracText = digits > 0 ? `.${String(frac).padStart(digits, '0')}` : '';
  const sign = negative ? '−' : signed ? '+' : '';
  return `${sign}${symbol ? info.symbol + ' ' : ''}${wholeText}${fracText}`;
}

/** Sum integer amounts safely. */
export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += Math.round(v);
  return total;
}

/** apportion a total into n parts with all rounding remainder allocated. */
export function apportion(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.trunc(total / n);
  const remainder = total - base * n;
  const out = new Array<number>(n).fill(base);
  const step = remainder >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(remainder); i += 1) out[i] += step;
  return out;
}

/** Safe percentage for progress bars. */
export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(999, (part / whole) * 100));
}

export function mulRate(amount: number, ratePercent: number): number {
  return Math.round((amount * ratePercent) / 100);
}

/**
 * Guard against mixing currencies. Returns totals grouped by currency so the
 * UI can show each currency separately rather than adding unlike units.
 */
export function totalsByCurrency(items: { currency: string; amount: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.currency, (map.get(item.currency) ?? 0) + Math.round(item.amount));
  }
  return map;
}
