import type { CutoffInfo } from "./types";

export const FALLBACK_CUTOFFS: CutoffInfo[] = [
  {
    id: "09:20",
    local_time: "09:20",
    market: "EPEX SPOT GB 60-minute",
    note: "First binding GB day-ahead gate. In January the 07:30 forecast is the latest file already published.",
  },
  {
    id: "09:50",
    local_time: "09:50",
    market: "Nord Pool N2EX",
    note: "Nord Pool's N2EX page states gate closure at 09:50 GMT. The 09:30 forecast is eligible for this preset only.",
  },
  {
    id: "15:30",
    local_time: "15:30",
    market: "EPEX SPOT GB 30-minute",
    note: "A file stamped exactly 15:30 is treated as available because the rule is publishTime <= cutoff.",
  },
];

export const FALLBACK_NOTES = {
  scope:
    "Decision dates are London calendar days from 1 January through 31 January 2026. Each decision procures the following delivery day, 2 January through 1 February. 1 January delivery is excluded because that auction was on 31 December 2025.",
  alignment:
    "WINDFOR is an hourly MW forecast. FUELHH WIND is the average MW of each half hour. The scored actual is the mean of the two half hours inside the forecast hour. The product does not repeat one forecast across 48 half hours.",
  clock:
    "The BMRS wind page lists eight clocks ending in :30, without a timezone. In this January window the files are stamped one hour earlier: 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30 and 22:30 UTC. On 15 January the 11:30 file is replaced by 12:25 UTC. Selection uses publishTime, not the webpage clock.",
  licence: "Contains BMRS data © Elexon Limited copyright and database right 2026",
  licenceUrl: "https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/",
};
