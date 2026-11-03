import { expect, test } from '@playwright/test';
import {
  correctSlot,
  dragPieceToItsSlot,
  loosePieces,
  resetDatabase,
  signIn,
  uncoveredPieceId,
} from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await resetDatabase(page);
});

test('tick off → new piece → drag to board → reload → still placed', async ({ page }) => {
  await signIn(page);

  await expect(page.getByText('Testläge: kalendern visar 10 december som idag.')).toBeVisible();
  await expect(page.getByText('Tillsammans har vi klarat 59 uppdrag')).toBeVisible();
  await expect(loosePieces(page)).toHaveCount(3);

  // Ticking off today's uppdrag is the 60th completion and unlocks piece number 4.
  await page.getByRole('button', { name: 'Jag har gjort det!' }).click();
  await expect(page.getByText('Tillsammans har vi klarat 60 uppdrag')).toBeVisible();
  await expect(page.getByText('Avklarat – bra jobbat!')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Ditt uppdrag låste upp en ny pusselbit!');
  await expect(loosePieces(page)).toHaveCount(4);

  const id = await uncoveredPieceId(page);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/api/board/pieces/${id}`) && r.request().method() === 'PUT',
  );
  await dragPieceToItsSlot(page, id);
  expect((await saved).status()).toBe(200);
  await expect(page.getByText('1 av 24 bitar på plats')).toBeVisible();
  await expect(page.locator('.piece--placed')).toHaveCount(1);

  await page.reload();
  await expect(page.getByText('1 av 24 bitar på plats')).toBeVisible();
  await expect(page.locator('.piece--placed')).toHaveCount(1);
  await expect(loosePieces(page)).toHaveCount(3);
});

test('keyboard only: pick a piece, choose its slot, tick off a lucka', async ({ page }) => {
  await signIn(page, 'Testanvändare 2');

  const first = loosePieces(page).first();
  const id = Number(await first.getAttribute('data-piece-id'));
  await first.focus();
  await page.keyboard.press('Enter');
  // Focus starts on the first open slot (row 1, column 1).
  await expect(page.getByRole('button', { name: 'Rad 1, kolumn 1' })).toBeFocused();

  const slot = correctSlot(id);
  for (let i = 0; i < slot.row; i++) await page.keyboard.press('ArrowDown');
  for (let i = 0; i < slot.col; i++) await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('button', { name: `Rad ${slot.row + 1}, kolumn ${slot.col + 1}` }),
  ).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByText('1 av 24 bitar på plats')).toBeVisible();
  await expect(page.locator('[aria-live="polite"]').last()).toContainText('Rätt!');
  // Focus moves on to the next loose piece.
  await expect(page.locator('button.piece:focus')).toHaveCount(1);

  const checkbox = page.getByRole('checkbox', { name: /Jag har gjort uppdrag 3:/ });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await expect(page.getByText('Tillsammans har vi klarat 60 uppdrag')).toBeVisible();
});

test('a wrong slot keeps the piece selected and Escape cancels', async ({ page }) => {
  await signIn(page, 'Testanvändare 3');
  const first = loosePieces(page).first();
  const id = Number(await first.getAttribute('data-piece-id'));
  await first.focus();
  await page.keyboard.press('Enter');

  // Focus starts on row 1, column 1; step right only if that happens to be this piece's slot.
  const slot = correctSlot(id);
  if (slot.row === 0 && slot.col === 0) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('[aria-live="polite"]').last()).toContainText('passar inte');
  await expect(page.getByText('0 av 24 bitar på plats')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('[aria-live="polite"]').last()).toContainText('Valet avbröts');
  await expect(page.locator(`button.piece[data-piece-id="${id}"]`)).toBeFocused();
});

test('future luckor are locked and show when they open', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Öppnas 11 december')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Jag har gjort uppdrag 11:/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(10);
});

test('the server rejects a future tick-off even if the UI is bypassed', async ({ page }) => {
  await signIn(page);
  const status = await page.evaluate(async () => {
    const r = await fetch('/api/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: 11 }),
    });
    return r.status;
  });
  expect(status).toBe(409);
});
