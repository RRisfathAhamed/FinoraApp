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
  // First-run onboarding hydrates asynchronously; catch it if it appears after
  // the first check so it cannot swallow the next interaction.
  if (await intro.isVisible().catch(() => false)) {
    await page.locator('.onb__foot .btn--ghost').click();
    await expect(intro).toBeHidden();
  }
}

test('account image upload previews, saves and survives a reload', async ({ page }) => {
  await openApp(page);

  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByRole('dialog', { name: 'New account' })).toBeVisible();

  await page.getByPlaceholder('e.g. Salary account').fill('Test Savings');
  // Bank accounts now require the identity fields shown by the category form.
  await page.getByPlaceholder('Full name').fill('Test Holder');
  await page.getByPlaceholder('e.g. Commercial Bank').fill('Test Bank');
  await page.getByPlaceholder('e.g. Colombo 03').fill('Colombo');
  await page.getByPlaceholder('e.g. 0123456789').fill('1234567890');
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

test('account categories show only relevant fields and sharing omits balances', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Add account' }).click();
  const dialog = page.getByRole('dialog', { name: 'New account' });
  await expect(dialog).toBeVisible();

  const category = dialog.locator('select').first();
  await category.selectOption('credit');
  await expect(dialog.getByText('Credit limit *')).toBeVisible();
  await expect(dialog.getByText('Last four digits *')).toBeVisible();
  await expect(dialog.getByText('Account number *')).toHaveCount(0);
  await expect(dialog.getByText(/Never enter a CVV/)).toBeVisible();

  await category.selectOption('cash');
  await expect(dialog.getByText('Bank name *')).toHaveCount(0);
  await expect(dialog.getByText(/Current calculated balance/)).toBeVisible();

  await category.selectOption('other');
  await expect(dialog.getByText('Reference number (optional)')).toBeVisible();
  await expect(dialog.getByText('Credit limit *')).toHaveCount(0);

  const shared = await page.evaluate(async () => {
    const sharePath = '/src/lib/share.ts';
    const m: any = await import(/* @vite-ignore */ sharePath);
    const account = {
      id: 'acct-private-id',
      name: 'Savings',
      kind: 'bank',
      holderName: 'Test Holder',
      bankName: 'Test Bank',
      branch: 'Colombo',
      identifier: '1234567890',
      currency: 'LKR',
      openingBalance: 99_000_00,
      archived: false,
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    return { text: m.accountShareText(account), fields: m.shareFields(account) };
  });

  expect(shared.fields).toHaveLength(4);
  expect(shared.text).toContain('Test Holder');
  expect(shared.text).toContain('1234567890');
  expect(shared.text).not.toContain('LKR');
  expect(shared.text).not.toMatch(/balance/i);
  expect(shared.text).not.toContain('acct-private-id');
});

test('document upload stores real PDF bytes and opens the vault viewer', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/vault');
  await expect(page.getByText('Your vault is empty')).toBeVisible();

  await page
    .locator('input[type="file"][accept*=".pdf"]')
    .first()
    .setInputFiles({ name: 'bank-statement.pdf', mimeType: 'application/pdf', buffer: PDF });

  await expect(page.getByRole('dialog', { name: 'Save to Vault' })).toBeVisible();
  await page.locator('.sheet select').selectOption('bank-statement');
  await page.getByRole('button', { name: 'Save document' }).click();

  const card = page.locator('.doc-card', { hasText: 'bank-statement.pdf' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Bank statement');

  await card.click();
  // Android WebView has no PDF plugin, so Finora renders pages onto a canvas.
  await expect(page.locator('.pdf-viewer__pages')).toContainText('1 / 1');
  await expect(page.locator('.pdf-viewer__scroll canvas')).toBeVisible({ timeout: 15_000 });

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

test('custom reminders schedule, pause, edit, notify and delete through the UI', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/reminders');
  await expect(page.getByText('No active reminders')).toBeVisible();

  await page.getByRole('button', { name: 'New' }).click();
  const dialog = page.getByRole('dialog', { name: 'New reminder' });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('e.g. Credit card payment').fill('Pay Visa card');
  await dialog.getByPlaceholder('Optional details').fill('Statement balance is due today');
  await dialog.locator('select').first().selectOption('credit-card');
  await dialog.locator('select').nth(1).selectOption('daily');
  await dialog.locator('input.input--money').fill('12500');
  await page.getByRole('button', { name: 'Create reminder' }).click();
  await expect(page.getByText('Reminder created')).toBeVisible();

  const card = page.locator('.reminder-card', { hasText: 'Pay Visa card' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Every day');

  // Pause and filter to paused reminders.
  await card.getByRole('switch', { name: 'Pay Visa card active' }).click();
  await page.getByText('Paused', { exact: true }).click();
  await expect(page.locator('.reminder-card', { hasText: 'Pay Visa card' })).toBeVisible();

  // Edit in place and confirm the new title and value persist in the card.
  await page.locator('.reminder-card', { hasText: 'Pay Visa card' }).getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit reminder' });
  await edit.getByPlaceholder('e.g. Credit card payment').fill('Pay Visa card (updated)');
  await page.getByRole('button', { name: 'Save reminder' }).click();
  await expect(page.getByText('Reminder updated')).toBeVisible();
  await expect(page.locator('.reminder-card', { hasText: 'Pay Visa card (updated)' })).toBeVisible();

  // The reminder is searchable application-wide.
  await page.goto('/#/search');
  await page.getByPlaceholder('e.g. supermarket, car loan, payslip').fill('Visa card');
  await expect(page.getByText('Reminders', { exact: true })).toBeVisible();
  await expect(page.getByText('Pay Visa card (updated)')).toBeVisible();

  // Active-only filter hides the paused reminder until it is enabled again.
  await page.goto('/#/reminders');
  await page.getByText('Active', { exact: true }).click();
  await expect(page.locator('.reminder-card', { hasText: 'Pay Visa card (updated)' })).toHaveCount(0);
  await page.getByText('All', { exact: true }).click();
  await page.locator('.reminder-card', { hasText: 'Pay Visa card (updated)' }).getByRole('switch').click();

  // It appears in the notification centre and supports read/unread + delete.
  await page.goto('/#/notifications');
  const notif = page.locator('.notif-item', { hasText: 'Pay Visa card (updated)' });
  await expect(notif).toBeVisible();
  await notif.getByRole('button', { name: 'Mark Pay Visa card (updated) read' }).click();
  await expect(notif.getByRole('button', { name: 'Mark Pay Visa card (updated) unread' })).toBeVisible();
  await notif.getByRole('button', { name: 'Delete Pay Visa card (updated)' }).click();
  await expect(page.locator('.notif-item', { hasText: 'Pay Visa card (updated)' })).toHaveCount(0);

  // Deleting the record requires confirmation and removes it permanently.
  await page.goto('/#/reminders');
  await page.getByText('All', { exact: true }).click();
  await page.locator('.reminder-card', { hasText: 'Pay Visa card (updated)' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete reminder?' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete reminder' }).click();
  await expect(page.getByText('Reminder deleted')).toBeVisible();
  await expect(page.locator('.reminder-card', { hasText: 'Pay Visa card (updated)' })).toHaveCount(0);

  await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    await m.store.flush();
  });
  await page.reload();
  await expect(page.getByText('No active reminders')).toBeVisible();
});

test('account carousel pages and quick actions preselect the account', async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    m.actions.account.add({ name: 'Everyday Cash', kind: 'cash', currency: 'LKR', openingBalance: 25_000_00, archived: false });
    m.actions.account.add({ name: 'Salary Bank', kind: 'bank', currency: 'LKR', openingBalance: 90_000_00, archived: false });
    await m.store.flush();
    return m.store.state.accounts.map((a: any) => a.id);
  });
  await page.goto('/#/home');
  const cards = page.locator('.account-card:not(.account-card--add)');
  await expect(cards).toHaveCount(2);
  await expect(page.locator('.account-dot')).toHaveCount(2);
  await page.waitForTimeout(500);
  const cardTransforms = await cards.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).transform),
  );
  expect(cardTransforms[0]).not.toBe('none');
  expect(cardTransforms[1]).not.toBe(cardTransforms[0]);

  // The trailing edge of the next account stays visible as a swipe preview.
  const viewport = page.viewportSize();
  const secondCard = await cards.nth(1).boundingBox();
  expect(secondCard).not.toBeNull();
  expect(secondCard!.x).toBeLessThan(viewport!.width);

  // Mouse long-press is an alternative to the menu button for quick actions.
  await cards.nth(0).scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const firstCard = await cards.nth(0).boundingBox();
  expect(firstCard).not.toBeNull();
  await page.mouse.move(firstCard!.x + firstCard!.width / 2, firstCard!.y + firstCard!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(560);
  await page.mouse.up();
  const pressedSheet = page.getByRole('dialog', { name: 'Everyday Cash' });
  await expect(pressedSheet).toBeVisible();
  await pressedSheet.getByRole('button', { name: 'Close' }).click();
  await expect(pressedSheet).toBeHidden();

  // Dragging with a mouse scrolls the rail and settles on the next card.
  const rail = page.locator('.account-scroll');
  const railBox = await rail.boundingBox();
  expect(railBox).not.toBeNull();
  const startScroll = await rail.evaluate((element) => element.scrollLeft);
  await page.mouse.move(railBox!.x + railBox!.width - 28, railBox!.y + 70);
  await page.mouse.down();
  await page.mouse.move(railBox!.x + 34, railBox!.y + 70, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(startScroll + 40);
  await expect(page.locator('.account-dot').nth(1)).toHaveAttribute('aria-current', 'true');

  await page.getByRole('button', { name: 'Quick actions for Everyday Cash' }).click();
  const sheet = page.getByRole('dialog', { name: 'Everyday Cash' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: /Add expense/ }).click();
  await expect(page.getByRole('dialog', { name: 'Add expense' })).toBeVisible();
  await expect(page.locator('select').filter({ hasText: 'Everyday Cash' })).toHaveValue(ids[0]);

  await page.goto('/#/home');
  await page.locator('.account-dot').nth(1).click();
  await expect(page.locator('.account-dot').nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.account-dot').nth(0)).toHaveAttribute('aria-current', 'false');
});

test('long account names and balances stay inside the premium card', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    m.actions.account.add({
      name: 'Sri Lanka Commercial Bank Premier Salary and Savings Account',
      kind: 'bank',
      bankName: 'Commercial Bank of Ceylon',
      branch: 'Colombo Fort',
      identifier: '123456789012',
      currency: 'LKR',
      openingBalance: 123_456_789_012_345_00,
      archived: false,
    });
    await m.store.flush();
  });
  await page.goto('/#/home');
  const card = page.locator('.account-card', { hasText: 'Sri Lanka Commercial Bank Premier' }).first();
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();

  const metrics = await card.evaluate((element) => {
    const name = element.querySelector<HTMLElement>('.account-card__name')!;
    const balance = element.querySelector<HTMLElement>('.account-card__balance')!;
    const cardBox = element.getBoundingClientRect();
    const nameBox = name.getBoundingClientRect();
    const balanceBox = balance.getBoundingClientRect();
    const contentRight = cardBox.right - 17;
    return {
      balanceOverflowX: balance.scrollWidth - balance.clientWidth,
      nameHeight: nameBox.height,
      nameRight: nameBox.right,
      balanceRight: balanceBox.right,
      balanceBottom: balanceBox.bottom,
      contentRight,
      contentBottom: cardBox.bottom - 15,
    };
  });

  expect(metrics.balanceOverflowX).toBeLessThanOrEqual(1);
  expect(metrics.nameHeight).toBeGreaterThan(30);
  expect(metrics.nameRight).toBeLessThanOrEqual(metrics.contentRight + 1);
  expect(metrics.balanceRight).toBeLessThanOrEqual(metrics.contentRight + 1);
  expect(metrics.balanceBottom).toBeLessThanOrEqual(metrics.contentBottom + 1);
});

