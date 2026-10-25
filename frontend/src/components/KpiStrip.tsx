import type { DayResult, MetricBlock } from "../lib/types";
import { asNumber, formatFixed, formatFixedSigned, formatMw, gmtClock } from "../lib/format";
import { useCountUp } from "../hooks/useCountUp";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

interface Props {
  day: DayResult | null;
  month: MetricBlock;
  strategy: string;
}

export function KpiStrip({ day, month, strategy }: Props) {
  const bias = day && day.metrics.n_scored > 0 ? asNumber(day.metrics.bias_mw) : null;
  const monthBias = asNumber(month.bias_mw);
  const vintage =
    strategy === "latest_interval" ? "Latest per hour" : gmtClock(day?.vintage_utc ?? null);
  const vintageNote =
    strategy === "latest_interval"
      ? "Newest file before cutoff"
      : day?.next_excluded_publish_utc
        ? `Next file ${gmtClock(day.next_excluded_publish_utc)} excluded`
        : "No later file in the extract";
  const biasNote = bias == null ? "Not scored" : bias > 0 ? "Overforecast ↑" : bias < 0 ? "Underforecast ↓" : "No bias";

  return (
    <div className="mt a" role="group" aria-label="Decision metrics">
      <div>
        <div className="k">Forecast vintage</div>
        <div className="v m">{vintage}</div>
        <div className="s2 m">{vintageNote}</div>
      </div>
      <Metric label="Day MAE" value={bias == null ? null : asNumber(day?.metrics.mae_mw ?? null)} note={day ? `${day.metrics.n_scored}/${day.metrics.n_expected} hours scored` : "—"} />
      <Metric label="Day RMSE" value={bias == null ? null : asNumber(day?.metrics.rmse_mw ?? null)} note="Penalises large misses" />
      <Metric label="Day bias" value={bias} signed tone={tone(bias)} note={biasNote} />
      <Metric
        label="January bias"
        value={monthBias}
        signed
        tone={tone(monthBias)}
        note={`${month.n_scored}/${month.n_expected} hours · RMSE ${formatMw(month.rmse_mw, 2)}`}
      />
    </div>
  );
}

function tone(value: number | null): string {
  if (value == null || value === 0) return "";
  return value > 0 ? "pos" : "neg";
}

function Metric({
  label,
  value,
  note,
  signed = false,
  tone: toneClass = "",
}: {
  label: string;
  value: number | null;
  note: string;
  signed?: boolean;
  tone?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const shown = useCountUp(value, reduced);
  const text = shown == null ? "—" : signed ? formatFixedSigned(shown) : formatFixed(shown);
  return (
    <div>
      <div className="k">{label}</div>
      <div className={`v m ${toneClass}`.trim()}>
        {shown == null ? "—" : <>{text}<small> MW</small></>}
      </div>
      <div className="s2 m">{note}</div>
    </div>
  );
}
