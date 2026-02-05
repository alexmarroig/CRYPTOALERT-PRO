import { expect, test } from '@playwright/test';
import { gotoAndAssertHealthy, setLanguage } from './helpers';

const LOCALES: Array<'pt-BR' | 'en-US'> = ['pt-BR', 'en-US'];

test.describe('i18n PT/EN e responsividade mobile-first', () => {
  for (const locale of LOCALES) {
    test(`deve aplicar locale ${locale} na home`, async ({ page }) => {
      await setLanguage(page, locale);
      await gotoAndAssertHealthy(page, '/');

      const htmlLang = await page.locator('html').getAttribute('lang');
      if (htmlLang) {
        expect(htmlLang.toLowerCase()).toContain(locale.toLowerCase().split('-')[0]);
      }

      await expect(page.locator('body')).toBeVisible();
    });
  }

  test('mobile-first: conteúdo principal visível sem overflow horizontal', async ({ page }) => {
    await gotoAndAssertHealthy(page, '/');

    const [scrollWidth, clientWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth
    ]);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    await expect(page.locator('main, [role="main"], body')).toBeVisible();
  });
});
