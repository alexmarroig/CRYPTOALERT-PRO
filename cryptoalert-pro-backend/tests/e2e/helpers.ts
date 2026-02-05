import { expect, type Page } from '@playwright/test';

export const MAIN_ROUTES = ['/', '/feed', '/alerts', '/portfolio'];

export async function gotoAndAssertHealthy(page: Page, route: string): Promise<void> {
  const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
  expect(response, `Missing HTTP response for route: ${route}`).not.toBeNull();
  expect(response?.status(), `Unexpected HTTP status on route: ${route}`).toBeLessThan(500);
  await expect(page.locator('body')).toBeVisible();
}

export async function setLanguage(page: Page, locale: 'pt-BR' | 'en-US') {
  await page.addInitScript(([targetLocale]) => {
    localStorage.setItem('locale', targetLocale);
  }, [locale]);
}
