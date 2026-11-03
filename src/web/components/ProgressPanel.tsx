import type { ApiProgress } from '../../shared/contract.ts';
import { sv } from '../texts.sv.ts';

export function ProgressPanel({ progress }: { progress: ApiProgress }) {
  const allUnlocked = progress.unlockedPieces >= progress.totalPieces;
  // Progress within the current step towards the next piece (0–completionsPerPiece).
  const towardsNext = allUnlocked
    ? progress.completionsPerPiece
    : Math.max(0, progress.completionsPerPiece - progress.remainingToNextPiece);

  return (
    <section className="card progress" aria-labelledby="progress-heading">
      <h2 id="progress-heading" className="eyebrow">
        {sv.progress.heading}
      </h2>
      <p className="progress__total">{sv.progress.total(progress.totalCompletions)}</p>
      <p className="progress__next">
        {allUnlocked
          ? sv.progress.allUnlocked
          : sv.progress.remaining(progress.remainingToNextPiece)}
      </p>
      <progress
        className="progress__bar"
        max={progress.completionsPerPiece}
        value={towardsNext}
        aria-label={sv.progress.barLabel}
      />
      <p className="muted">{sv.progress.pieces(progress.unlockedPieces, progress.totalPieces)}</p>
    </section>
  );
}
