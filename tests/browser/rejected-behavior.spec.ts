import { expect, test, type Page } from '@playwright/test';

type CanvasOperation = {
  method: string;
  args: number[];
  fillStyle: string;
  bounds?: [number, number, number, number];
};

async function recordCanvas(page: Page) {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, attributes?: any) {
      const context = originalGetContext.call(this, type as any, attributes) as any;
      if (type !== '2d' || !context || context.__lastLightRecorder) return context;
      const frames: CanvasOperation[][] = [[]];
      Object.defineProperty(window, '__lastLightCanvasFrames', {
        configurable: true,
        value: frames,
      });
      context.__lastLightRecorder = true;
      let pathBounds: [number, number, number, number] | undefined;
      const includePoint = (x: number, y: number) => {
        if (!pathBounds) pathBounds = [x, y, x, y];
        else {
          pathBounds[0] = Math.min(pathBounds[0], x);
          pathBounds[1] = Math.min(pathBounds[1], y);
          pathBounds[2] = Math.max(pathBounds[2], x);
          pathBounds[3] = Math.max(pathBounds[3], y);
        }
      };
      const record = (method: string, args: unknown[]) => {
        if (method === 'clearRect') {
          frames.push([]);
          if (frames.length > 30) frames.shift();
        }
        frames[frames.length - 1]?.push({
          method,
          args: args.map((value) => Number(value)),
          fillStyle: typeof context.fillStyle === 'string' ? context.fillStyle : 'gradient',
          bounds: method === 'fill' && pathBounds ? [...pathBounds] : undefined,
        });
      };
      const methods = [
        'clearRect',
        'fillRect',
        'beginPath',
        'moveTo',
        'lineTo',
        'rect',
        'arc',
        'fill',
      ];
      for (const method of methods) {
        const original = context[method].bind(context);
        context[method] = (...args: unknown[]) => {
          if (method === 'beginPath') pathBounds = undefined;
          if (method === 'moveTo' || method === 'lineTo')
            includePoint(Number(args[0]), Number(args[1]));
          if (method === 'rect') {
            const values = args.map(Number);
            const x = values[0] ?? 0;
            const y = values[1] ?? 0;
            const width = values[2] ?? 0;
            const height = values[3] ?? 0;
            includePoint(x, y);
            includePoint(x + width, y + height);
          }
          if (method === 'arc') {
            const values = args.map(Number);
            const x = values[0] ?? 0;
            const y = values[1] ?? 0;
            const radius = values[2] ?? 0;
            includePoint(x - radius, y - radius);
            includePoint(x + radius, y + radius);
          }
          if (method === 'clearRect' || method === 'fillRect' || method === 'fill')
            record(method, args);
          return original(...args);
        };
      }
      return context;
    };
  });
}

async function latestCanvasFrame(page: Page): Promise<CanvasOperation[]> {
  return page.evaluate(() => {
    const frames = (window as any).__lastLightCanvasFrames as CanvasOperation[][] | undefined;
    return frames?.at(-1) ?? [];
  });
}

async function openBuiltGame(page: Page) {
  await page.goto('/');
  await expect(page).toHaveTitle(/Last Light/i);
  await page.getByRole('button', { name: /^Play$/i }).click();
}

