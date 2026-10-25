export interface CutoffInfo {
  id: string;
  local_time: string;
  market: string;
  note: string;
}

export interface MetricBlock {
  mae_mw: string | null;
  rmse_mw: string | null;
  bias_mw: string | null;
  wape: string | null;
  error_p10_mw: string | null;
  error_p50_mw: string | null;
  error_p90_mw: string | null;
  n_expected: number;
  n_scored: number;
  n_missing: number;
  n_excluded: number;
}

export interface HourResult {
  decision_date: string;
  delivery_date: string;
  cutoff_utc: string;
  vintage_utc: string | null;
  delivery_start_utc: string;
  delivery_start_local: string;
  forecast_mw: number | null;
  actual_half_hours_mw: Array<number | null>;
  actual_hour_mw: string | null;
  error_mw: string | null;
  lead_time_hours: string | null;
  status: "scored" | "missing" | "implausible" | "conflicting_duplicate";
}

export interface DayResult {
  decision_date: string;
  delivery_date: string;
  vintage_utc: string | null;
  vintages_mixed: boolean;
  next_excluded_publish_utc: string | null;
  metrics: MetricBlock;
}

export interface Evaluation {
  cutoff: string;
  strategy: string;
  decision_from: string;
  decision_to: string;
  summary: MetricBlock;
  days: DayResult[];
  hours: HourResult[];
}

export interface Meta {
  product: string;
  snapshot_id: string;
  retrieved_at: string;
  decision_from: string;
  decision_to: string;
  delivery_from: string;
  delivery_to: string;
  default_cutoff: string;
  default_strategy: string;
  cutoffs: CutoffInfo[];
  strategies: string[];
  units: string;
  methodology_version: string;
  licence: string;
  licence_url: string;
  scope_note: string;
  alignment_note: string;
  publication_clock_note: string;
  sign_convention: string;
  windfor_rows: number;
  fuelhh_rows: number;
}
