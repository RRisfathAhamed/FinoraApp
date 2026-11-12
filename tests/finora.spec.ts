import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

/* Real bytes: a 1×1 PNG for image uploads and a minimal one-page PDF. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const PNG = Buffer.from(PNG_BASE64, 'base64');
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
  'utf8',
);
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

async function openApp(page: Page) {
  // The branded splash is intentionally 2.6s on a real cold start; tests skip it
  // so they exercise the app rather than the launch animation.
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('finora-splash', '1');
    } catch {
      /* storage unavailable */
    }
  });
  await page.goto('/');
  // A fresh install shows the first-run introduction; dismiss it so the rest of
  // the suite exercises the app itself.
  const intro = page.locator('.onb');
  if (await intro.isVisible().catch(() => false)) {
    await page.locator('.onb__foot .btn--ghost').click();
    await expect(intro).toBeHidden();
  }
  await expect(page.locator('.summary__label').first()).toHaveText(/net worth/i);
  await expect(page.locator('.summary__net').first()).toBeVisible();
  // Let the branded launch overlay finish so it cannot intercept taps.
  await page.waitForTimeout(350);
}

test('account image upload previews, saves and survives a reload', async ({ page }) => {
  await openApp(page);

  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByRole('dialog', { name: 'New account' })).toBeVisible();

  await page.getByPlaceholder('e.g. Salary account').fill('Test Savings');
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG,
  });

  // Uploads open the local cropper; accept the crop, then wait for the preview.
  await expect(page.locator('.cropper')).toBeVisible();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.locator('.upload-box__preview img')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Image saved with account')).toBeVisible();

  await page.locator('input.input--money').fill('150000');
  await page.getByRole('button', { name: 'Save account' }).click();

  const tileImage = page.locator('.account-card__logo img');
  await expect(tileImage).toBeVisible();
  const src = await tileImage.getAttribute('src');
  expect(src).toMatch(/^data:image\//);
  expect(src).not.toMatch(/^blob:/);

  // Persistence is debounced in the app; flush explicitly before reloading so
  // the assertion tests storage rather than write timing.
  await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    await m.store.flush();
  });

  // Reload with the same browser context: state must come back from IndexedDB.
  await page.reload();
  await expect(page.locator('.account-card', { hasText: 'Test Savings' })).toBeVisible();
  await expect(page.locator('.account-card__logo img')).toBeVisible();

  // The image reference also resolves in the account detail view.
  await page.locator('.account-card', { hasText: 'Test Savings' }).click();
  await expect(page.getByText('Current balance')).toBeVisible();
  await expect(page.locator('.account-card__logo img')).toBeVisible();
});

