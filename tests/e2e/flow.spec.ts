import { expect, test } from '@playwright/test';
import {
  correctSlot,
  dragPieceToCell,
  piece,
  pieceIdOf,
  pieces,
  resetDatabase,
  signIn,
  uncoveredPieceId,
} from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await resetDatabase(page);
});

test('tick off → new piece → drag to board → reload → still where it was put', async ({ page }) => {
  await signIn(page);

  await expect(page.getByText('Testläge: kalendern visar 10 december som idag.')).toBeVisible();
  await expect(pieces(page)).toHaveCount(3);

  // Today's lucka (10) is a closed door until it is turned over.
  await page.getByRole('button', { name: /^Lucka 10 / }).click();
  const today = page.locator('.lucka--opened').filter({
    has: page.getByRole('heading', { name: /^Lucka 10:/ }),
  });
  await expect(today).toContainText('Gör så här');
  await expect(today).toContainText('Om du vill');

  // Ticking off today's uppdrag is one completion short of the 4th piece in the demo data.
  await today.getByRole('checkbox').check();
  await expect(today).toContainText(/Du och \d+ kollegor har gjort uppdraget/);
  await expect(page.locator('.toast')).toContainText('Ditt uppdrag låste upp en ny pusselbit!');
  await expect(pieces(page)).toHaveCount(4);

  // Lay a piece one cell away from its own slot: it must stay there – nothing snaps.
  const id = await uncoveredPieceId(page);
  const slot = correctSlot(id);
  const cell = { row: slot.row, col: slot.col === 0 ? 1 : slot.col - 1 };
  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/api/board/pieces/${id}`) && r.request().method() === 'PUT',
  );
  await dragPieceToCell(page, id, cell);
  expect((await saved).status()).toBe(200);
  // Compare positions relative to the board (page scroll may differ after a reload).
  const offset = async () => {
    const p = await page.locator(`.piece[data-piece-id="${id}"]`).boundingBox();
    const b = await page.locator('.board').boundingBox();
    return { x: (p?.x ?? 0) - (b?.x ?? 0), y: (p?.y ?? 0) - (b?.y ?? 0) };
  };
  const before = await offset();

  await page.reload();
  await expect(pieces(page)).toHaveCount(4);
  const after = await offset();
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  // No hints: there is no "pieces in place" counter and no "complete" banner.
  await expect(page.getByText(/bitar på plats/)).toHaveCount(0);
  await expect(page.getByText('Pusslet är komplett!', { exact: false })).toHaveCount(0);
});

test('keyboard only: pick a piece, choose a cell, tick off a lucka', async ({ page }) => {
  await signIn(page, 'Testanvändare 2');

  const id = await pieceIdOf(page, 0);
  await piece(page, id).focus();
  await page.keyboard.press('Enter');
  // A piece from a tray starts at row 1, column 1.
  await expect(page.getByRole('button', { name: 'Rad 1, kolumn 1' })).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Rad 2, kolumn 3' })).toBeFocused();
  await page.keyboard.press('Enter');

  // Only where it now lies is announced – never whether it is right.
  const live = page.locator('[aria-live="polite"]').last();
  await expect(live).toContainText('Biten ligger nu på rad 2, kolumn 3.');
  await expect(piece(page, id)).toBeFocused();
  await expect(piece(page, id)).toHaveAccessibleName(/på bordet/);

  // Turn lucka 3 over: focus moves to the uppdrag behind the door.
  await page.getByRole('button', { name: 'Lucka 3 Öppna', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /^Lucka 3:/ })).toBeFocused();
  // (Safari's default Tab skips checkboxes, so focus it directly; Space still toggles it.)
  const checkbox = page.getByRole('checkbox', { name: /Jag har gjort uppdrag 3:/ });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
});

test('Escape cancels choosing a cell', async ({ page }) => {
  await signIn(page, 'Testanvändare 3');
  const id = await pieceIdOf(page, 0);
  await piece(page, id).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Rad 1, kolumn 1' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('[aria-live="polite"]').last()).toContainText('Valet avbröts');
  await expect(piece(page, id)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Rad 1, kolumn 1' })).toHaveCount(0);
});

test('future luckor are locked and show when they open', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Öppnas 11 december')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lucka 11 / })).toHaveCount(0);
  // Luckor 1–10 are closed doors that can be opened; no uppdrag is visible yet.
  await expect(page.getByRole('button', { name: /^Lucka \d+ .*Öppna$/ })).toHaveCount(10);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('an opened lucka stays open and shows how many have done the uppdrag', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Lucka 2 Öppna', exact: true }).click();
  const lucka = page.locator('.lucka--opened').filter({
    has: page.getByRole('heading', { name: /^Lucka 2:/ }),
  });
  // Demo data: a few colleagues have done each of the first luckor.
  await expect(lucka).toContainText(/\d+ kollegor har gjort uppdraget/);

  await lucka.getByRole('checkbox').check();
  await expect(lucka).toContainText(/Du och \d+ kollegor har gjort uppdraget/);

  await page.reload();
  await expect(page.getByRole('heading', { name: /^Lucka 2:/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Lucka 2 Öppna', exact: true })).toHaveCount(0);
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
