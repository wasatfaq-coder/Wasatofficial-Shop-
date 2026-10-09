import { test as base, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

export { expect };

/** A placeholder for photos from the internet: the scenarios do not depend on outside sites */
const PHOTO = '<svg xmlns="http://www.w3.org/2000/svg" width="6" height="8"><rect width="6" height="8" fill="#9FB0C4"/></svg>';

type User = { sub: string; email: string; name: string };

// Only the local site and emulators: a request to Firebase or elsewhere fails, so a build without
// VITE_USE_EMULATORS cannot reach the real database
async function keepLocal(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost',
    (route) =>
      route.request().resourceType() === 'image'
        ? route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PHOTO })
        : route.abort()
  );
}

/** Signs this page in with Google on the auth emulator (`window.e2eSignIn`, only in the emulator build) */
export async function signInOn(page: Page, user: User): Promise<void> {
  await page.waitForFunction(() => 'e2eSignIn' in window);
  await page.evaluate((u) => (window as unknown as { e2eSignIn: (x: typeof u) => Promise<unknown> }).e2eSignIn(u), user);
}

export const test = base.extend<{ phone: boolean; signIn: (user: User) => Promise<void>; secondPage: Page }>({
  page: async ({ page }, use) => {
    await keepLocal(page.context());
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(page);
    expect(errors, 'ошибки JavaScript на странице').toEqual([]);
  },
  // A second person at the same time (the owner answering a buyer): its own browser profile and sign-in, same screen size
  secondPage: async ({ browser, baseURL, viewport, locale, timezoneId, isMobile, hasTouch, userAgent, deviceScaleFactor }, use) => {
    const context = await browser.newContext({ baseURL, viewport, locale, timezoneId, isMobile, hasTouch, userAgent, deviceScaleFactor });
    await keepLocal(context);
    const second = await context.newPage();
    const errors: string[] = [];
    second.on('pageerror', (e) => errors.push(e.message));
    await use(second);
    await context.close();
    expect(errors, 'ошибки JavaScript на второй странице').toEqual([]);
  },
  phone: async ({ viewport }, use) => use((viewport?.width ?? 0) < 1024),
  signIn: async ({ page }, use) => use((user) => signInOn(page, user)),
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

/**
 * Opens a section of the admin panel by its name (menu variant A): a button of «Разделы панели» — the phone's bottom
 * bar or the computer's list — or, on a phone, «Ещё» and the section there
 */
export async function openAdminSection(panel: Locator, name: string | RegExp): Promise<void> {
  const nav = panel.getByRole('navigation', { name: 'Разделы панели' });
  await expect(nav).toBeVisible();
  const exact = typeof name === 'string';
  const direct = nav.getByRole('button', { name, exact });
  if ((await direct.count()) > 0) {
    await direct.click();
    return;
  }
  await nav.getByRole('button', { name: /^Ещё/ }).click();
  await panel.getByRole('navigation', { name: 'Все разделы' }).getByRole('button', { name: exact ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) : name }).click();
}