test('document upload stores real PDF bytes and opens the vault viewer', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/vault');
  await expect(page.getByText('Your vault is empty')).toBeVisible();

  await page
    .locator('input[type="file"][accept="application/pdf,image/*"]')
    .first()
    .setInputFiles({ name: 'bank-statement.pdf', mimeType: 'application/pdf', buffer: PDF });

  await expect(page.getByRole('dialog', { name: 'Save to Vault' })).toBeVisible();
  await page.locator('.sheet select').selectOption('bank-statement');
  await page.getByRole('button', { name: 'Save document' }).click();

  const card = page.locator('.doc-card', { hasText: 'bank-statement.pdf' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Bank statement');

  await card.click();
  const frame = page.locator('.viewer iframe');
  await expect(frame).toBeVisible();
  // PDFs are served to the in-app viewer through a same-origin blob URL:
  // Chrome will not run its PDF viewer for a data: URL inside an iframe.
  await expect(frame).toHaveAttribute('src', /^blob:/);

  // File information sheet proves metadata was persisted, not just a filename.
  await page.getByRole('button', { name: 'Document details' }).click();
  await expect(page.getByText('application/pdf')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.reload();
  await page.evaluate(() => {
    window.location.hash = '/vault';
  });
  await expect(page.locator('.doc-card', { hasText: 'bank-statement.pdf' })).toBeVisible();
  await expect(page.locator('.screen-sub')).toContainText('1 document');
});

test('ZIP backup restores records and document bytes after clearing data', async ({ page }) => {
  await openApp(page);

  await page.evaluate(async (pngDataUrl) => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    m.actions.account.add({
      name: 'Backup Account',
      kind: 'bank',
      currency: 'LKR',
      openingBalance: 5_000_000,
      notes: '',
      archived: false,
    });
    const account = m.store.state.accounts[0];
    m.actions.txn.add({
      kind: 'income',
      amount: 250_000,
      currency: 'LKR',
      date: '2026-11-02',
      accountId: account.id,
      category: 'Salary',
      merchant: 'Employer',
    });
    m.actions.document.add({
      name: 'receipt.png',
      mime: 'image/png',
      size: 68,
      dataUrl: pngDataUrl,
      category: 'receipt',
      links: [{ type: 'account', id: account.id }],
      notes: 'Backup round-trip fixture',
    });
    await m.store.flush();
  }, PNG_DATA_URL);

  await page.goto('/#/backup');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Create and download backup' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const zipBytes = fs.readFileSync(downloadPath!);
  expect(zipBytes.length).toBeGreaterThan(500);
  // ZIP local-file header — proves a genuine archive, not JSON.
  expect(zipBytes.subarray(0, 2).toString('utf8')).toBe('PK');

  // Clear through the real confirmation workflow.
  await page.goto('/#/settings');
  await page.getByText('Clear all financial data', { exact: true }).first().click();
  await page.getByPlaceholder('CLEAR ALL').fill('CLEAR ALL');
  await page.getByRole('button', { name: 'Clear data' }).click();
  await expect(page.getByText(/Cleared successfully/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.goto('/#/home');
  await page.reload();
  await expect(page.getByText('Add your first account')).toBeVisible();

  // Restore from the downloaded archive; checksums are verified before import.
  await page.goto('/#/backup');
  await page.locator('input[type="file"][accept=".zip,application/zip"]').setInputFiles({
    name: 'finora-backup.zip',
    mimeType: 'application/zip',
    buffer: zipBytes,
  });
  await expect(page.getByRole('dialog', { name: 'Restore this backup?' })).toBeVisible();
  await expect(page.getByText(/Archive verified/)).toBeVisible();
  await expect(page.getByText(/1 accounts/)).toBeVisible();
  await page.getByRole('button', { name: 'Replace my data' }).click();
  await expect(page.getByText('Backup restored successfully')).toBeVisible();

  await page.goto('/#/home');
  await expect(page.locator('.account-card', { hasText: 'Backup Account' })).toBeVisible();
  await page.goto('/#/vault');
  await expect(page.locator('.doc-card', { hasText: 'receipt.png' })).toBeVisible();
  await page.locator('.doc-card', { hasText: 'receipt.png' }).click();
  await expect(page.locator('.viewer img')).toHaveAttribute('src', /^data:image\/png;base64/);
});

test('a fully paid EMI cannot be paid again from the UI or the store', async ({ page }) => {
  await openApp(page);

  const ids = await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    m.actions.account.add({
      name: 'Loan Account',
      kind: 'bank',
      currency: 'LKR',
      openingBalance: 10_000_000,
      notes: '',
      archived: false,
    });
    const account = m.store.state.accounts[0];
    m.actions.loan.add({
      name: 'Test Loan',
      lender: 'Test Bank',
      currency: 'LKR',
      principal: 10_000_000,
      amountReceived: 10_000_000,
      annualRate: 12,
      method: 'reducing',
      termMonths: 12,
      startDate: '2026-11-01',
      accountId: account.id,
      status: 'active',
    });
    await m.store.flush();
    return { loanId: m.store.state.loans[0].id, accountId: account.id };
  });

  await page.goto(`/#/loans/${ids.loanId}`);
  await page.getByRole('button', { name: 'Pay this EMI' }).click();
  const sheet = page.getByRole('dialog', { name: /Pay EMI 1/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('select')).toHaveValue(ids.accountId);
  await page.getByRole('button', { name: 'Confirm payment' }).click();

  await expect(page.getByText('EMI payment recorded')).toBeVisible();
  const firstEmiRow = page.locator('.list-row', { hasText: /EMI 1 ·/ });
  await expect(firstEmiRow.getByText('Paid')).toBeVisible();
  await expect(firstEmiRow.getByRole('button', { name: 'Pay' })).toHaveCount(0);

  // Server-equivalent guard: the action layer rejects a second payment even if UI is bypassed.
  const error = await page.evaluate(async ({ loanId }) => {
    const storePath = '/src/lib/store.ts';
    const calcPath = '/src/lib/calc.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    const calc: any = await import(/* @vite-ignore */ calcPath);
    const loan = m.store.state.loans.find((l: any) => l.id === loanId);
    const emi = calc.generateSchedule(loan)[0];
    const account = m.store.state.accounts[0];
    try {
      m.actions.loan.payEmi({
        loanId,
        emiId: emi.id,
        amount: 100,
        date: '2026-11-11',
        accountId: account.id,
      });
      return 'ALLOWED';
    } catch (e) {
      return (e as Error).message;
    }
  }, { loanId: ids.loanId });

  expect(error).toMatch(/already fully paid/i);

  // The paid state persists too.
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('.list-row', { hasText: /EMI 1 ·/ }).getByText('Paid')).toBeVisible();
});
