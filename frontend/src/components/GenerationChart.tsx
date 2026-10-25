import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { HourResult } from "../lib/types";
import { asNumber, formatNumber, formatSignedNumber, hourIndex, londonClock } from "../lib/format";
import { nice } from "../lib/scale";
import { Tip } from "./Tip";

const HEIGHT = 486;
const LEFT = 58;
const RIGHT = 14;
const TOP: readonly [number, number] = [14, 300];
const BOTTOM: readonly [number, number] = [346, 446];

interface Props {
  hours: HourResult[];
  pinned: string | null;
  hover: string | null;
  reduced: boolean;
  onPin: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

function axis(value: number): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value);
}

function signedAxis(value: number): string {
  const absolute = axis(Math.abs(value));
  if (value > 0) return `+${absolute}`;
  if (value < 0) return `−${absolute}`;
  return absolute;
}

function finiteMw(value: number | null): value is number {
  return value != null && Number.isFinite(value);
}

export function chartTipLines(hour: HourResult): string[] {
  const error = asNumber(hour.error_mw);
  const mean = asNumber(hour.actual_hour_mw);
  const halves = hour.actual_half_hours_mw
    .map((value) => (value == null ? "—" : `${formatNumber(value, 2)} MW`))
    .join(" and ");
  const direction = error == null ? "" : error > 0 ? " · overstated" : error < 0 ? " · understated" : " · matched";
  return [
    `${londonClock(hour.delivery_start_local)} GMT`,
    `Forecast ${hour.forecast_mw == null ? "—" : `${formatNumber(hour.forecast_mw, 2)} MW`}`,
    `Half-hours ${halves}`,
    `Hourly mean ${mean == null ? "—" : `${formatNumber(mean, 2)} MW`}`,
    `Error ${error == null ? "—" : `${formatSignedNumber(error, 2)} MW${direction}`}`,
  ];
}

