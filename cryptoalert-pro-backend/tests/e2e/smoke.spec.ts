import { expect, test } from '@playwright/test';
import { gotoAndAssertHealthy, MAIN_ROUTES } from './helpers';

test.describe('Frontend smoke e fluxos críticos', () => {
  for (const route of MAIN_ROUTES) {
    test(`deve carregar a rota ${route}`, async ({ page }) => {
      await gotoAndAssertHealthy(page, route);
    });
  }

  test('não deve ter erros críticos de console ao carregar a home', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await gotoAndAssertHealthy(page, '/');

    const filteredErrors = errors.filter((error) => !/favicon|404/.test(error));
    expect(filteredErrors).toEqual([]);
  });
});
