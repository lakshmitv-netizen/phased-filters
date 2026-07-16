/** Monday-start weeks overlapping a calendar year; labels for plan start/end pickers. */
export function getWeekOptionsForCalendarYear(yearNum: number): { id: string; label: string; order: number }[] {
  const jan1 = new Date(yearNum, 0, 1, 12, 0, 0, 0);
  const dec31 = new Date(yearNum, 11, 31, 12, 0, 0, 0);
  const dow = jan1.getDay();
  const toMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(jan1);
  monday.setDate(monday.getDate() + toMonday);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const out: { id: string; label: string; order: number }[] = [];
  const cursor = new Date(monday);
  let seq = 1;
  for (let i = 0; i < 54; i++) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd < jan1) {
      cursor.setDate(cursor.getDate() + 7);
      continue;
    }
    if (weekStart > dec31) break;
    out.push({
      id: `${yearNum}-wk-${seq}`,
      label: `Week ${seq} (${fmt(weekStart)} - ${fmt(weekEnd)})`,
      order: seq,
    });
    seq++;
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

export type PlanGranularity = 'weeks' | 'months' | 'quarters';

export function getMonthOptionsForCalendarYear(yearNum: number): { id: string; label: string; order: number }[] {
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return monthNames.map((name, i) => ({
    id: `${yearNum}-m-${i + 1}`,
    label: `${name} ${yearNum}`,
    order: i + 1,
  }));
}

export function getQuarterOptionsForCalendarYear(yearNum: number): { id: string; label: string; order: number }[] {
  return [
    { id: `${yearNum}-q-1`, label: `Q1 ${yearNum} (Jan - Mar)`, order: 1 },
    { id: `${yearNum}-q-2`, label: `Q2 ${yearNum} (Apr - Jun)`, order: 2 },
    { id: `${yearNum}-q-3`, label: `Q3 ${yearNum} (Jul - Sep)`, order: 3 },
    { id: `${yearNum}-q-4`, label: `Q4 ${yearNum} (Oct - Dec)`, order: 4 },
  ];
}

export function getPeriodOptionsForGranularity(
  yearNum: number,
  granularity: PlanGranularity,
): { id: string; label: string; order: number }[] {
  switch (granularity) {
    case 'weeks':
      return getWeekOptionsForCalendarYear(yearNum);
    case 'months':
      return getMonthOptionsForCalendarYear(yearNum);
    case 'quarters':
      return getQuarterOptionsForCalendarYear(yearNum);
    default:
      return [];
  }
}

export function granularitySingularLabel(g: PlanGranularity): string {
  switch (g) {
    case 'weeks':
      return 'week';
    case 'months':
      return 'month';
    case 'quarters':
      return 'quarter';
    default:
      return 'period';
  }
}
