import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The project root, found by walking up to package.json. Works both from `src/` (dev, tests)
 * and from the compiled `dist/src/` (production).
 */
function findRoot(start: string): string {
  let dir = start;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`package.json not found above ${start}`);
    dir = parent;
  }
  return dir;
}

export const ROOT_DIR = findRoot(dirname(fileURLToPath(import.meta.url)));
export const MIGRATIONS_DIR = join(ROOT_DIR, 'src', 'data', 'migrations');
export const CONTENT_DIR = join(ROOT_DIR, 'content');
export const PIECES_DIR = join(ROOT_DIR, 'assets', 'puzzle', 'pieces');
export const WEB_DIST_DIR = join(ROOT_DIR, 'dist', 'web');
