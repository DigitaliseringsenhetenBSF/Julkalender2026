import { type Page, expect } from '@playwright/test';

const COLUMNS = 6;

export async function resetDatabase(page: Page) {
  const response = await page.request.post('/api/test/reset');
  expect(response.status()).toBe(204);
}

export async function signIn(page: Page, name = 'Testanvändare 1') {
  await page.goto('/');
  await page.getByRole('button', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Miljöjulkalendern' })).toBeVisible();
}

/** Piece n belongs at row ⌊(n-1)/6⌋, column (n-1) % 6 (SPEC §5.5). */
export function correctSlot(pieceId: number) {
  return { row: Math.floor((pieceId - 1) / COLUMNS), col: (pieceId - 1) % COLUMNS };
}

export function loosePieces(page: Page) {
  return page.locator('button.piece');
}

export async function pieceId(page: Page, index = 0): Promise<number> {
  const value = await loosePieces(page).nth(index).getAttribute('data-piece-id');
  return Number(value);
}

/**
 * A loose piece whose centre is not covered by another piece. Tray positions are random
 * ("huller om buller"), so pieces may overlap and a pointer would grab the top one.
 */
export async function uncoveredPieceId(page: Page): Promise<number> {
  await page.locator('.puzzle-area').scrollIntoViewIfNeeded();
  const id = await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('button.piece')) {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (hit?.closest('button.piece') === el) return Number(el.dataset.pieceId);
    }
    return null;
  });
  if (id === null) throw new Error('every loose piece is covered by another');
  return id;
}

/** Drags a loose piece with the mouse onto its correct slot on the board. */
export async function dragPieceToItsSlot(page: Page, id: number) {
  const piece = page.locator(`button.piece[data-piece-id="${id}"]`);
  await piece.scrollIntoViewIfNeeded();
  const board = page.locator('.board');
  const pieceBox = await piece.boundingBox();
  const boardBox = await board.boundingBox();
  if (!pieceBox || !boardBox) throw new Error('piece or board not visible');

  const slot = correctSlot(id);
  const slotWidth = boardBox.width / COLUMNS;
  const slotHeight = boardBox.height / 4;
  const target = {
    x: boardBox.x + (slot.col + 0.5) * slotWidth + 4,
    y: boardBox.y + (slot.row + 0.5) * slotHeight - 3,
  };
  await page.mouse.move(pieceBox.x + pieceBox.width / 2, pieceBox.y + pieceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
}
