import type { Account } from './types';
import { formatMoney } from './money';

export interface AccountShareOptions {
  balance: number;
  includeBalance: boolean;
  logo?: string;
}

function gradientColors(account: Account): [string, string] {
  const found = account.color?.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})/gi) ?? [];
  return [found[0] ?? '#0e9f78', found[1] ?? '#0b7d78'];
}

function masked(account: Account): string {
  if (!account.identifier) return '';
  const clean = account.identifier.replace(/\s+/g, '');
  return clean.length <= 4 ? `•••• ${clean}` : `•••• ${clean.slice(-4)}`;
}

export function accountShareText(account: Account, options: AccountShareOptions): string {
  const lines = [account.name];
  if (account.bankName) lines.push(`Bank: ${account.bankName}`);
  if (account.branch) lines.push(`Branch: ${account.branch}`);
  if (account.identifier) lines.push(`Account: ${masked(account)}`);
  lines.push(`Type: ${account.kind} · ${account.currency}`);
  lines.push(
    options.includeBalance
      ? `Balance: ${formatMoney(options.balance, account.currency)}`
      : 'Balance: hidden',
  );
  lines.push('', 'Shared from Finora — Your money, clearly managed.');
  return lines.join('\n');
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
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

  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.arc(width - 90, -40, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(70, height + 40, 190, 0, Math.PI * 2);
  ctx.fill();

  const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const mono = "'SFMono-Regular', Consolas, 'Liberation Mono', monospace";

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `700 24px ${sans}`;
  ctx.fillText('FINORA', 64, 84);

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `600 20px ${sans}`;
  ctx.textAlign = 'right';
  ctx.fillText('ACCOUNT CARD', width - 64, 82);
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

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 54px ${sans}`;
  const displayName = account.name.length > 26 ? `${account.name.slice(0, 25)}…` : account.name;
  ctx.fillText(displayName, 64, 300);

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = `400 28px ${sans}`;
  const bankLine = [account.bankName || 'Account', account.branch].filter(Boolean).join(' · ');
  ctx.fillText(bankLine.length > 54 ? `${bankLine.slice(0, 53)}…` : bankLine, 64, 354);

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = `600 34px ${mono}`;
  ctx.fillText(masked(account) || `${account.kind} account`, 64, 414);

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundedRect(ctx, 64, 462, width - 128, 128, 22);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `600 20px ${sans}`;
  ctx.fillText('CURRENT BALANCE', 96, 506);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 52px ${sans}`;
  ctx.fillText(
    options.includeBalance ? formatMoney(options.balance, account.currency) : '••••••',
    96,
    563,
  );

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `400 20px ${sans}`;
  ctx.textAlign = 'right';
  ctx.fillText(account.currency, width - 96, 563);
  ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(255,255,255,0.66)';
  ctx.font = `400 19px ${sans}`;
  ctx.fillText('Your money, clearly managed.', 64, 626);
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString(), width - 64, 626);
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
