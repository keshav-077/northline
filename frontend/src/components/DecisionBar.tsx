import { useEffect, useState } from "react";
import type { CutoffInfo } from "../lib/types";
import { decisionDates, formatDate, shiftDecisionDate } from "../lib/format";
import { Segment } from "./Segment";

interface Props {
  date: string;
  cutoff: string;
  strategy: string;
  cutoffs: CutoffInfo[];
  onChange: (next: { date?: string; cutoff?: string; strategy?: string }) => void;
}

const DATES = decisionDates();

export function DecisionBar({ date, cutoff, strategy, cutoffs, onChange }: Props) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={scrolled ? "s" : undefined}>
      <div className="w hi">
        <div className="br">
          <i aria-hidden="true" />
          NORTHLINE
        </div>
        <div className="tb">
          <div className="seg" role="group" aria-label="Decision date">
            <button
              type="button"
              aria-label="Previous day"
              aria-disabled={date <= "2026-01-01"}
              disabled={date <= "2026-01-01"}
              onClick={() => onChange({ date: shiftDecisionDate(date, -1) })}
            >
              ‹
            </button>
            <select className="m" aria-label="Decision date" value={date} onChange={(event) => onChange({ date: event.target.value })}>
              {DATES.map((iso) => (
                <option key={iso} value={iso}>
                  {formatDate(iso)}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Next day"
              aria-disabled={date >= "2026-01-31"}
              disabled={date >= "2026-01-31"}
              onClick={() => onChange({ date: shiftDecisionDate(date, 1) })}
            >
              ›
            </button>
          </div>
          <Segment
            label="Decision cutoff"
            value={cutoff}
            options={cutoffs.map((item) => ({ id: item.id, label: item.local_time }))}
            onChange={(id) => onChange({ cutoff: id })}
          />
          <Segment
            label="Forecast selection"
            value={strategy}
            options={[
              { id: "single_vintage", label: "One file" },
              { id: "latest_interval", label: "Latest hour" },
            ]}
            onChange={(id) => onChange({ strategy: id })}
          />
        </div>
      </div>
    </header>
  );
}
