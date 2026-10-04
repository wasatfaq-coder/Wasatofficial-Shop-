import { test as base, expect, type Page } from '@playwright/test';

export { expect };

/** A placeholder for photos from the internet: the scenarios do not depend on outside sites */
const PHOTO = '<svg xmlns="http://www.w3.org/2000/svg" width="6" height="8"><rect width="6" height="8" fill="#9FB0C4"/></svg>';

export const test = base.extend<{ phone: boolean; signIn: (user: { sub: string; email: string; name: string }) => Promise<void> }>({
  page: async ({ page }, use) => {
    // Only the local site and emulators: a request to Firebase or elsewhere fails, so a build without
    // VITE_USE_EMULATORS cannot reach the real database
    await page.context().route(
      (url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost',
      (route) =>
        route.request().resourceType() === 'image'
          ? route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PHOTO })
          : route.abort()
    );
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(page);
    expect(errors, 'ошибки JavaScript на странице').toEqual([]);
  },
  phone: async ({ viewport }, use) => use((viewport?.width ?? 0) < 1024),
  signIn: async ({ page }, use) =>
    use(async (user) => {
      await page.waitForFunction(() => 'e2eSignIn' in window);
      await page.evaluate((u) => (window as unknown as { e2eSignIn: (x: typeof u) => Promise<unknown> }).e2eSignIn(u), user);
    }),
});

/**
 * Picks a size on the product page and checks that it is chosen. On a phone the bar «цена · В корзину» at the bottom
 * of the screen can still be sliding away when a click scrolls the size to the screen's edge: the tap then lands on
 * the bar's «Выберите размер» and no size is chosen. So the size is brought to the middle of the screen first
 */
export async function chooseSize(page: Page, name: RegExp): Promise<void> {
  const size = page.getByRole('radio', { name });
  await size.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await size.click();
  await expect(size).toBeChecked();
}

/** A price as the site prints it, «3 340 ₽» (with a no-break space between thousands) */
export function rub(n: number): RegExp {
  return new RegExp(String(n).replace(/\B(?=(\d{3})+$)/g, '\\s?') + '\\s?₽');
}
