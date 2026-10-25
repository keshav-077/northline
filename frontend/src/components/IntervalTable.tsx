import { useMemo, useState } from "react";
import type { HourResult } from "../lib/types";
import { asNumber, deliveryStamp, formatNumber, formatSignedNumber, gmtClock } from "../lib/format";
import { Segment } from "./Segment";

interface Props {
  hours: HourResult[];
  pinned?: string | null;
  onPin?: (id: string | null) => void;
  onHover?: (id: string | null) => void;
}

type StatusFilter = "all" | HourResult["status"];
type SortKey = "time" | "error";

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "scored", label: "Scored" },
  { id: "missing", label: "Missing" },
  { id: "implausible", label: "Implausible" },
  { id: "conflicting_duplicate", label: "Conflict" },
];

const STATUS: Record<HourResult["status"], { label: string; tone: string }> = {
  scored: { label: "● Scored", tone: "" },
  missing: { label: "○ Missing", tone: "bad" },
  implausible: { label: "▲ Implausible", tone: "bad" },
  conflicting_duplicate: { label: "◆ Conflict", tone: "warn" },
};

export function IntervalTable({ hours, pinned = null, onPin, onHover }: Props) {
  const [sort, setSort] = useState<SortKey>("time");
  const [ascending, setAscending] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("all");
  const counts = useMemo(() => {
    const tally = { all: hours.length, scored: 0, missing: 0, implausible: 0, conflicting_duplicate: 0 };
    hours.forEach((hour) => {
      tally[hour.status] += 1;
    });
    return tally;
  }, [hours]);
  const rows = useMemo(() => {
    const filtered = hours.filter((hour) => status === "all" || hour.status === status);
    return [...filtered].sort((left, right) => {
      if (sort === "time") {
        const order = left.delivery_start_utc.localeCompare(right.delivery_start_utc);
        return ascending ? order : -order;
      }
      const leftError = left.error_mw == null ? -1 : Math.abs(Number(left.error_mw));
      const rightError = right.error_mw == null ? -1 : Math.abs(Number(right.error_mw));
      return rightError - leftError;
    });
  }, [ascending, hours, sort, status]);
  const peak = Math.max(1, ...hours.map((hour) => Math.abs(asNumber(hour.error_mw) ?? 0)));

  return (
    <>
      <div className="sh">
        <div>
          <h2>Hourly evidence</h2>
          <p>Times in London time (GMT in January 2026) · Values in MW. Sort by error to find the hours that mattered.</p>
        </div>
        <Segment
          label="Filter hours"
          value={status}
          options={FILTERS.map((filter) => ({ ...filter, count: counts[filter.id] }))}
          onChange={(id) => setStatus(id as StatusFilter)}
        />
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>
                <button type="button" className={sort === "time" ? "on" : undefined} onClick={() => sortByTime()}>
                  {`London delivery start${sort === "time" ? (ascending ? " ▲" : " ▼") : ""}`}
                </button>
              </th>
              <th>Vintage published</th>
              <th>Forecast</th>
              <th>Half-hour actuals</th>
              <th>Hourly mean</th>
              <th>
                <button type="button" className={sort === "error" ? "on" : undefined} onClick={() => setSort("error")}>
                  {`Signed error${sort === "error" ? " ▼ |abs|" : ""}`}
                </button>
              </th>
              <th>Lead (h)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="empty">
                <td className="empty-row" colSpan={8}>No hours match this filter.</td>
              </tr>
            ) : (
              rows.map((hour) => {
                const error = asNumber(hour.error_mw);
                const selected = pinned === hour.delivery_start_utc;
                return (
                  <tr
                    key={hour.delivery_start_utc}
                    className={selected ? "sel" : undefined}
                    tabIndex={0}
                    aria-selected={selected}
                    onMouseEnter={() => onHover?.(hour.delivery_start_utc)}
                    onMouseLeave={() => onHover?.(null)}
                    onClick={() => onPin?.(selected ? null : hour.delivery_start_utc)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onPin?.(selected ? null : hour.delivery_start_utc);
                    }}
                  >
                    <td className="m">{deliveryStamp(hour.delivery_start_local)}</td>
                    <td className="m">{gmtClock(hour.vintage_utc)}</td>
                    <td className="m">{formatNumber(hour.forecast_mw, 2)}</td>
                    <td className="m">{hour.actual_half_hours_mw.map((value) => formatNumber(value, 2)).join(" / ")}</td>
                    <td className="m">{formatNumber(hour.actual_hour_mw, 2)}</td>
                    <td className={`m${error == null ? "" : error > 0 ? " pos" : error < 0 ? " neg" : ""}`}>
                      <span className="eb">
                        {error == null ? null : <i style={{ width: `${(Math.abs(error) / peak) * 56}px`, background: error > 0 ? "var(--r)" : "var(--g)" }} />}
                        {formatSignedNumber(hour.error_mw, 2)}
                      </span>
                    </td>
                    <td className="m">{hour.lead_time_hours ?? "—"}</td>
                    <td className={`sl ${STATUS[hour.status].tone}`.trim()}>{STATUS[hour.status].label}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  function sortByTime() {
    setAscending(sort === "time" ? !ascending : true);
    setSort("time");
  }
}
