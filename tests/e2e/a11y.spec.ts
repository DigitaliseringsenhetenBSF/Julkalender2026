import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { pieces, resetDatabase, signIn } from './helpers.ts';

/** Fails on serious or critical WCAG 2.1 A/AA violations (SPEC §10). */
async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`),
  ).toEqual([]);
}

// Check the settled UI: with reduced motion the toast fade-in and door flips are instant, so axe
// never measures contrast mid-animation (it once flaked on a half-transparent toast).
test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await resetDatabase(page);
});

test('sign-in page has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Logga in' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('calendar page has no serious accessibility violations', async ({ page }) => {
  await signIn(page);
  await expect(pieces(page)).toHaveCount(3);
  await expectNoSeriousViolations(page);
});

test('opened luckor have no serious accessibility violations', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Lucka 1 Öppna', exact: true }).click();
  await page.getByRole('button', { name: /^Lucka 10 / }).click();
  await expect(page.locator('.lucka--opened')).toHaveCount(2);
  await expectNoSeriousViolations(page);
});

test('puzzle selection mode has no serious accessibility violations', async ({ page }) => {
  await signIn(page);
  await pieces(page).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Rad 1, kolumn 1' })).toBeFocused();
  await expectNoSeriousViolations(page);
});