test('transaction attachments support multiple files, Vault links and safe deletion', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    m.actions.account.add({ name: 'Attachment Account', kind: 'bank', currency: 'LKR', openingBalance: 100_000_00, archived: false });
    await m.store.flush();
  });
  await page.goto('/#/money/new?kind=expense');
  await page.locator('input.input--money').fill('4500');
  await page.getByPlaceholder('e.g. Supermarket').fill('Attachment Cafe');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Transaction recorded')).toBeVisible();

  const txnId = await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    return m.store.state.transactions[0].id;
  });
  await page.goto(`/#/money/txn/${txnId}`);
  await page.locator('.record-attachments input[type="file"]').first().setInputFiles([
    { name: 'receipt.pdf', mimeType: 'application/pdf', buffer: PDF },
    { name: 'receipt.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await expect(page.locator('.attachment-item')).toHaveCount(2, { timeout: 15_000 });

  await page.getByRole('button', { name: 'Preview receipt.png' }).first().click();
  const preview = page.getByRole('dialog', { name: 'receipt.png' });
  await expect(preview).toBeVisible();
  await expect(preview.locator('img')).toBeVisible();
  await preview.getByRole('button', { name: 'Close' }).click();

  await page.goto('/#/vault');
  await page.getByPlaceholder('File name, transaction, category or notes').fill('Attachment Cafe');
  const docs = page.locator('.doc-card');
  await expect(docs).toHaveCount(2);
  await docs.first().click();
  await page.getByRole('button', { name: /Attachment Cafe/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/money/txn/${txnId}`));

  await page.getByRole('button', { name: 'Delete transaction' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Transaction deleted')).toBeVisible();

  await page.goto('/#/vault');
  await expect(page.locator('.doc-card')).toHaveCount(2);
  await expect(page.getByText(/2 documents/)).toBeVisible();
});

test('core screens stay inside the viewport from 320px phones to desktop', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    m.actions.account.add({ name: 'Responsive Bank', kind: 'bank', currency: 'LKR', openingBalance: 120_000_00, archived: false });
    const account = m.store.state.accounts[0];
    m.actions.txn.add({
      kind: 'expense', amount: 2_500_00, currency: 'LKR', date: '2026-11-10',
      accountId: account.id, category: 'Food', merchant: 'Responsive Cafe',
    });
    m.actions.reminder.add({
      title: 'Responsive reminder', category: 'rent', date: '2026-11-20', time: '09:00',
      repeat: 'monthly', notify: 'in-app', active: true,
    });
    await m.store.flush();
  });

  const routes = ['/home', '/money', '/history', '/insights', '/calendar', '/vault', '/reminders', '/notifications', '/settings'];
  for (const width of [320, 360, 390, 414, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`/#${route}`);
      await page.waitForTimeout(120);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} overflows horizontally at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});

test('DOCX files keep their bytes, open the fallback viewer and can be favourited', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/vault');
  await expect(page.getByText('Your vault is empty')).toBeVisible();

  const docx = Buffer.from('PK\u0003\u0004Finora office document fixture', 'utf8');
  await page
    .locator('input[type="file"][accept*=".docx"]')
    .first()
    .setInputFiles({
      name: 'lease-agreement.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docx,
    });

  await expect(page.getByRole('dialog', { name: 'Save to Vault' })).toBeVisible();
  await page.getByRole('button', { name: 'Save document' }).click();
  const card = page.locator('.doc-card', { hasText: 'lease-agreement.docx' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Document');

  await card.click();
  await expect(page.locator('.viewer__fallback')).toContainText('document viewer');
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await page.getByRole('button', { name: /Back|Done/ }).first().click();
  await page.getByText('★ Favourites').click();
  await expect(page.locator('.doc-card', { hasText: 'lease-agreement.docx' })).toBeVisible();

  await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    await m.store.flush();
  });
  await page.reload();
  await page.goto('/#/vault');
  await page.getByText('★ Favourites').click();
  await expect(page.locator('.doc-card', { hasText: 'lease-agreement.docx' })).toBeVisible();
});

test('saving a salary record opens payment and closing overlays restores page scrolling', async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    m.actions.account.add({ name: 'Salary Account', kind: 'bank', currency: 'LKR', openingBalance: 0, archived: false });
    const account = m.store.state.accounts[0];
    m.actions.job.add({
      company: 'Acme Ltd', title: 'Designer', salaryType: 'monthly', currency: 'LKR',
      baseSalary: 300_000_00, paymentWeekday: 5, paymentDay: 16, accountId: account.id,
      startDate: '2026-01-01', status: 'active', endDate: undefined,
    });
    await m.store.flush();
    return { jobId: m.store.state.jobs[0].id, accountId: account.id };
  });

  await page.goto(`/#/salary/record/${ids.jobId}/2026-11`);
  await page.locator('.record-attachments input[type="file"]').first().setInputFiles({
    name: 'november-payslip.pdf', mimeType: 'application/pdf', buffer: PDF,
  });
  await expect(page.locator('.attachment-item')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Save record' })).toBeVisible();
  await page.getByRole('button', { name: 'Save record' }).click();

  const payment = page.getByRole('dialog', { name: 'Record salary payment' });
  await expect(payment).toBeVisible();
  await expect(payment.locator('input.input--money')).toHaveValue('300000.00');
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  // A nested sheet must not unlock the full-screen form underneath.
  await payment.getByRole('button', { name: 'Cancel' }).click();
  await expect(payment).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.locator('.fullform__foot').getByRole('button', { name: 'Close' }).click();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

  // Saving again re-opens payment, records exactly one income transaction and
  // returns to the salary page once the period is fully paid.
  await page.goto(`/#/salary/record/${ids.jobId}/2026-11`);
  await page.getByRole('button', { name: 'Save record' }).click();
  const secondPayment = page.getByRole('dialog', { name: 'Record salary payment' });
  await expect(secondPayment).toBeVisible();
  await secondPayment.locator('input[type="file"]').first().setInputFiles({
    name: 'bank-credit-slip.png', mimeType: 'image/png', buffer: PNG,
  });
  await expect(secondPayment.locator('.attachment-item')).toHaveCount(1, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText('Salary payment recorded as income')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Salary', exact: true })).toBeVisible();

  const result = await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    await m.store.flush();
    const record = m.store.state.salaryRecords[0];
    const duplicate = (() => {
      try {
        m.actions.salary.addPayment(record.id, { date: '2026-11-16', amount: 1, accountId: m.store.state.accounts[0].id });
        return 'ALLOWED';
      } catch (error) {
        return (error as Error).message;
      }
    })();
    return {
      payments: record.payments.length,
      salaryIncome: m.store.state.transactions.filter((t: any) => t.source?.startsWith(`salary:${record.id}:`)).length,
      amount: record.payments[0]?.amount,
      duplicate,
      attached: m.store.state.documents.length,
      paymentSlip: m.store.state.documents.some((d: any) => d.links.some((l: any) => l.type === 'salary-payment')),
    };
  });
  expect(result.payments).toBe(1);
  expect(result.salaryIncome).toBe(1);
  expect(result.amount).toBe(300_000_00);
  expect(result.attached).toBe(2);
  expect(result.paymentSlip).toBe(true);
  expect(result.duplicate).toMatch(/already fully paid/i);

  await page.goto(`/#/salary/record/${ids.jobId}/2026-11`);
  await page.getByRole('button', { name: /Edit payment/ }).click();
  const editPayment = page.getByRole('dialog', { name: 'Edit salary payment' });
  await editPayment.locator('input.input--money').first().fill('250000');
  await editPayment.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByText('Payment updated')).toBeVisible();
  const edited = await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    await m.store.flush();
    const record = m.store.state.salaryRecords[0];
    return {
      payment: record.payments[0]?.amount,
      income: m.store.state.transactions.find((t: any) => t.source?.startsWith(`salary:${record.id}:`))?.amount,
    };
  });
  expect(edited.payment).toBe(250_000_00);
  expect(edited.income).toBe(250_000_00);
  await page.locator('.fullform__foot').getByRole('button', { name: 'Close' }).click();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('recent activity keeps long names, dates and accounts clear of the amount', async ({ page }) => {
  await openApp(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    m.actions.account.add({ name: 'Everyday Account With A Long Name', kind: 'bank', currency: 'LKR', openingBalance: 100_000_00, archived: false });
    const account = m.store.state.accounts[0];
    m.actions.txn.add({
      kind: 'expense', amount: 123_456_00, currency: 'LKR', date: '2026-11-16',
      accountId: account.id, category: 'Household',
      merchant: 'A very long supermarket merchant name that must never overlap the amount',
    });
    await m.store.flush();
  });
  await page.goto('/#/home');
  const row = page.locator('.txn').first();
  await expect(row.locator('.txn__title')).toContainText('very long supermarket');
  await expect(row.locator('.txn__sub')).toHaveText('2026-11-16');
  await expect(row.locator('.txn__meta')).toContainText('Everyday Account');
  const title = await row.locator('.txn__title').boundingBox();
  const amount = await row.locator('.txn__amount').boundingBox();
  expect(title).not.toBeNull();
  expect(amount).not.toBeNull();
  expect(title!.x + title!.width).toBeLessThanOrEqual(amount!.x + 1);
  await row.click();
  await expect(page.getByText('A very long supermarket merchant name that must never overlap the amount').first()).toBeVisible();
});

