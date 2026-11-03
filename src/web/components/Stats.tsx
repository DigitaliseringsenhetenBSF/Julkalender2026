import { useState } from 'react';
import type { ApiProgress } from '../../shared/contract.ts';
import { sv } from '../texts.sv.ts';

/** Rounds up to a clean axis maximum (1, 2, 5 × 10ⁿ). */
function niceCeil(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

export function Stats({ progress }: { progress: ApiProgress }) {
  const [hover, setHover] = useState<{ day: number; count: number; x: number } | null>(null);
  const perDay = progress.perDay;
  const axisMax = niceCeil(Math.max(0, ...perDay.map((d) => d.completions)));

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

      <h3 className="chart__title">{sv.stats.perDayHeading}</h3>
      {perDay.length === 0 ? (
        <p className="muted">{sv.stats.perDayEmpty}</p>
      ) : (
        <>
          {/* Visual chart; the table below carries the same data for screen readers. */}
          <div className="chart" aria-hidden="true" onPointerLeave={() => setHover(null)}>
            <div className="chart__axis">
              <span>{axisMax}</span>
              <span>0</span>
            </div>
            <div className="chart__plot">
              {perDay.map((d) => (
                <div
                  key={d.day}
                  className={`chart__col${hover?.day === d.day ? ' chart__col--hover' : ''}`}
                  onPointerEnter={(event) =>
                    setHover({
                      day: d.day,
                      count: d.completions,
                      x: event.currentTarget.offsetLeft + event.currentTarget.offsetWidth / 2,
                    })
                  }
                >
                  <div className="chart__track">
                    <div
                      className="chart__bar"
                      style={{ height: `${(d.completions / axisMax) * 100}%` }}
                    />
                  </div>
                  <span className="chart__label">{d.day}</span>
                </div>
              ))}
              {hover && (
                <div className="chart__tooltip" style={{ left: hover.x }}>
                  <strong>{hover.count}</strong>
                  <span>Lucka {hover.day}</span>
                </div>
              )}
            </div>
          </div>
          <details className="chart__table">
            <summary>{sv.stats.showTable}</summary>
            <table>
              <caption className="visually-hidden">{sv.stats.perDayHeading}</caption>
              <thead>
                <tr>
                  <th scope="col">{sv.stats.colDay}</th>
                  <th scope="col">{sv.stats.colCount}</th>
                </tr>
              </thead>
              <tbody>
                {perDay.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{d.completions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