test.describe('contracts for rejected browser behavior', () => {
  test('built canvas draws every tree-thicket and remains visibly non-empty on desktop and mobile', async ({
    page,
  }) => {
    await recordCanvas(page);
    await openBuiltGame(page);

    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('width', '960');
    await expect(canvas).toHaveAttribute('height', '640');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(100);

    const frame = await latestCanvasFrame(page);
    const largeForestShapes = frame.filter((operation) => {
      const width =
        operation.method === 'fillRect'
          ? (operation.args[2] ?? 0)
          : (operation.bounds?.[2] ?? 0) - (operation.bounds?.[0] ?? 0);
      const height =
        operation.method === 'fillRect'
          ? (operation.args[3] ?? 0)
          : (operation.bounds?.[3] ?? 0) - (operation.bounds?.[1] ?? 0);
      return width >= 40 && width <= 500 && height >= 40 && height <= 500;
    });
    expect(largeForestShapes.length).toBeGreaterThanOrEqual(24);
  });

  test('moves the clamped camera instead of keeping the lighthouse fixed in a full-world view', async ({
    page,
  }) => {
    await recordCanvas(page);
    await openBuiltGame(page);
    await page.waitForTimeout(100);

    const initial = (await latestCanvasFrame(page)).find(
      (operation) =>
        operation.method === 'fillRect' &&
        operation.fillStyle === '#e6d3a0' &&
        operation.args[2] === 30 &&
        operation.args[3] === 62,
    );
    expect(initial).toBeDefined();

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!;
      canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'ArrowRight' }));
    });
    await page.waitForTimeout(5_500);
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!;
      canvas.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'ArrowRight' }));
    });

    const moved = (await latestCanvasFrame(page)).find(
      (operation) =>
        operation.method === 'fillRect' &&
        operation.fillStyle === '#e6d3a0' &&
        operation.args[2] === 30 &&
        operation.args[3] === 62,
    );
    expect(moved?.args[0] ?? -999).not.toBe(initial!.args[0]);
  });

  test('activates Web Audio on Play, maps M to mute, and suspends/resumes the context', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const events: string[] = [];
      class FakeAudioContext {
        state = 'suspended';
        constructor() {
          events.push('construct');
        }
        resume() {
          events.push('resume');
          this.state = 'running';
          return Promise.resolve();
        }
        suspend() {
          events.push('suspend');
          this.state = 'suspended';
          return Promise.resolve();
        }
        close() {
          events.push('close');
          return Promise.resolve();
        }
      }
      Object.defineProperty(window, '__lastLightAudioEvents', {
        configurable: true,
        value: events,
      });
      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        value: FakeAudioContext,
      });
      Object.defineProperty(window, 'webkitAudioContext', {
        configurable: true,
        value: FakeAudioContext,
      });
    });
    await openBuiltGame(page);

    await expect
      .poll(() => page.evaluate(() => (window as any).__lastLightAudioEvents))
      .toContain('construct');
    await page.keyboard.press('m');
    await expect
      .poll(() => page.evaluate(() => (window as any).__lastLightAudioEvents))
      .toContain('suspend');
    await page.keyboard.press('m');
    await expect
      .poll(() => page.evaluate(() => (window as any).__lastLightAudioEvents))
      .toContain('resume');
  });

  test('keeps play available and announces one plain-language notice when AudioContext fails', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      class ThrowingAudioContext {
        constructor() {
          throw new Error('audio blocked by browser policy');
        }
      }
      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        value: ThrowingAudioContext,
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /^Play$/i }).click();

    await expect(page.getByRole('alert')).toContainText(
      /Sound is unavailable\. The game is still playable\./i,
    );
    await expect(page.getByRole('button', { name: /Pause/i })).toBeVisible();
  });

  test('rejects Resume while the document is hidden', async ({ page }) => {
    await openBuiltGame(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByRole('button', { name: /Resume/i })).toBeVisible();
    await page.getByRole('button', { name: /Resume/i }).click();
    await expect(page.getByRole('button', { name: /Resume/i })).toBeVisible();

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
    });
    await page.getByRole('button', { name: /Resume/i }).click();
    await expect(page.getByRole('button', { name: /Pause/i })).toBeVisible();
  });

  test('pauses settings and returns to the same paused round', async ({ page }) => {
    await openBuiltGame(page);
    await page.getByRole('button', { name: /Settings/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: /Resume/i })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: /Close/i }).click();
    await expect(page.getByRole('button', { name: /Resume/i })).toBeVisible();
  });
});
