import type { CutoffInfo, DayResult, MetricBlock } from "../lib/types";
import { formatMw, formatPercent } from "../lib/format";

interface Props {
  metaNotes: { scope: string; alignment: string; clock: string; licence: string; licenceUrl: string };
  cutoffs: CutoffInfo[];
  day: DayResult | null;
  month: MetricBlock;
}

export function AssumptionPanel({ metaNotes, cutoffs, day, month }: Props) {
  return (
    <>
      <div className="sh">
        <h2>What this number is</h2>
      </div>
      <div className="me">
        <div>
          <div className="sgn">
            <span className="m">error = forecast − actual</span>
            <p>Positive means the forecast overstated wind.</p>
          </div>
          <div className="lim">
            <b>Important limitation</b>
            Positive forecast error is not the same as procurement volume. Demand and the contract book are outside the dataset.
          </div>
        </div>
        <div>
          <details>
            <summary>Decision cutoffs</summary>
            <div>
              <ul>
                {cutoffs.map((cutoff) => (
                  <li key={cutoff.id}>
                    <span className="m">{cutoff.local_time}</span>
                    {` — ${cutoff.market}. ${cutoff.note}`}
                  </li>
                ))}
              </ul>
            </div>
          </details>
          <details>
            <summary>How we score</summary>
            <div>
              <p>
                <b>MAE</b> is the mean absolute error, <b>bias</b> the mean signed error, <b>RMSE</b> the root of mean squared error, so large misses weigh more.
              </p>
              <p>
                Day RMSE <span className="m">{formatMw(day?.metrics.rmse_mw ?? null, 2)}</span>
                {" · January RMSE "}
                <span className="m">{formatMw(month.rmse_mw, 2)}</span>
                {" · January WAPE "}
                <span className="m">{formatPercent(month.wape)}</span>
              </p>
            </div>
          </details>
          <details>
            <summary>Alignment</summary>
            <div>
              <p>{metaNotes.alignment}</p>
            </div>
          </details>
          <details>
            <summary>Scope</summary>
            <div>
              <p>{metaNotes.scope}</p>
            </div>
          </details>
          <details>
            <summary>Clock</summary>
            <div>
              <p>{metaNotes.clock}</p>
            </div>
          </details>
        </div>
      </div>
      <p className="at">
        <a href={metaNotes.licenceUrl}>{metaNotes.licence}</a>
      </p>
    </>
  );
}
