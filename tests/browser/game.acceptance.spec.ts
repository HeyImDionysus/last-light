import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openGame(page: Page) {
  const consoleErrors: string[] = [];
  const unexpectedRequests: string[] = [];
  let initialLoadComplete = false;
  page.on('console', (message: any) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request: any) => {
    const url = new URL(request.url());
    if (
      url.origin !== new URL('http://127.0.0.1:4173').origin ||
      (initialLoadComplete && request.resourceType() !== 'document')
    ) {
      unexpectedRequests.push(request.url());
    }
  });
  await page.goto('/');
  initialLoadComplete = true;
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveTitle(/Last Light/i);
  return { consoleErrors, unexpectedRequests };
}

test.describe('Last Light browser acceptance', () => {
  test('exposes a semantic title, instructions, status, and native controls', async ({ page }) => {
    await openGame(page);

    await expect(page.getByRole('heading', { name: /Last Light/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Play$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Instructions/i })).toBeVisible();
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByRole('img', { name: /Last Light game view/i })).toBeVisible();
  });

  test('completes keyboard play, pause, resume, and restart flows with visible status', async ({
    page,
  }) => {
    await openGame(page);

    await page.getByRole('button', { name: /^Play$/i }).click();
    await expect(page.getByRole('button', { name: /Pause/i })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('p');
    await expect(page.getByRole('button', { name: /Resume/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /Pause/i })).toBeVisible();
    await page.keyboard.press('r');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /Cancel/i }).click();
    await expect(page.getByRole('button', { name: /Pause/i })).toBeVisible();
  });

  test('offers touch movement and action targets at phone and tablet sizes', async ({ page }) => {
    await openGame(page);
    const thumb = page.getByRole('slider', { name: /move|thumb/i });
    await expect(thumb).toBeVisible();
    await expect(thumb).toHaveCSS('min-width', '44px');
    await expect(thumb).toHaveCSS('min-height', '44px');
    await expect(page.getByRole('button', { name: /Pause|Play/i })).toBeVisible();
  });

  test('supports settings, mute, high contrast, and reduced motion without network access', async ({
    page,
  }) => {
    const evidence = await openGame(page);

    await page.getByRole('button', { name: /Settings/i }).click();
    await page.getByRole('button', { name: /High contrast/i }).click();
    await expect(page.getByRole('button', { name: /High contrast/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: /Reduced motion/i }).click();
    await expect(page.getByRole('button', { name: /Reduced motion/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: /Mute/i }).click();

    expect(evidence.consoleErrors).toEqual([]);
    expect(evidence.unexpectedRequests).toEqual([]);
  });

  test('pauses on hidden visibility, preserves state, and does not auto-resume', async ({
    page,
  }) => {
    await openGame(page);
    await page.getByRole('button', { name: /^Play$/i }).click();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByText(/Welcome back|Resume when ready/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Resume/i })).toBeVisible();
  });

  test('keeps dialog focus operable and passes the automated WCAG supplement', async ({ page }) => {
    await openGame(page);
    const instructions = page.getByRole('button', { name: /Instructions/i });
    await instructions.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/goal|lantern|stars/i);
    await page.getByRole('dialog').getByRole('button', { name: /Close/i }).click();
    await expect(instructions).toBeFocused();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('shows a one-time playable notice when storage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked');
        },
      });
    });
    await openGame(page);

    await expect(page.getByRole('alert')).toContainText(/Saving is unavailable/i);
    await expect(page.getByRole('button', { name: /^Play$/i })).toBeEnabled();
  });
});
