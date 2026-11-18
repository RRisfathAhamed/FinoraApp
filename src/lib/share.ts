import type { Account } from './types';

export interface AccountShareOptions {
  logo?: string;
}

function gradientColors(account: Account): [string, string] {
  const found = account.color?.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})/gi) ?? [];
  return [found[0] ?? '#0e9f78', found[1] ?? '#0b7d78'];
}

/** The only fields Finora may expose when sharing account identity. */
export function shareFields(account: Account): { label: string; value: string }[] {
  const four = account.lastFour || (account.identifier ?? '').replace(/\D/g, '').slice(-4);
  switch (account.kind) {
    case 'bank':
      return [
        { label: 'Account holder', value: account.holderName || account.name },
        { label: 'Bank', value: account.bankName ?? '' },
        { label: 'Branch', value: account.branch ?? '' },
        { label: 'Account number', value: account.identifier ?? '' },
      ].filter((field) => field.value.trim());
    case 'wallet':
      return [
        { label: 'Wallet holder', value: account.holderName || account.name },
        { label: 'Wallet provider', value: account.provider || account.bankName || '' },
        { label: 'Wallet ID', value: account.walletId || account.identifier || '' },
      ].filter((field) => field.value.trim());
    case 'credit':
      return [
        { label: 'Cardholder', value: account.holderName || account.name },
        { label: 'Card provider', value: account.provider || account.bankName || '' },
        { label: 'Card type', value: account.cardType ?? '' },
        { label: 'Last four digits', value: four },
      ].filter((field) => field.value.trim());
    case 'cash':
      return [{ label: 'Cash account', value: account.name }];
    default:
      return [
        { label: 'Account', value: account.name },
        { label: 'Type', value: account.accountType ?? '' },
        { label: 'Provider', value: account.provider ?? '' },
        { label: 'Reference', value: account.referenceNumber ?? '' },
      ].filter((field) => field.value.trim());
  }
}

export function accountShareText(account: Account): string {
  return shareFields(account).map((field) => `${field.label}: ${field.value}`).join('\n');
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** Render the account card as a real PNG. Nothing leaves the device. */
export async function accountCardBlob(account: Account, options: AccountShareOptions): Promise<Blob> {
  const width = 1080;
  const height = 660;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device could not render the account card.');

  const [from, to] = gradientColors(account);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const fields = shareFields(account);

  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.arc(width - 90, -40, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(70, height + 40, 190, 0, Math.PI * 2);
  ctx.fill();

  const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `700 24px ${sans}`;
  ctx.fillText('FINORA', 64, 84);

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `600 20px ${sans}`;
  ctx.textAlign = 'right';
  ctx.fillText('ACCOUNT DETAILS', width - 64, 82);
  ctx.textAlign = 'left';

  const logo = options.logo ? await loadImage(options.logo) : null;
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(width - 104, 168, 40, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(width - 144, 128, 80, 80);
    ctx.drawImage(logo, width - 144, 128, 80, 80);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(width - 104, 168, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 30px ${sans}`;
    ctx.textAlign = 'center';
    ctx.fillText((account.bankName || account.name || 'F').trim().charAt(0).toUpperCase(), width - 104, 179);
    ctx.textAlign = 'left';
  }

  // Share only identity fields. No balances, limits, dates or currency totals.
  fields.slice(0, 4).forEach((field, index) => {
    const top = 205 + index * 92;
    ctx.fillStyle = 'rgba(255,255,255,0.64)';
    ctx.font = `600 17px ${sans}`;
    ctx.fillText(field.label.toUpperCase(), 64, top);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${index === 0 ? 34 : 27}px ${sans}`;
    const maxWidth = width - 128;
    let value = field.value;
    while (value.length > 3 && ctx.measureText(value).width > maxWidth) value = `${value.slice(0, -2)}…`;
    ctx.fillText(value, 64, top + 35);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.66)';
  ctx.font = `400 19px ${sans}`;
  ctx.fillText('Your money, clearly managed.', 64, 626);
  ctx.textAlign = 'right';
  ctx.fillText('Shared from Finora', width - 64, 626);
  ctx.textAlign = 'left';

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('This device could not render the account card.');
  return blob;
}

export function accountCardFilename(account: Account): string {
  const slug = account.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'account';
  return `finora-${slug}-card.png`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
