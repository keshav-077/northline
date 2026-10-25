import { useState } from "react";
import type { DayResult } from "../lib/types";
import { asNumber, biasLabel, formatDate, formatMw, formatNumber, formatSignedNumber } from "../lib/format";
import { Tip } from "./Tip";

interface Props {
  days: DayResult[];
  selected: string;
  onSelect: (date: string) => void;
}

function dayLabel(iso: string): string {
  const day = Number(iso.slice(8, 10));
  if (day === 1) return "1 Jan";
  if (day === 31) return "31 Jan";
  if (day === 8 || day === 15 || day === 22) return String(day);
  return "";
}

export function MonthStrip({ days, selected, onSelect }: Props) {
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const peak = Math.max(1, ...days.map((day) => Math.abs(asNumber(day.metrics.bias_mw) ?? 0)));
  const columns = { gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(8px, 1fr))` };

  return (
    <>
      <div className="sw">
        <div className="bars" role="list" aria-label="Bias by decision date" style={columns}>
          {days.map((day) => {
            const bias = day.metrics.n_scored > 0 ? asNumber(day.metrics.bias_mw) : null;
            const height = bias == null ? 9 : Math.max(4, (Math.abs(bias) / peak) * 100);
            const lines =
              bias == null
                ? [formatDate(day.decision_date), "No scored data"]
                : [formatDate(day.decision_date), `Bias ${formatSignedNumber(bias, 2)} MW`, `MAE ${formatNumber(day.metrics.mae_mw, 2)} MW`];
            return (
              <button
                key={day.decision_date}
                type="button"
                role="listitem"
                className={`bar${bias == null ? " x" : ""}${day.decision_date === selected ? " sel" : ""}`}
                aria-current={day.decision_date === selected ? "true" : undefined}
                aria-label={`${formatDate(day.decision_date)}, ${biasLabel(day.metrics.bias_mw)}, ${formatMw(day.metrics.bias_mw, 2)}`}
                onClick={() => onSelect(day.decision_date)}
                onMouseMove={(event) => setTip({ x: event.clientX, y: event.clientY, lines })}
                onMouseLeave={() => setTip(null)}
                onFocus={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setTip({ x: bounds.left, y: bounds.top, lines });
                }}
                onBlur={() => setTip(null)}
              >
                <i style={bias == null ? undefined : { height: `${height}%`, background: bias > 0 ? "var(--r)" : "var(--g)" }} />
              </button>
            );
          })}
        </div>
        <div className="dl m" style={columns}>
          {days.map((day) => (
            <span key={day.decision_date} data-day={day.decision_date}>
              {dayLabel(day.decision_date)}
            </span>
          ))}
        </div>
      </div>
      {tip ? <Tip x={tip.x} y={tip.y} lines={tip.lines} /> : null}
    </>
  );
}