test('gold maturity is surfaced in notifications and the calendar, and loan categories expose flexible schedules', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    m.actions.loan.add({
      name: 'Gold Necklace Pledge',
      lender: 'City Pawn Brokers',
      currency: 'LKR',
      principal: 15_000_000,
      amountReceived: 15_000_000,
      annualRate: 24,
      method: 'flat',
      termMonths: 6,
      startDate: '2026-06-20',
      promisedDate: '2026-11-20',
      category: 'gold',
      interestMode: 'interest-only',
      goldItem: 'Necklace',
      goldWeight: 12.5,
      goldPurity: 22,
      monthlyRate: 2,
      status: 'active',
    });
    await m.store.flush();
  });

  await page.goto('/#/notifications');
  const notification = page.locator('.notif-item', { hasText: 'Gold pawn matures' });
  await expect(notification).toBeVisible();
  await expect(notification).toContainText(/Gold pawn matures in \d+ days?/);
  await expect(notification).toContainText('Gold Necklace Pledge');
  await expect(notification).toContainText('redeem by 2026-11-20');

  await page.goto('/#/calendar');
  await page.getByRole('tab', { name: 'Agenda' }).click();
  await expect(page.getByText('Gold Necklace Pledge gold redemption')).toBeVisible();

  await page.goto('/#/loans/new');
  const form = page.getByRole('dialog', { name: 'Add loan' });
  await expect(form).toBeVisible();
  await expect(form.getByRole('button', { name: 'Home' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Business' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Education' })).toBeVisible();
  await form.getByRole('button', { name: 'Home' }).click();
  await expect(form.getByText('Property details')).toBeVisible();
  const frequency = form.locator('select').filter({ has: page.locator('option[value="end-of-term"]') });
  await frequency.selectOption('end-of-term');
  await expect(frequency).toHaveValue('end-of-term');
  await expect(form.getByText('1 · End of term')).toBeVisible();
});

