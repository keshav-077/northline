import { useEffect, useRef, useState } from "react";
import type { MetricBlock } from "../lib/types";
import { formatSignedNumber } from "../lib/format";

interface Props {
  errors: number[];
  summary: MetricBlock;
}

export function ErrorDistribution({ errors, summary }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(440);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setWidth(Math.max(280, el.clientWidth || 440));
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [errors.length]);

  const marks = (
    <div className="ps m">
      <span>P10 <b>{quantile(summary.error_p10_mw)}</b></span>
      <span>Median <b>{quantile(summary.error_p50_mw)}</b></span>
      <span>P90 <b>{quantile(summary.error_p90_mw)}</b></span>
    </div>
  );
  if (errors.length === 0) {
    return (
      <>
        <p className="s2">No scored hours.</p>
        {marks}
      </>
    );
  }

  let low = Math.floor(Math.min(...errors) / 250) * 250;
  let high = Math.ceil(Math.max(...errors) / 250) * 250;
  if (high <= low) high = low + 250;
  const binsCount = Math.round((high - low) / 250);
  const bins = Array.from({ length: binsCount }, () => 0);
  errors.forEach((value) => {
    const index = Math.min(binsCount - 1, Math.max(0, Math.floor((value - low) / 250)));
    bins[index] += 1;
  });
  const viewWidth = Math.max(280, width);
  const viewHeight = 210;
  const left = 34;
  const right = 6;
  const peak = Math.max(...bins, 1);
  const plot = viewWidth - left - right;
  const xAt = (value: number) => left + ((value - low) / (high - low)) * plot;
  const yAt = (value: number) => 6 + (viewHeight - 34) * (1 - value / peak);
  const labels: number[] = [];
  for (let value = Math.ceil(low / 2000) * 2000; value <= high; value += 2000) labels.push(value);

  return (
    <>
      <div ref={ref}>
        <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} width="100%" role="img" aria-label="Distribution of signed hourly errors for all January decisions">
          {[0, 0.5, 1].map((share) => (
            <g key={share}>
              <line x1={left} x2={viewWidth - right} y1={yAt(peak * share)} y2={yAt(peak * share)} stroke="#e4dfd6" />
              <text x={left - 6} y={yAt(peak * share) + 3} textAnchor="end">{Math.round(peak * share)}</text>
            </g>
          ))}
          {bins.map((count, index) => {
            const start = low + index * 250;
            const y = yAt(count);
            return (
              <rect
                key={start}
                className="hb"
                x={xAt(start) + 1}
                y={y}
                width={Math.max(1, plot / binsCount - 2)}
                height={Math.max(0, viewHeight - 28 - y)}
                fill="#2c3338"
                style={{ animationDelay: `${index * 14}ms` }}
              >
                <title>{`${formatSignedNumber(start, 0)} to ${formatSignedNumber(start + 250, 0)} MW: ${count} hours`}</title>
              </rect>
            );
          })}
          {labels.map((value) => (
            <text key={value} x={xAt(value)} y={viewHeight - 10} textAnchor="middle">{formatSignedNumber(value, 0)}</text>
          ))}
          <line x1={xAt(0)} x2={xAt(0)} y1={4} y2={viewHeight - 28} stroke="#9a4030" strokeDasharray="3 3" />
          <text className="zero" x={xAt(0) + 4} y={14}>0</text>
        </svg>
      </div>
      {marks}
    </>
  );
}

function quantile(value: string | null): string {
  if (value == null) return "—";
  return `${formatSignedNumber(value, 2)} MW`;
}
