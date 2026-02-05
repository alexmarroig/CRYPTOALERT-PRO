import { test } from '@playwright/test';
import { gotoAndAssertHealthy, MAIN_ROUTES, setLanguage } from './helpers';

const locales: Array<'pt-BR' | 'en-US'> = ['pt-BR', 'en-US'];

test.describe('Regressão visual (baseline screenshots)', () => {
  for (const locale of locales) {
    test.describe(`locale ${locale}`, () => {
      test.use({ locale });

      for (const route of MAIN_ROUTES) {
        test(`baseline visual da rota ${route}`, async ({ page }, testInfo) => {
          await setLanguage(page, locale);
          await gotoAndAssertHealthy(page, route);

          await testInfo.attach(`visual-${locale}-${route.replace('/', 'home')}`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png'
          });

          await test.expect(page).toHaveScreenshot([
            `${locale}-${testInfo.project.name}-${route === '/' ? 'home' : route.slice(1)}.png`
          ], {
            fullPage: true,
            animations: 'disabled'
          });
        });
      }
    });
  }
});