test('a recorded EMI payment can be edited and keeps its receipt', async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    m.actions.account.add({ name: 'Editable Loan Account', kind: 'bank', currency: 'LKR', openingBalance: 10_000_000_00, archived: false });
    m.actions.loan.add({
      name: 'Editable Loan', lender: 'Bank', currency: 'LKR',
      principal: 1_200_000_00, amountReceived: 1_200_000_00, annualRate: 0,
      method: 'flat', termMonths: 12, startDate: '2026-01-15', category: 'bank',
      status: 'active',
    });
    await m.store.flush();
    return { loanId: m.store.state.loans[0].id };
  });

  await page.goto(`/#/loans/${ids.loanId}`);
  await page.getByRole('button', { name: 'Pay', exact: true }).first().click();
  const paySheet = page.getByRole('dialog', { name: /Pay EMI 1/ });
  await expect(paySheet).toBeVisible();
  await paySheet.locator('input.input--money').first().fill('50000');
  await paySheet.locator('.record-attachments input[type="file"]').first().setInputFiles({
    name: 'emi-receipt.pdf', mimeType: 'application/pdf', buffer: PDF,
  });
  await expect(paySheet.locator('.attachment-item')).toHaveCount(1, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(page.getByText('EMI payment recorded')).toBeVisible();

  await page.getByRole('button', { name: 'Edit this payment' }).click();
  const editSheet = page.getByRole('dialog', { name: 'Edit recorded payment' });
  await expect(editSheet).toBeVisible();
  await expect(editSheet.locator('.attachment-item')).toHaveCount(1);
  await editSheet.locator('input.input--money').first().fill('60000');
  await editSheet.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByText('Payment updated')).toBeVisible();

  const result = await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    await m.store.flush();
    return {
      amount: m.store.state.emiPayments[0]?.amount,
      receipts: m.store.state.documents.filter((d: any) => d.links.some((l: any) => l.type === 'emi')).length,
    };
  });
  expect(result.amount).toBe(60_000_00);
  expect(result.receipts).toBe(1);
});

