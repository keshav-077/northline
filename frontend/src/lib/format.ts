const MIN = "2026-01-01";
const MAX = "2026-01-31";

export function shiftDecisionDate(iso: string, delta: number, min = MIN, max = MAX): string {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + delta);
  const value = next.toISOString().slice(0, 10);
  if (value < min || value > max) return iso;
  return value;
}

export function gmtClock(iso: string | null): string {
  if (!iso) return "—";
  const match = iso.match(/T(\d{2}:\d{2})/);
  return match ? `${match[1]} GMT` : "—";
}

export function londonClock(iso: string | null): string {
  if (!iso) return "—";
  const match = iso.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "—";
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function formatMw(value: string | number | null, digits = 1): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return "—";
  return `${new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(numeric)} MW`;
}

export function formatSignedMw(value: string | null): string {
  if (value === null) return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "—";
  const absolute = formatMw(Math.abs(numeric));
  if (numeric > 0) return `+${absolute}`;
  if (numeric < 0) return `−${absolute}`;
  return absolute;
}

export function biasLabel(value: string | null): string {
  if (value === null) return "No scored hours";
  const numeric = Number(value);
  if (numeric > 0) return "Overforecast";
  if (numeric < 0) return "Underforecast";
  return "No bias";
}

export function formatPercent(ratio: string | null): string {
  if (ratio === null) return "—";
  const numeric = Number(ratio) * 100;
  if (Number.isNaN(numeric)) return "—";
  return `${new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)}%`;
}

export function insight(bias: string | null, vintage: string | null, scored: number, cutoff: string): string {
  if (bias === null || vintage === null || scored === 0) {
    return "No hours could be scored for this decision. Missing intervals stay out of the metrics.";
  }
  const direction = Number(bias) > 0 ? "overstated" : Number(bias) < 0 ? "understated" : "matched";
  if (direction === "matched") {
    return `At ${cutoff} GMT the forecast in force was published at ${gmtClock(vintage)}. Mean error across ${scored} hours is zero.`;
  }
  return `At ${cutoff} GMT the forecast in force was published at ${gmtClock(vintage)}. It ${direction} wind by ${formatMw(Math.abs(Number(bias)), 2)} on average across ${scored} hours.`;
}

export function decisionDates(min = MIN, max = MAX): string[] {
  const dates: string[] = [];
  let cursor = min;
  while (cursor <= max && dates.length < 40) {
    dates.push(cursor);
    const next = shiftDecisionDate(cursor, 1, min, max);
    if (next === cursor) break;
    cursor = next;
  }
  return dates;
}

export function dayMonth(iso: string): string {
  return formatDate(iso).replace(/ \d{4}$/, "");
}

export function deliveryStamp(localIso: string): string {
  return `${dayMonth(localIso.slice(0, 10))} ${londonClock(localIso)}`;
}

export function hourIndex(localIso: string): number {
  const match = localIso.match(/T(\d{2}):(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) + Number(match[2]) / 60;
}

export function asNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function formatNumber(value: string | number | null, digits = 2): string {
  const numeric = asNumber(value);
  if (numeric == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(numeric);
}

export function formatSignedNumber(value: string | number | null, digits = 2): string {
  const numeric = asNumber(value);
  if (numeric == null) return "—";
  const absolute = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(numeric));
  if (numeric > 0) return `+${absolute}`;
  if (numeric < 0) return `−${absolute}`;
  return absolute;
}

export function formatFixed(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatFixedSigned(value: number, digits = 2): string {
  const absolute = formatFixed(Math.abs(value), digits);
  if (value > 0) return `+${absolute}`;
  if (value < 0) return `−${absolute}`;
  return absolute;
}
