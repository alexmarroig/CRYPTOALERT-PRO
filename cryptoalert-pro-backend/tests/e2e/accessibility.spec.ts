import { expect, test } from '@playwright/test';
import { gotoAndAssertHealthy, MAIN_ROUTES } from './helpers';

test.describe('Acessibilidade de componentes críticos (axe)', () => {
  for (const route of MAIN_ROUTES) {
    test(`sem violações críticas em ${route}`, async ({ page }) => {
      await gotoAndAssertHealthy(page, route);

      await page.addScriptTag({
        url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js'
      });

      const axeResults = await page.evaluate(async () => {
        // @ts-expect-error axe is injected at runtime
        return window.axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa']
          }
        });
      });

      const criticalViolations = axeResults.violations.filter(
        (violation: { impact: string | null }) =>
          violation.impact === 'critical' || violation.impact === 'serious'
      );

      expect(criticalViolations, JSON.stringify(criticalViolations, null, 2)).toEqual([]);
    });
  }
});
