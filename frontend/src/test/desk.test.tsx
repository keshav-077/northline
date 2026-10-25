import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { AssumptionPanel } from "../components/AssumptionPanel";
import { DecisionBar } from "../components/DecisionBar";
import { GenerationChart, chartTipLines } from "../components/GenerationChart";
import { IntervalTable } from "../components/IntervalTable";
import { MonthStrip } from "../components/MonthStrip";
import { Section } from "../components/Section";
import { StatePanel } from "../components/StatePanel";
import { Verdict } from "../components/Verdict";
import { biasLabel, formatPercent, gmtClock, insight, shiftDecisionDate } from "../lib/format";
import type { DayResult, HourResult, MetricBlock } from "../lib/types";

const missing: HourResult = {
  decision_date: "2026-01-14",
  delivery_date: "2026-01-15",
  cutoff_utc: "2026-01-14T09:20:00Z",
  vintage_utc: null,
  delivery_start_utc: "2026-01-15T00:00:00Z",
  delivery_start_local: "2026-01-15T00:00:00+00:00",
  forecast_mw: null,
  actual_half_hours_mw: [null, null],
  actual_hour_mw: null,
  error_mw: null,
  lead_time_hours: null,
  status: "missing",
};

describe("desk formatting", () => {
  it("keeps the decision date inside January and reads GMT from the timestamp", () => {
    expect(shiftDecisionDate("2026-01-31", 1)).toBe("2026-01-31");
    expect(shiftDecisionDate("2026-01-01", -1)).toBe("2026-01-01");
    expect(shiftDecisionDate("2026-01-14", 1)).toBe("2026-01-15");
    expect(formatPercent("0.1807")).toBe("18.07%");
    expect(gmtClock("2026-01-14T07:30:00Z")).toBe("07:30 GMT");
  });

  it("names the sign of bias and states the vintage in the lede", () => {
    expect(biasLabel("12.5")).toBe("Overforecast");
    expect(biasLabel("-2")).toBe("Underforecast");
    expect(insight("1041.83", "2026-01-14T07:30:00Z", 24, "09:20")).toContain("07:30 GMT");
    expect(insight("1041.83", "2026-01-14T07:30:00Z", 24, "09:20")).toContain("overstated");
    expect(insight(null, null, 0, "09:20")).toContain("No hours could be scored");
  });
});

