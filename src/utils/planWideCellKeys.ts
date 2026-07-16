import { GridRow, MeasureData } from '../types';

const PLAN_WIDE_MONTHS = [
  'jan2026',
  'feb2026',
  'mar2026',
  'apr2026',
  'may2026',
  'jun2026',
  'jul2026',
  'aug2026',
  'sep2026',
  'oct2026',
  'nov2026',
  'dec2026',
] as const;

/** All hierarchical month value cells — matches Bulk Action “Request Approval” plan scope. */
export function getPlanWideValueCellKeys(data: MeasureData[]): string[] {
  if (!data.length) return [];
  const keys: string[] = [];
  const walk = (row: GridRow) => {
    for (const mk of PLAN_WIDE_MONTHS) {
      if (row.values && mk in row.values && typeof (row.values as Record<string, number>)[mk] === 'number') {
        keys.push(`${row.id}-${mk}`);
      }
    }
    row.children?.forEach(walk);
  };
  data.forEach((m) => {
    if (m.children?.length) m.children.forEach(walk);
  });
  return keys;
}
