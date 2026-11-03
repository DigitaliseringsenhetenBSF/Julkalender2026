/**
 * Collective progress → pusselbitar. See docs/SPEC.md §5.3.
 */

/** Pieces earned by `totalCompletions`, capped at the puzzle size. */
export function unlockedPieceCount(
  totalCompletions: number,
  completionsPerPiece: number,
  totalPieces: number,
): number {
  if (completionsPerPiece <= 0) throw new RangeError('completionsPerPiece must be positive');
  return Math.min(Math.floor(Math.max(0, totalCompletions) / completionsPerPiece), totalPieces);
}

/**
 * The new high-water mark. Pieces are monotonic: un-ticks may lower the total, but an
 * unlocked piece is never taken away.
 */
export function nextHighWaterMark(
  storedUnlocked: number,
  totalCompletions: number,
  completionsPerPiece: number,
  totalPieces: number,
): number {
  return Math.max(
    storedUnlocked,
    unlockedPieceCount(totalCompletions, completionsPerPiece, totalPieces),
  );
}

/**
 * Completions still needed before the next piece unlocks, relative to the high-water mark.
 * Can exceed `completionsPerPiece` after un-ticks. 0 when every piece is unlocked.
 */
export function remainingToNextPiece(
  totalCompletions: number,
  unlockedPieces: number,
  completionsPerPiece: number,
  totalPieces: number,
): number {
  if (unlockedPieces >= totalPieces) return 0;
  return Math.max(0, (unlockedPieces + 1) * completionsPerPiece - totalCompletions);
}
