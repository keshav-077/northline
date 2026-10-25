import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getEvaluation, getMeta } from "./lib/api";
import { useDeskParams } from "./hooks/useDeskParams";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";
import { FALLBACK_CUTOFFS, FALLBACK_NOTES } from "./lib/deskDefaults";
import { DeskLayout } from "./components/DeskLayout";
import { DecisionBar } from "./components/DecisionBar";
import { Verdict } from "./components/Verdict";
import { KpiStrip } from "./components/KpiStrip";
import { Section } from "./components/Section";
import { GenerationChart } from "./components/GenerationChart";
import { MonthStrip } from "./components/MonthStrip";
import { ErrorDistribution } from "./components/ErrorDistribution";
import { IntervalTable } from "./components/IntervalTable";
import { AssumptionPanel } from "./components/AssumptionPanel";
import { StatePanel } from "./components/StatePanel";

export function App() {
  const desk = useDeskParams();
  const reduced = usePrefersReducedMotion();
  const meta = useQuery({ queryKey: ["meta"], queryFn: getMeta });
  const evaluation = useQuery({
    queryKey: ["evaluation", desk.cutoff, desk.strategy],
    queryFn: () => getEvaluation(desk.cutoff, desk.strategy),
  });
  const matched =
    evaluation.data && evaluation.data.cutoff === desk.cutoff && evaluation.data.strategy === desk.strategy
      ? evaluation.data
      : null;
  const [pinned, setPinned] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    setPinned(null);
    setHover(null);
  }, [desk.cutoff, desk.date, desk.strategy]);

  const day = matched?.days.find((item) => item.decision_date === desk.date) ?? null;
  const hours = useMemo(
    () => matched?.hours.filter((hour) => hour.decision_date === desk.date) ?? [],
    [desk.date, matched],
  );
  const errors = useMemo(
    () =>
      matched?.hours.flatMap((hour) => {
        const value = Number(hour.error_mw);
        return hour.error_mw === null || !Number.isFinite(value) ? [] : [value];
      }) ?? [],
    [matched],
  );
  const scored = Boolean(day && day.metrics.n_scored > 0);
  const waiting = !matched && !evaluation.isError;
  const notes = {
    scope: meta.data?.scope_note || FALLBACK_NOTES.scope,
    alignment: meta.data?.alignment_note || FALLBACK_NOTES.alignment,
    clock: meta.data?.publication_clock_note || FALLBACK_NOTES.clock,
    licence: meta.data?.licence || FALLBACK_NOTES.licence,
    licenceUrl: meta.data?.licence_url || FALLBACK_NOTES.licenceUrl,
  };

  return (
    <DeskLayout
      header={
        <DecisionBar
          date={desk.date}
          cutoff={desk.cutoff}
          strategy={desk.strategy}
          cutoffs={meta.data?.cutoffs ?? FALLBACK_CUTOFFS}
          onChange={desk.update}
        />
      }
    >
      {waiting ? <StatePanel kind="loading" /> : null}
      {evaluation.isError && !matched ? (
        <StatePanel
          kind="error"
          message={(evaluation.error as Error | null)?.message || (meta.error as Error | null)?.message}
          onRetry={() => {
            void meta.refetch();
            void evaluation.refetch();
          }}
        />
      ) : null}
      {matched ? (
        <>
          <Verdict
            deliveryDate={day?.delivery_date ?? null}
            retrievedAt={meta.data?.retrieved_at ?? null}
            cutoff={matched.cutoff}
            strategy={matched.strategy}
            day={day}
            errors={errors}
            summary={matched.summary}
          />
          <KpiStrip day={day} month={matched.summary} strategy={matched.strategy} />
          {scored ? null : <StatePanel kind="empty" />}
          {scored ? (
            <Section>
              <div className="sh">
                <div>
                  <h2>Forecast in force vs actual generation</h2>
                  <p>Shading is the hourly forecast against the mean of the two half-hours. The dark line is each half-hour, which can sit on the other side of the forecast. Select an hour to pin it.</p>
                </div>
                <div className="lg">
                  <span><b style={{ borderColor: "#1f4d3a" }} />Forecast, hourly step</span>
                  <span><b style={{ borderColor: "#2c3338" }} />Each half-hour</span>
                  <span><i style={{ background: "rgba(154,64,48,.3)" }} />Over, hourly mean</span>
                  <span><i style={{ background: "rgba(31,77,58,.3)" }} />Under, hourly mean</span>
                </div>
              </div>
              <div className="cw">
                <GenerationChart hours={hours} pinned={pinned} hover={hover} reduced={reduced} onPin={setPinned} onHover={setHover} />
              </div>
              <p className="s2" style={{ margin: "8px 0 0" }}>
                London time, GMT throughout this month. The shaded band is the hourly forecast against the mean of the two half-hours. The dark line is each half-hour. Lower panel: error = forecast − actual, in MW.
              </p>
            </Section>
          ) : null}
          <Section>
            <div className="two">
              <div>
                <div className="sh">
                  <div>
                    <h2>January, day by day</h2>
                    <p>Bar height is each day’s absolute bias. Click a day to replay it.</p>
                  </div>
                </div>
                <MonthStrip days={matched.days} selected={desk.date} onSelect={(date) => desk.update({ date })} />
              </div>
              <div>
                <div className="sh">
                  <div>
                    <h2>How errors spread across the month</h2>
                    <p>All scored hours in 250 MW bins. Fixed to January when you change day.</p>
                  </div>
                </div>
                <ErrorDistribution errors={errors} summary={matched.summary} />
              </div>
            </div>
          </Section>
          {scored ? (
            <Section>
              <IntervalTable hours={hours} pinned={pinned} onPin={setPinned} onHover={setHover} />
            </Section>
          ) : null}
          <Section>
            <AssumptionPanel
              metaNotes={notes}
              cutoffs={meta.data?.cutoffs ?? FALLBACK_CUTOFFS}
              day={day}
              month={matched.summary}
            />
          </Section>
        </>
      ) : null}
    </DeskLayout>
  );
}