describe("states", () => {
  it("shows an em dash for a missing forecast and an empty-state explanation", () => {
    render(<IntervalTable hours={[missing]} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("○ Missing")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hourly evidence" })).toBeInTheDocument();
    render(<StatePanel kind="empty" />);
    expect(screen.getByText(/Missing intervals are left out/)).toBeInTheDocument();
  });

  it("offers a retry when the evaluation cannot be loaded", () => {
    const onRetry = vi.fn();
    render(<StatePanel kind="error" onRetry={onRetry} />);
    screen.getByRole("button", { name: "Retry" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

const metrics = (bias: string | null, scored = bias == null ? 0 : 24): MetricBlock => ({
  mae_mw: bias,
  rmse_mw: bias,
  bias_mw: bias,
  wape: "0.181",
  error_p10_mw: "-549.3",
  error_p50_mw: "1592",
  error_p90_mw: "4097.9",
  n_expected: 24,
  n_scored: scored,
  n_missing: 24 - scored,
  n_excluded: 0,
});

describe("verdict and chart", () => {
  const day: DayResult = {
    decision_date: "2026-01-14",
    delivery_date: "2026-01-15",
    vintage_utc: "2026-01-14T07:30:00Z",
    vintages_mixed: false,
    next_excluded_publish_utc: "2026-01-14T09:30:00Z",
    metrics: metrics("1041.83"),
  };

  it("states the vintage and highlights an overstated day", () => {
    render(
      <Verdict
        deliveryDate="2026-01-15"
        retrievedAt="2026-10-24T18:16:34Z"
        cutoff="09:20"
        strategy="single_vintage"
        day={day}
        errors={[-549.3, 1592, 4097.9]}
        summary={metrics("1747.89", 744)}
      />,
    );
    expect(screen.getByText(/Buys delivery 15 Jan 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Snapshot 2026-10-24/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/overstated/);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/07:30 GMT/);
    expect(screen.getByText(/forecast too high/)).toBeInTheDocument();
  });

  it("labels the largest miss on the combined chart", () => {
    const hour: HourResult = {
      ...missing,
      forecast_mw: 15834,
      actual_half_hours_mw: [14602, 14311],
      actual_hour_mw: "14456.5",
      error_mw: "1377.5",
      lead_time_hours: "16.5",
      status: "scored",
      vintage_utc: "2026-01-14T07:30:00Z",
    };
    render(<GenerationChart hours={[hour]} pinned={null} hover={null} reduced onPin={() => {}} onHover={() => {}} />);
    expect(screen.getByText(/Largest miss/)).toBeInTheDocument();
  });

  it("scales the axis to a half-hour above 20,000 MW and keeps a zero", () => {
    const hour: HourResult = {
      ...missing,
      forecast_mw: 0,
      actual_half_hours_mw: [25000, 0],
      actual_hour_mw: "12500",
      error_mw: "-12500",
      status: "scored",
    };
    const { container } = render(<GenerationChart hours={[hour]} pinned={null} hover={null} reduced onPin={() => {}} onHover={() => {}} />);
    expect(screen.getByText("25,000")).toBeInTheDocument();
    expect(container.querySelector('path[stroke="#2c3338"]')?.getAttribute("d")).toMatch(/M/);
    expect(container.querySelector('path[stroke="#1f4d3a"]')?.getAttribute("d")).toMatch(/M/);
  });

  it("shades the hourly mean when the half-hours sit on either side of the forecast", () => {
    const hour: HourResult = {
      ...missing,
      forecast_mw: 150,
      actual_half_hours_mw: [100, 300],
      actual_hour_mw: "200",
      error_mw: "-50",
      status: "scored",
    };
    const { container } = render(<GenerationChart hours={[hour]} pinned={null} hover={null} reduced onPin={() => {}} onHover={() => {}} />);
    expect(container.querySelector('rect[fill="rgba(31,77,58,0.22)"]')).not.toBeNull();
    expect(container.querySelector('rect[fill="rgba(154,64,48,0.22)"]')).toBeNull();
    const lines = chartTipLines(hour);
    expect(lines.join(" ")).toContain("Forecast 150 MW");
    expect(lines.join(" ")).toContain("Half-hours 100 MW and 300 MW");
    expect(lines.join(" ")).toContain("Hourly mean 200 MW");
    expect(lines.join(" ")).toContain("understated");
  });
});

describe("navigation, labels, and methodology", () => {
  const cutoffs = [{ id: "09:20", local_time: "09:20", market: "EPEX SPOT GB 60-minute", note: "First gate." }];

  it("stops at the first and last January decision dates", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DecisionBar date="2026-01-01" cutoff="09:20" strategy="single_vintage" cutoffs={cutoffs} onChange={onChange} />,
    );
    const previous = screen.getByRole("button", { name: "Previous day" });
    expect(previous).toBeDisabled();
    expect(previous).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(previous);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(onChange).toHaveBeenCalledWith({ date: "2026-01-02" });

    rerender(<DecisionBar date="2026-01-31" cutoff="09:20" strategy="single_vintage" cutoffs={cutoffs} onChange={onChange} />);
    const next = screen.getByRole("button", { name: "Next day" });
    expect(next).toBeDisabled();
    expect(next).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(next);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("puts month labels in the same columns as the bars", () => {
    const days: DayResult[] = Array.from({ length: 31 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return {
        decision_date: `2026-01-${day}`,
        delivery_date: `2026-01-${day}`,
        vintage_utc: null,
        vintages_mixed: false,
        next_excluded_publish_utc: null,
        metrics: metrics("10"),
      };
    });
    render(<MonthStrip days={days} selected="2026-01-14" onSelect={() => {}} />);
    const labels = document.querySelectorAll(".dl span");
    const bars = document.querySelectorAll(".bars button");
    expect(labels).toHaveLength(31);
    expect(bars).toHaveLength(31);
    expect(labels[0]).toHaveTextContent("1 Jan");
    expect(labels[7]).toHaveTextContent("8");
    expect(labels[14]).toHaveTextContent("15");
    expect(labels[21]).toHaveTextContent("22");
    expect(labels[30]).toHaveTextContent("31 Jan");
    expect(labels[1].textContent).toBe("");
    expect(labels[7]).toHaveAttribute("data-day", "2026-01-08");
    expect(bars[7]).toHaveAttribute("aria-label", expect.stringContaining("8 Jan 2026"));
  });

  it("shows January WAPE to two decimal places", () => {
    render(
      <AssumptionPanel
        metaNotes={{ scope: "January", alignment: "Hourly", clock: "publishTime", licence: "BMRS", licenceUrl: "https://example.test" }}
        cutoffs={cutoffs}
        day={null}
        month={{ ...metrics("1747.89", 744), wape: "0.1807" }}
      />,
    );
    fireEvent.click(screen.getByText("How we score"));
    expect(screen.getByText("18.07%")).toBeInTheDocument();
  });

  it("renders a section without hiding it behind a scroll observer", () => {
    render(
      <Section>
        <p>Visible desk section</p>
      </Section>,
    );
    const section = screen.getByText("Visible desk section").closest("section");
    expect(section).not.toHaveClass("rv");
    expect(section).toBeVisible();
  });
});

describe("desk", () => {
  it("renders the prototype layout from the evaluation response", async () => {
    window.history.replaceState(null, "", "/");
    const hour: HourResult = {
      ...missing,
      forecast_mw: 15834,
      actual_half_hours_mw: [14602, 14311],
      actual_hour_mw: "14456.5",
      error_mw: "1377.5",
      lead_time_hours: "16.5",
      status: "scored",
      vintage_utc: "2026-01-14T07:30:00Z",
    };
    const summary = metrics("1747.89", 744);
    summary.n_expected = 744;
    const body = {
      cutoff: "09:20",
      strategy: "single_vintage",
      decision_from: "2026-01-01",
      decision_to: "2026-01-31",
      summary,
      days: [
        {
          decision_date: "2026-01-14",
          delivery_date: "2026-01-15",
          vintage_utc: "2026-01-14T07:30:00Z",
          vintages_mixed: false,
          next_excluded_publish_utc: "2026-01-14T09:30:00Z",
          metrics: metrics("1041.83"),
        },
      ],
      hours: [hour],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const target = new URL(String(url), "http://127.0.0.1");
        const payload = target.pathname.includes("/meta")
          ? {
              product: "Northline",
              snapshot_id: "8e87d9346bc99a87",
              retrieved_at: "2026-10-24T18:16:34Z",
              decision_from: "2026-01-01",
              decision_to: "2026-01-31",
              delivery_from: "2026-01-02",
              delivery_to: "2026-02-01",
              default_cutoff: "09:20",
              default_strategy: "single_vintage",
              cutoffs: [
                { id: "09:20", local_time: "09:20", market: "EPEX SPOT GB 60-minute", note: "First binding GB day-ahead gate." },
                { id: "09:50", local_time: "09:50", market: "Nord Pool N2EX", note: "The 09:30 forecast is eligible for this preset only." },
                { id: "15:30", local_time: "15:30", market: "EPEX SPOT GB 30-minute", note: "A file stamped exactly 15:30 is treated as available." },
              ],
              strategies: ["single_vintage", "latest_interval"],
              units: "MW",
              methodology_version: "1",
              licence: "Contains BMRS data © Elexon Limited copyright and database right 2026",
              licence_url: "https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/",
              scope_note: "Decision dates are London calendar days from 1 January through 31 January 2026.",
              alignment_note: "WINDFOR is an hourly MW forecast.",
              publication_clock_note: "Selection uses publishTime, not the webpage clock.",
              sign_convention: "error = forecast − actual. Positive means the forecast overstated wind.",
              windfor_rows: 1,
              fuelhh_rows: 2,
            }
          : {
              ...body,
              cutoff: target.searchParams.get("cutoff") ?? body.cutoff,
              strategy: target.searchParams.get("strategy") ?? body.strategy,
            };
        return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/overstated/);
    expect(screen.getByText("NORTHLINE")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Forecast in force vs actual generation" })).toBeInTheDocument();
    expect(screen.getByText(/Shading is the hourly forecast against the mean of the two half-hours/)).toBeInTheDocument();
    expect(screen.getByText("Each half-hour")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "January, day by day" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How errors spread across the month" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hourly evidence" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What this number is" })).toBeInTheDocument();
    const row = screen.getByText("15 Jan 00:00").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLElement);
    expect(row).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "09:50" }));
    expect(screen.getByRole("button", { name: "09:50" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(await screen.findByRole("heading", { name: "No hours could be scored for this selection." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Forecast in force vs actual generation" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("keeps the previous vintage off screen until the matching evaluation arrives", async () => {
    window.history.replaceState(null, "", "/");
    const pending: Array<{ cutoff: string; strategy: string; resolve: (response: Response) => void }> = [];
    const json = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
    const evaluationFor = (cutoff: string, strategy: string, vintage: string | null) => ({
      cutoff,
      strategy,
      decision_from: "2026-01-01",
      decision_to: "2026-01-31",
      summary: metrics("1747.89", 744),
      days: [
        {
          decision_date: "2026-01-14",
          delivery_date: "2026-01-15",
          vintage_utc: vintage,
          vintages_mixed: vintage == null,
          next_excluded_publish_utc: null,
          metrics: metrics("1041.83"),
        },
      ],
      hours: [
        {
          ...missing,
          forecast_mw: 15834,
          actual_half_hours_mw: [14602, 14311],
          actual_hour_mw: "14456.5",
          error_mw: "1377.5",
          lead_time_hours: "16.5",
          status: "scored",
          vintage_utc: vintage,
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const target = new URL(String(url), "http://127.0.0.1");
        if (target.pathname.includes("/meta")) {
          return Promise.resolve(
            json({
              product: "Northline",
              snapshot_id: "8e87d9346bc99a87",
              retrieved_at: "2026-10-24T18:16:34Z",
              decision_from: "2026-01-01",
              decision_to: "2026-01-31",
              delivery_from: "2026-01-02",
              delivery_to: "2026-02-01",
              default_cutoff: "09:20",
              default_strategy: "single_vintage",
              cutoffs: [
                { id: "09:20", local_time: "09:20", market: "EPEX", note: "First gate." },
                { id: "09:50", local_time: "09:50", market: "N2EX", note: "09:30 eligible." },
              ],
              strategies: ["single_vintage", "latest_interval"],
              units: "MW",
              methodology_version: "1",
              licence: "BMRS",
              licence_url: "https://example.test",
              scope_note: "January",
              alignment_note: "Hourly",
              publication_clock_note: "publishTime",
              sign_convention: "error = forecast − actual",
              windfor_rows: 1,
              fuelhh_rows: 2,
            }),
          );
        }
        return new Promise<Response>((resolve) => {
          pending.push({
            cutoff: target.searchParams.get("cutoff") ?? "",
            strategy: target.searchParams.get("strategy") ?? "",
            resolve,
          });
        });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(pending.some((item) => item.cutoff === "09:20" && item.strategy === "single_vintage")).toBe(true));
    const first = pending.find((item) => item.cutoff === "09:20" && item.strategy === "single_vintage");
    await act(async () => {
      first?.resolve(json(evaluationFor("09:20", "single_vintage", "2026-01-14T07:30:00Z")));
    });
    expect(await screen.findAllByText(/07:30 GMT/)).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "09:50" }));
    expect(screen.queryAllByText(/07:30 GMT/)).toHaveLength(0);
    expect(screen.getByText("Loading the January replay.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Latest hour" }));
    await waitFor(() => expect(pending.some((item) => item.cutoff === "09:50" && item.strategy === "latest_interval")).toBe(true));
    expect(screen.queryAllByText(/07:30 GMT/)).toHaveLength(0);

    const stale = pending.find((item) => item.cutoff === "09:50" && item.strategy === "single_vintage");
    await act(async () => {
      stale?.resolve(json(evaluationFor("09:50", "single_vintage", "2026-01-14T09:30:00Z")));
    });
    expect(screen.queryAllByText(/09:30 GMT/)).toHaveLength(0);
    expect(screen.queryAllByText(/07:30 GMT/)).toHaveLength(0);
    expect(screen.getByText("Loading the January replay.")).toBeInTheDocument();

    const current = pending.find((item) => item.cutoff === "09:50" && item.strategy === "latest_interval");
    await act(async () => {
      current?.resolve(json(evaluationFor("09:50", "latest_interval", null)));
    });
    expect(await screen.findByText(/latest published forecast for each hour/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "09:20" }));
    expect(screen.queryAllByText(/latest published forecast for each hour/)).toHaveLength(0);
    await waitFor(() => expect(pending.some((item) => item.cutoff === "09:20" && item.strategy === "latest_interval")).toBe(true));
    const failed = pending.find((item) => item.cutoff === "09:20" && item.strategy === "latest_interval");
    await act(async () => {
      failed?.resolve(json({ detail: "no" }, 500));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be loaded/);
    expect(screen.queryAllByText(/07:30 GMT/)).toHaveLength(0);
    expect(screen.queryAllByText(/latest published forecast for each hour/)).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
