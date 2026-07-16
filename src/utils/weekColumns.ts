// Week columns for the FY26 planning grid.
// Mirrors the deployed Commercial Planning grid (Parag build): 52 weekly columns
// derived from the monthly values, with compact headers + tooltips handled by the grid.
//
// All builders accept an optional calendar start (startMonth/startYear). With the
// default Gregorian start (Jan 2026) behavior is unchanged; selecting Fiscal/Financial
// calendars shifts the first week and rotates the month→week value distribution so the
// weeks stay consistent with the rotated month columns.

const MONTH_KEYS = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
] as const;

// Weeks attributed to each calendar month for value distribution. Sums to 52.
const WEEKS_PER_MONTH = [5, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4];

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const WEEK_COUNT = 52;

const DEFAULT_START_MONTH = 0; // Jan
const DEFAULT_START_YEAR = 2026;

function normMonth(startMonth: number): number {
  return ((startMonth % 12) + 12) % 12;
}

/** First calendar day of week 1 for the given calendar start. */
function firstWeekStart(startMonth: number, startYear: number): Date {
  return new Date(startYear, normMonth(startMonth), 1);
}

export function weekKey(n: number): `week${number}_2026` {
  return `week${n}_2026`;
}

/** Start/end calendar dates for week N (1-based) relative to the calendar start. */
export function weekRange(
  n: number,
  startMonth: number = DEFAULT_START_MONTH,
  startYear: number = DEFAULT_START_YEAR,
): { start: Date; end: Date } {
  const base = firstWeekStart(startMonth, startYear);
  const start = new Date(base);
  start.setDate(base.getDate() + 7 * (n - 1));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export interface WeekHeader {
  key: `week${number}_2026`;
  granularity: 'week';
  label: string;
  shortLabel: string;
}

/** 52 week headers: full label "Week N (Mon D - Mon D)" + compact "WN(D/M/YY)". */
export function buildWeekHeaders(
  startMonth: number = DEFAULT_START_MONTH,
  startYear: number = DEFAULT_START_YEAR,
): WeekHeader[] {
  const out: WeekHeader[] = [];
  for (let n = 1; n <= WEEK_COUNT; n++) {
    const { start, end } = weekRange(n, startMonth, startYear);
    const label = `Week ${n} (${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} - ${MONTHS_SHORT[end.getMonth()]} ${end.getDate()})`;
    const shortLabel = `W${n}(${start.getDate()}/${start.getMonth() + 1}/${String(start.getFullYear()).slice(-2)})`;
    out.push({ key: weekKey(n), granularity: 'week', label, shortLabel });
  }
  return out;
}

/**
 * Derive week values from monthly values, mutating `values` in place.
 * No-op if week values are already present (so user edits to week cells persist).
 * Distribution follows the calendar's month order starting at `startMonth`.
 */
export function deriveWeekValues(values: Record<string, number>, startMonth: number = DEFAULT_START_MONTH): void {
  if (values[weekKey(1)] !== undefined) return;
  const offset = normMonth(startMonth);
  let w = 1;
  for (let i = 0; i < 12; i++) {
    const monthIdx = (offset + i) % 12;
    const monthVal = values[MONTH_KEYS[monthIdx]] ?? 0;
    const cnt = WEEKS_PER_MONTH[monthIdx];
    const per = cnt > 0 ? monthVal / cnt : 0;
    for (let k = 0; k < cnt && w <= WEEK_COUNT; k++) {
      values[weekKey(w)] = Math.round(per);
      w++;
    }
  }
}

/** Inclusive overlap test: does week N intersect [start, end] (local calendar dates)? */
export function weekOverlapsRange(
  n: number,
  start: Date | null,
  end: Date | null,
  startMonth: number = DEFAULT_START_MONTH,
  startYear: number = DEFAULT_START_YEAR,
): boolean {
  const { start: ws, end: we } = weekRange(n, startMonth, startYear);
  if (start && we < start) return false;
  if (end && ws > end) return false;
  return true;
}