export function GenerationChart({ hours, pinned, hover, reduced, onPin, onHover }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(680);
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const sorted = useMemo(
    () => [...hours].sort((left, right) => left.delivery_start_utc.localeCompare(right.delivery_start_utc)),
    [hours],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setWidth(Math.max(el.clientWidth, 680));
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotWidth = width - LEFT - RIGHT;
  const xAt = (hour: number) => LEFT + (hour / 24) * plotWidth;
  const finite = sorted.flatMap((hour) => [hour.forecast_mw, ...hour.actual_half_hours_mw]).filter(finiteMw);
  const yMax = nice((finite.length ? Math.max(...finite) : 1) * 1.05);
  const yAt = (value: number) => TOP[1] - ((TOP[1] - TOP[0]) * value) / yMax;
  const errorMax = nice(Math.max(500, ...sorted.map((hour) => Math.abs(asNumber(hour.error_mw) ?? 0))) * 1.1);
  const mid = (BOTTOM[0] + BOTTOM[1]) / 2;
  const zAt = (value: number) => mid - (((BOTTOM[1] - BOTTOM[0]) / 2) * value) / errorMax;
  const byHour = new Map<number, HourResult>();
  sorted.forEach((hour) => byHour.set(Math.floor(hourIndex(hour.delivery_start_local)), hour));

  let forecastPath = "";
  let forecastPen = false;
  let forecastEnd = -1;
  let actualPath = "";
  let actualPen = false;
  sorted.forEach((hour) => {
    const slot = Math.floor(hourIndex(hour.delivery_start_local));
    if (hour.forecast_mw == null) {
      forecastPen = false;
    } else {
      const y = yAt(hour.forecast_mw);
      const contiguous = forecastPen && forecastEnd === slot;
      forecastPath += `${contiguous ? "L" : "M"}${xAt(slot)} ${y}L${xAt(slot + 1)} ${y}`;
      forecastPen = true;
      forecastEnd = slot + 1;
    }
    const start = hourIndex(hour.delivery_start_local);
    hour.actual_half_hours_mw.forEach((value, index) => {
      if (!finiteMw(value)) {
        actualPen = false;
        return;
      }
      actualPath += `${actualPen ? "L" : "M"}${xAt(start + (index === 0 ? 0.25 : 0.75))} ${yAt(value)}`;
      actualPen = true;
    });
  });

  const active = sorted.find((hour) => hour.delivery_start_utc === (pinned ?? hover)) ?? null;
  const worst = sorted.reduce<HourResult | null>((best, hour) => {
    const error = asNumber(hour.error_mw);
    if (error == null) return best;
    if (!best) return hour;
    return Math.abs(error) > Math.abs(asNumber(best.error_mw) ?? 0) ? hour : best;
  }, null);

  const hourFromEvent = (event: MouseEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || plotWidth <= 0) return null;
    const x = ((event.clientX - bounds.left) / bounds.width) * width;
    const slot = Math.min(23, Math.max(0, Math.floor(((x - LEFT) / plotWidth) * 24)));
    return byHour.get(slot) ?? null;
  };

  return (
    <div className="plot" ref={ref}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Forecast versus actual generation with signed error"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const value = (yMax / 4) * step;
          const y = yAt(value);
          return (
            <g key={`y-${step}`}>
              <line x1={LEFT} x2={width - RIGHT} y1={y} y2={y} stroke={step ? "#ece7dd" : "#cfc8ba"} />
              <text x={LEFT - 8} y={y + 3} textAnchor="end">{axis(value)}</text>
            </g>
          );
        })}
        <text x={LEFT - 8} y={8} textAnchor="end">MW</text>
        {[-errorMax, 0, errorMax].map((value) => (
          <g key={`z-${value}`}>
            <line x1={LEFT} x2={width - RIGHT} y1={zAt(value)} y2={zAt(value)} stroke={value ? "#ece7dd" : "#8c877d"} />
            <text x={LEFT - 8} y={zAt(value) + 3} textAnchor="end">{signedAxis(value)}</text>
          </g>
        ))}
        <text x={LEFT - 8} y={BOTTOM[0] - 6} textAnchor="end">Error MW</text>
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
          <g key={`x-${hour}`}>
            <line x1={xAt(hour)} x2={xAt(hour)} y1={TOP[0]} y2={BOTTOM[1]} stroke="#f1ede4" />
            <text x={xAt(hour)} y={HEIGHT - 24} textAnchor="middle">{`${String(hour % 24).padStart(2, "0")}:00`}</text>
          </g>
        ))}
        {active ? (
          <rect
            x={xAt(Math.floor(hourIndex(active.delivery_start_local)))}
            y={TOP[0]}
            width={plotWidth / 24}
            height={BOTTOM[1] - TOP[0]}
            fill={pinned ? "rgba(26,25,22,0.08)" : "rgba(26,25,22,0.05)"}
          />
        ) : null}
        {sorted.map((hour) => {
          const error = asNumber(hour.error_mw);
          const actual = asNumber(hour.actual_hour_mw);
          if (error == null || hour.forecast_mw == null || actual == null) return null;
          const slot = Math.floor(hourIndex(hour.delivery_start_local));
          return (
            <rect
              key={`gap-${hour.delivery_start_utc}`}
              x={xAt(slot)}
              y={yAt(Math.max(hour.forecast_mw, actual))}
              width={plotWidth / 24}
              height={Math.abs(yAt(hour.forecast_mw) - yAt(actual))}
              fill={error > 0 ? "rgba(154,64,48,0.22)" : "rgba(31,77,58,0.22)"}
            />
          );
        })}
        {sorted.map((hour) => {
          const error = asNumber(hour.error_mw);
          if (error == null) return null;
          const slot = Math.floor(hourIndex(hour.delivery_start_local));
          return (
            <rect
              key={`bar-${hour.delivery_start_utc}`}
              x={xAt(slot) + (plotWidth / 24) * 0.18}
              y={Math.min(zAt(0), zAt(error))}
              width={(plotWidth / 24) * 0.64}
              height={Math.max(1, Math.abs(zAt(error) - zAt(0)))}
              fill={error > 0 ? "#9a4030" : error < 0 ? "#1f4d3a" : "#5e5a53"}
            />
          );
        })}
        <g className={reduced ? undefined : "dr"}>
          {forecastPath ? <path d={forecastPath} pathLength={1} fill="none" stroke="#1f4d3a" strokeWidth={2} /> : null}
          {actualPath ? <path d={actualPath} pathLength={1} fill="none" stroke="#2c3338" strokeWidth={1.4} /> : null}
        </g>
        {worst ? <LargestMiss hour={worst} xAt={xAt} zAt={zAt} plotWidth={width} /> : null}
        {active && active.forecast_mw != null ? (
          <circle cx={xAt(hourIndex(active.delivery_start_local) + 0.5)} cy={yAt(active.forecast_mw)} r={4} fill="#fffcf8" stroke="#1f4d3a" strokeWidth={2} />
        ) : null}
        {active && asNumber(active.actual_hour_mw) != null ? (
          <circle
            cx={xAt(hourIndex(active.delivery_start_local) + 0.5)}
            cy={yAt(asNumber(active.actual_hour_mw) ?? 0)}
            r={4}
            fill="#2c3338"
            stroke="#fffcf8"
            strokeWidth={1.5}
          />
        ) : null}
        <rect
          x={LEFT}
          y={TOP[0]}
          width={Math.max(plotWidth, 0)}
          height={BOTTOM[1] - TOP[0]}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onMouseMove={(event) => {
            const hour = hourFromEvent(event);
            const next = hour?.delivery_start_utc ?? null;
            if (next !== hover) onHover(next);
            if (!hour) {
              setTip(null);
              return;
            }
            setTip({
              x: event.clientX,
              y: event.clientY,
              lines: chartTipLines(hour),
            });
          }}
          onMouseLeave={() => {
            setTip(null);
            if (hover) onHover(null);
          }}
          onClick={(event) => {
            const hour = hourFromEvent(event);
            if (!hour) return;
            onPin(pinned === hour.delivery_start_utc ? null : hour.delivery_start_utc);
          }}
        />
      </svg>
      {tip ? <Tip x={tip.x} y={tip.y} lines={tip.lines} /> : null}
    </div>
  );
}

function LargestMiss({
  hour,
  xAt,
  zAt,
  plotWidth,
}: {
  hour: HourResult;
  xAt: (hour: number) => number;
  zAt: (value: number) => number;
  plotWidth: number;
}) {
  const error = asNumber(hour.error_mw);
  if (error == null) return null;
  const slot = Math.floor(hourIndex(hour.delivery_start_local));
  const x = Math.min(plotWidth - 140, Math.max(LEFT + 140, xAt(slot + 0.5)));
  return (
    <text className="ink" textAnchor="middle" x={x} y={error > 0 ? zAt(error) - 6 : zAt(error) + 14}>
      {`Largest miss ${formatSignedNumber(error, 0)} MW · ${londonClock(hour.delivery_start_local)}`}
    </text>
  );
}
