/**
 * Local SMS/bank-message parser. Finora cannot read device SMS from a web
 * context; users paste or import a message and it is parsed on-device into a
 * draft that must be reviewed before any transaction is written.
 */

export interface ParsedMessage {
  amount: number | null;
  direction: 'in' | 'out';
  merchant: string;
  date: string;
  currency: string;
  confidence: 'high' | 'medium' | 'low';
  isOtp: boolean;
  isFinancial: boolean;
  fingerprint: string;
  reason?: string;
}

const OTP_PATTERNS = [
  /otp/i,
  /one[- ]time (password|code)/i,
  /verification code/i,
  /\bcode\b.{0,20}\b\d{4,8}\b/i,
  /do not share/i,
  /never share/i,
];

const MARKETING_PATTERNS = [
  /unsubscribe/i,
  /promo(tion)?/i,
  /offer/i,
  /discount/i,
  /loan in \d+ minutes/i,
  /apply now/i,
  /click here/i,
];

const IN_PATTERNS = [/\bcredited\b/i, /\breceived\b/i, /\bcredit\b/i, /\bdeposit/i, /\bsalary\b/i, /\brefund/i];
const OUT_PATTERNS = [/\bdebited\b/i, /\bdebit\b/i, /\bwithdrawn\b/i, /\bwithdrawal\b/i, /\bpurchase\b/i, /\bpaid\b/i, /\bpayment\b/i, /\bcharged\b/i, /\bemi\b/i];

const CURRENCY_HINTS: { re: RegExp; code: string }[] = [
  { re: /\b(LKR|Rs\.?|SLR)\b/i, code: 'LKR' },
  { re: /\b(USD|\$)\b/, code: 'USD' },
  { re: /\b(EUR|€)\b/, code: 'EUR' },
  { re: /\b(GBP|£)\b/, code: 'GBP' },
  { re: /\b(INR|₹)\b/, code: 'INR' },
  { re: /\b(AED)\b/i, code: 'AED' },
];

/**
 * Split pasted or imported inbox text into individual messages. Blank lines
 * separate messages; otherwise each line that looks like a bank transaction is
 * treated as its own message so a copied inbox works too.
 */
export function splitMessages(raw: string): string[] {
  const blocks = raw.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks;
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const transactional = lines.filter(
    (line) => /\d/.test(line) && /(?:debited|credited|debit|credit|withdrawn|withdrawal|purchase|paid|payment|received|deposit|salary)/i.test(line),
  );
  if (transactional.length > 1) return transactional;
  const single = raw.trim();
  return single ? [single] : [];
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Stable fingerprint from the message identity, not just the amount. */
export function fingerprintMessage(raw: string, date: string): string {
  const base = `${normalize(raw).toLowerCase()}|${date}`;
  let hash = 2166136261;
  for (let i = 0; i < base.length; i += 1) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

const MERCHANT_NOISE = /(available balance|avl\.? bal|bal(ance)?|a\/c|account|acct|card|ending|xx+|\*{2,}|ref(erence)?|txn|transaction|on|at|from|to)/gi;

export function parseBankMessage(raw: string, fallbackCurrency: string, today: string): ParsedMessage {
  const text = normalize(raw);
  const isOtp = OTP_PATTERNS.some((re) => re.test(text));
  const isMarketing = MARKETING_PATTERNS.some((re) => re.test(text));

  let currency = fallbackCurrency;
  for (const hint of CURRENCY_HINTS) {
    if (hint.re.test(text)) {
      currency = hint.code;
      break;
    }
  }

  // Prefer an amount preceded by a currency marker or a debit/credit keyword.
  const amountMatches = [...text.matchAll(/(?:(?:LKR|Rs\.?|USD|EUR|GBP|INR|AED|\$|€|£|₹)\s*)?([\d,]+(?:\.\d{1,2})?)(?=\s*(?:LKR|Rs\.?|USD|EUR|GBP|INR|AED|$|\.|,|\s))/gi)]
    .map((m) => m[1])
    .filter((v) => /\d/.test(v));
  const candidates = amountMatches
    .map((v) => Number(v.replace(/,/g, '')))
    .filter((v) => Number.isFinite(v) && v > 0 && v < 1e12);
  const amount = candidates.length ? Math.round(candidates[0] * 100) : null;

  const inScore = IN_PATTERNS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
  const outScore = OUT_PATTERNS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
  const direction: 'in' | 'out' = inScore > outScore ? 'in' : 'out';

  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
  let date = today;
  if (dateMatch) {
    const value = dateMatch[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date = value;
    else {
      const [a, b, c] = value.split(/[/-]/).map(Number);
      const year = c < 100 ? 2000 + c : c;
      const day = a > 12 ? a : b > 12 ? b : a;
      const month = a > 12 ? b : b > 12 ? a : b;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  const merchantMatch = text.match(/(?:at|to|from)\s+([A-Za-z0-9&.'\- ]{3,40}?)(?=\s+(?:on|for|ref|with|via|balance|available|a\/c|account|\.|,|$))/i);
  const merchant = merchantMatch
    ? merchantMatch[1].replace(MERCHANT_NOISE, ' ').replace(/\s+/g, ' ').trim()
    : '';

  const isFinancial = !isOtp && !isMarketing && amount !== null && (inScore > 0 || outScore > 0);
  let confidence: ParsedMessage['confidence'] = 'low';
  if (isFinancial && merchant) confidence = 'high';
  else if (isFinancial) confidence = 'medium';

  return {
    amount,
    direction,
    merchant: merchant || (direction === 'in' ? 'Bank credit' : 'Bank payment'),
    date,
    currency,
    confidence,
    isOtp,
    isFinancial,
    fingerprint: fingerprintMessage(raw, date),
    reason: isOtp
      ? 'Looks like a one-time password or security code.'
      : isMarketing
        ? 'Looks like a promotional message.'
        : isFinancial
          ? undefined
          : 'No reliable transaction amount or direction found.',
  };
}
