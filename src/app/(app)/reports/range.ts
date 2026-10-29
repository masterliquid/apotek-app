import { dayInPharmacyTime } from "@/server/counters";
import { DateRangeError, dayRange, type DateRange } from "@/server/dates";

type Params = { from?: string | string[]; to?: string | string[] };

// Reads ?from=&to= (default: today). Returns an error message instead of throwing for bad input.
export function rangeFromParams(params: Params): { from: string; to: string; range: DateRange | null; error?: string } {
  const today = dayInPharmacyTime();
  const from = typeof params.from === "string" && params.from ? params.from : today;
  const to = typeof params.to === "string" && params.to ? params.to : from;
  try {
    return { from, to, range: dayRange(from, to) };
  } catch (error) {
    if (error instanceof DateRangeError) return { from, to, range: null, error: error.message };
    throw error;
  }
}
