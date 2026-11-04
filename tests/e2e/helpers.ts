import { type Page, expect } from '@playwright/test';

const COLUMNS = 9;
const ROWS = 5;

export async function resetDatabase(page: Page) {
  const response = await page.request.post('/api/test/reset');
  expect(response.status()).toBe(204);
}

export async function signIn(page: Page, name = 'Testanvändare 1') {
  await page.goto('/');
  await page.getByRole('button', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Miljöjulkalendern' })).toBeVisible();
}

/** Piece n belongs at row ⌊(n-1)/9⌋, column (n-1) % 9 (SPEC §5.5). */
export function correctSlot(pieceId: number) {
  return { row: Math.floor((pieceId - 1) / COLUMNS), col: (pieceId - 1) % COLUMNS };
}

/** The clickable (jigsaw-clipped) part of every piece on the user's board. */
export function pieces(page: Page) {
  return page.locator('.piece__hit');
}

export function piece(page: Page, id: number) {
  return page.locator(`.piece[data-piece-id="${id}"] .piece__hit`);
}

export async function pieceIdOf(page: Page, index = 0): Promise<number> {
  const value = await page.locator('.piece').nth(index).getAttribute('data-piece-id');
  return Number(value);
}

/**
 * A piece whose centre is not covered by another piece. Tray positions are random
 * ("huller om buller"), so pieces may overlap and a pointer would grab the top one.
 */
export async function uncoveredPieceId(page: Page): Promise<number> {
  await page.locator('.puzzle-area').scrollIntoViewIfNeeded();
  const id = await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('.piece')) {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (hit?.closest('.piece') === el) return Number(el.dataset.pieceId);
    }
    return null;
  });
  if (id === null) throw new Error('every piece is covered by another');
  return id;
}

/** Drags a piece with the mouse so that its cell lands on the given board cell. */
export async function dragPieceToCell(page: Page, id: number, cell: { row: number; col: number }) {
  const box = await page.locator(`.piece[data-piece-id="${id}"]`).boundingBox();
  const board = await page.locator('.board').boundingBox();
  if (!box || !board) throw new Error('piece or board not visible');
  // The piece box is centred on its cell, so moving its centre to the cell centre lays it there.
  const target = {
    x: board.x + (cell.col + 0.5) * (board.width / COLUMNS),
    y: board.y + (cell.row + 0.5) * (board.height / ROWS),
  };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
}
