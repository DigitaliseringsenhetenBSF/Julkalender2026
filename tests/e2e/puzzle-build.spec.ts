import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { correctSlot, piece, resetDatabase, signIn } from './helpers.ts';

/**
 * "The puzzle can be built": every piece the server hands out shows exactly the part of the
 * picture that belongs at its slot, and laying all 45 through the UI completes the puzzle.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const shapes = JSON.parse(readFileSync(join(ROOT, 'content', 'puzzle-shapes.json'), 'utf8')) as {
  imageWidth: number;
  imageHeight: number;
  columns: number;
  rows: number;
  pad: { x: number; y: number };
};
const TOTAL = shapes.columns * shapes.rows;

test.beforeEach(async ({ page }) => {
  await resetDatabase(page);
  expect((await page.request.post('/api/test/unlock-all')).status()).toBe(204);
});

test('every piece shows the part of the picture that belongs at its slot', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium-desktop', 'image check is browser-independent');
  await signIn(page, 'Pusseltestare (alla bitar)');
  const board = (await (await page.request.get('/api/board')).json()) as {
    pieces: { id: number; image: string }[];
  };
  expect(board.pieces).toHaveLength(TOTAL);

  const source = `data:image/png;base64,${readFileSync(
    join(ROOT, 'assets', 'puzzle', 'source', 'vinterfest.png'),
  ).toString('base64')}`;
  // For each piece, find the cell of the source image it resembles most (inner 60 % of the cell,
  // away from tabs and cut lines). It must be the piece's own cell.
  const matches = await page.evaluate(
    async ({ source, shapes, pieces }) => {
      const load = (url: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });
      const SIZE = 32;
      const sample = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = SIZE;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        ctx.drawImage(img, x, y, w, h, 0, 0, SIZE, SIZE);
        return ctx.getImageData(0, 0, SIZE, SIZE).data;
      };
      const distance = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
        let sum = 0;
        for (let i = 0; i < a.length; i += 4) {
          sum +=
            Math.abs(a[i]! - b[i]!) +
            Math.abs(a[i + 1]! - b[i + 1]!) +
            Math.abs(a[i + 2]! - b[i + 2]!);
        }
        return sum;
      };
      const picture = await load(source);
      const cw = shapes.imageWidth / shapes.columns;
      const ch = shapes.imageHeight / shapes.rows;
      const cells: Uint8ClampedArray[] = [];
      for (let k = 0; k < shapes.columns * shapes.rows; k++) {
        const r = Math.floor(k / shapes.columns);
        const c = k % shapes.columns;
        cells.push(sample(picture, (c + 0.2) * cw, (r + 0.2) * ch, 0.6 * cw, 0.6 * ch));
      }
      const result: { id: number; bestCell: number }[] = [];
      for (const p of pieces) {
        const img = await load(p.image);
        // The image is the piece box: the cell plus pad on every side.
        const sx = img.naturalWidth / (cw * (1 + 2 * shapes.pad.x));
        const sy = img.naturalHeight / (ch * (1 + 2 * shapes.pad.y));
        const inner = sample(
          img,
          (shapes.pad.x + 0.2) * cw * sx,
          (shapes.pad.y + 0.2) * ch * sy,
          0.6 * cw * sx,
          0.6 * ch * sy,
        );
        const distances = cells.map((cell) => distance(inner, cell));
        result.push({ id: p.id, bestCell: distances.indexOf(Math.min(...distances)) + 1 });
      }
      return result;
    },
    { source, shapes, pieces: board.pieces },
  );
  const wrong = matches.filter((m) => m.bestCell !== m.id);
  expect(wrong).toEqual([]);
});

test('laying all pieces through the UI completes the puzzle', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, 'Pusseltestare (alla bitar)');
  await expect(page.locator('.piece__hit')).toHaveCount(TOTAL);
  await expect(page.getByText('Pusslet är komplett!', { exact: false })).toHaveCount(0);

  for (let id = 1; id <= TOTAL; id++) {
    const slot = correctSlot(id);
    await piece(page, id).focus();
    await page.keyboard.press('Enter');
    const cell = page.getByRole('button', { name: `Rad ${slot.row + 1}, kolumn ${slot.col + 1}` });
    await cell.focus();
    await page.keyboard.press('Enter');
    await expect(piece(page, id)).toBeFocused();
  }

  await expect(page.getByText('Pusslet är komplett!', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Pusslet är komplett!', { exact: false })).toBeVisible();
});
