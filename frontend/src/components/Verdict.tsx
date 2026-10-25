import type { DayResult, MetricBlock } from "../lib/types";
import { asNumber, formatDate, formatMw, formatSignedMw, formatSignedNumber, gmtClock } from "../lib/format";
import { percentile } from "../lib/scale";

interface Props {
  deliveryDate: string | null;
  retrievedAt: string | null;
  cutoff: string;
  strategy: string;
  day: DayResult | null;
  errors: number[];
  summary: MetricBlock;
}

export function Verdict({ deliveryDate, retrievedAt, cutoff, strategy, day, errors, summary }: Props) {
  const bias = day && day.metrics.n_scored > 0 ? asNumber(day.metrics.bias_mw) : null;
  const scored = day?.metrics.n_scored ?? 0;
  const deliveryLabel = deliveryDate ? formatDate(deliveryDate) : "selected";
  const context = [
    "Historical replay",
    deliveryDate ? `Buys delivery ${formatDate(deliveryDate)}` : "Delivery date unavailable",
    retrievedAt ? `Snapshot ${retrievedAt.slice(0, 10)}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const lead =
    strategy === "latest_interval"
      ? `At ${cutoff} GMT the latest published forecast for each hour was used.`
      : `At ${cutoff} GMT the forecast in force was published at ${gmtClock(day?.vintage_utc ?? null)}.`;

  return (
    <section className="ver a">
      <div>
        <p className="ctx m">{context}</p>
        <h1>
          {bias == null ? (
            <>
              No forecast evaluation is available for the {deliveryLabel} delivery day. <span className="m neu">Data unavailable</span>
            </>
          ) : Math.abs(bias) < 50 ? (
            <>
              {lead} It was close to neutral, averaging <span className="m neu">{formatSignedMw(day?.metrics.bias_mw ?? null)}</span> across {scored} hours.
            </>
          ) : (
            <>
              {lead} It {bias > 0 ? "overstated" : "understated"} wind by{" "}
              <span className={bias > 0 ? "m" : "m neg"}>{formatMw(Math.abs(bias), 2)}</span> on average across {scored} hours.
            </>
          )}
        </h1>
      </div>
      <BiasRuler bias={bias} errors={errors} summary={summary} />
    </section>
  );
}

function BiasRuler({ bias, errors, summary }: { bias: number | null; errors: number[]; summary: MetricBlock }) {
  const p10 = asNumber(summary.error_p10_mw) ?? percentile(errors, 0.1);
  const p50 = asNumber(summary.error_p50_mw) ?? percentile(errors, 0.5);
  const p90 = asNumber(summary.error_p90_mw) ?? percentile(errors, 0.9);
  const low = Math.floor(Math.min(percentile(errors, 0.02), bias ?? 0, 0) / 2000) * 2000 - 1000;
  const high = Math.ceil(Math.max(percentile(errors, 0.98), bias ?? 0, 0) / 2000) * 2000 + 1000;
  const span = high - low || 1;
  const pos = (value: number) => `${((value - low) / span) * 100}%`;
  const ticks: number[] = [];
  for (let cursor = low; cursor <= high + 0.5; cursor += 2000) ticks.push(cursor);

  return (
    <div>
      <div className="ru" aria-hidden="true">
        <div className="ax" />
        <div className="bd" style={{ left: pos(p10), width: `${((p90 - p10) / span) * 100}%` }} />
        <div className="tk" style={{ left: pos(p50) }} />
        <div className="z" style={{ left: pos(0) }} />
        {ticks.map((tick) => (
          <span key={tick} className="tl m" style={{ left: pos(tick) }}>
            {formatSignedNumber(tick, 0)}
          </span>
        ))}
        <div
          className="dm m"
          style={{
            left: pos(bias ?? 0),
            opacity: bias == null ? 0 : 1,
            color: bias != null && bias < 0 ? "var(--g)" : "var(--r)",
          }}
        >
          {bias == null ? "" : `Day ${formatSignedNumber(bias, 0)}`}
        </div>
      </div>
      <div className="rc">
        <span>← forecast too low</span>
        <span>forecast too high →</span>
      </div>
      <p className="s2" style={{ margin: "8px 0 0" }}>
        Selected day against January’s spread of hourly errors. Shaded band is P10–P90, the tick is the median.
      </p>
    </div>
  );
}