test('full settlement records every outstanding instalment once and closes the loan', async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    m.actions.account.add({ name: 'Settlement Account', kind: 'bank', currency: 'LKR', openingBalance: 10_000_000_00, archived: false });
    const account = m.store.state.accounts[0];
    m.actions.loan.add({
      name: 'No-interest Loan', lender: 'Family', currency: 'LKR',
      principal: 1_200_000_00, amountReceived: 1_200_000_00, annualRate: 0,
      method: 'flat', termMonths: 12, startDate: '2026-01-15', category: 'bank',
      status: 'active',
    });
    await m.store.flush();
    return { loanId: m.store.state.loans[0].id, accountId: account.id };
  });

  await page.goto(`/#/loans/${ids.loanId}`);
  await page.getByRole('button', { name: 'Settle loan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Settle this loan?' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Rs 1,200,000.00').first()).toBeVisible();
  await sheet.locator('.record-attachments input[type="file"]').first().setInputFiles({
    name: 'settlement-receipt.pdf', mimeType: 'application/pdf', buffer: PDF,
  });
  await expect(sheet.locator('.attachment-item')).toHaveCount(1, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Confirm settlement' }).click();
  await expect(page.getByText('Loan settled and closed')).toBeVisible();
  await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible();

  const result = await page.evaluate(async () => {
    const storePath = '/src/lib/store.ts';
    const calcPath = '/src/lib/calc.ts';
    const m: any = await import(/* @vite-ignore */ storePath);
    const calc: any = await import(/* @vite-ignore */ calcPath);
    await m.store.flush();
    const loan = m.store.state.loans[0];
    return {
      status: loan.status,
      outstanding: calc.loanOutstanding(loan, m.store.state.emiPayments),
      payments: m.store.state.emiPayments.length,
      balance: calc.accountBalances(m.store.state).get(m.store.state.accounts[0].id),
      duplicates: m.store.state.emiPayments.length - new Set(m.store.state.emiPayments.map((p: any) => p.emiId)).size,
      settledReceipts: m.store.state.documents.filter((d: any) => d.links.some((l: any) => l.type === 'emi' || l.type === 'loan')).length,
    };
  });
  expect(result.status).toBe('closed');
  expect(result.settledReceipts).toBe(1);
  expect(result.outstanding).toBe(0);
  expect(result.payments).toBe(12);
  expect(result.duplicates).toBe(0);
  expect(result.balance).toBe(8_800_000_00);
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
  const accountSelect = sheet.locator('select').filter({ has: page.locator(`option[value="${ids.accountId}"]`) });
  await expect(accountSelect).toHaveValue(ids.accountId);
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
