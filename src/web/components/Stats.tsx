import type { ApiProgress } from '../../shared/contract.ts';
import { sv } from '../texts.sv.ts';

/** Personal and collective totals. Per-uppdrag counts are shown on each opened lucka. */
export function Stats({ progress }: { progress: ApiProgress }) {
  return (
    <section className="card stats" aria-labelledby="stats-heading">
      <h2 id="stats-heading">{sv.stats.heading}</h2>
      <dl className="tiles">
        <div className="tile">
          <dt>{sv.stats.mine}</dt>
          <dd>{sv.stats.mineValue(progress.mine.completed, progress.mine.possible)}</dd>
        </div>
        <div className="tile">
          <dt>{sv.stats.together}</dt>
          <dd>{sv.stats.togetherValue(progress.totalCompletions)}</dd>
        </div>
        <div className="tile">
          <dt>{sv.stats.pieces}</dt>
          <dd>{sv.stats.piecesValue(progress.unlockedPieces, progress.totalPieces)}</dd>
        </div>
        <div className="tile">
          <dt>{sv.stats.participants}</dt>
          <dd>{progress.participants}</dd>
        </div>
      </dl>
    </section>
  );
}
