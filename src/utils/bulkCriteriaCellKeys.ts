import type { MeasureData } from '../types';
import { buildHierarchyPath, formatTimePeriod, getMeasureName } from './cellInfoUtils';

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

/** Labels must match `CellDetailsHistoryPanel` time period options (value stored in criteria). */
const TIME_PERIOD_LABELS: { key: string; label: string }[] = [
  { key: 'jan2026', label: 'Jan 2026' },
  { key: 'feb2026', label: 'Feb 2026' },
  { key: 'mar2026', label: 'Mar 2026' },
  { key: 'apr2026', label: 'Apr 2026' },
  { key: 'may2026', label: 'May 2026' },
  { key: 'jun2026', label: 'Jun 2026' },
  { key: 'jul2026', label: 'Jul 2026' },
  { key: 'aug2026', label: 'Aug 2026' },
  { key: 'sep2026', label: 'Sep 2026' },
  { key: 'oct2026', label: 'Oct 2026' },
  { key: 'nov2026', label: 'Nov 2026' },
  { key: 'dec2026', label: 'Dec 2026' },
];

export type BulkAutoCriterionField = 'Account' | 'Category' | 'Product' | 'Measure' | 'Time';

export interface BulkAutoCriterion {
  id: string;
  field: BulkAutoCriterionField;
  operator: string;
  value: string;
  value2: string;
}

function parseTokens(raw: string): string[] {
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function criterionIsActive(c: BulkAutoCriterion): boolean {
  if (c.field === 'Time' && c.operator === 'between') {
    return Boolean(c.value?.trim() && c.value2?.trim());
  }
  return parseTokens(c.value).length > 0;
}

export function hasActiveAutoCriteria(criteria: BulkAutoCriterion[]): boolean {
  return criteria.some(criterionIsActive);
}

function parseHierarchicalValueCellKey(cellKey: string): { rowId: string; monthKey: string } | null {
  for (const mk of PLAN_WIDE_MONTHS) {
    const suffix = `-${mk}`;
    if (cellKey.endsWith(suffix)) {
      return { rowId: cellKey.slice(0, -suffix.length), monthKey: mk };
    }
  }
  return null;
}

function monthOrderIndex(monthKey: string): number {
  return (PLAN_WIDE_MONTHS as readonly string[]).indexOf(monthKey);
}

function cellMatchesCriterion(rowId: string, monthKey: string, data: MeasureData[], c: BulkAutoCriterion): boolean {
  const path = buildHierarchyPath(rowId, data);
  const account = path[0] ?? '';
  const category = path[1] ?? '';
  const product = path[2] ?? '';
  const measureName = getMeasureName(rowId, data);
  const tokens = parseTokens(c.value);

  if (c.field === 'Account') {
    const inSet = tokens.includes(account);
    return c.operator === 'is any of' ? inSet : !inSet;
  }
  if (c.field === 'Category') {
    const inSet = tokens.includes(category);
    return c.operator === 'is any of' ? inSet : !inSet;
  }
  if (c.field === 'Product') {
    const inSet = tokens.includes(product);
    return c.operator === 'is any of' ? inSet : !inSet;
  }
  if (c.field === 'Measure') {
    const inSet = tokens.includes(measureName);
    return c.operator === 'is any of' ? inSet : !inSet;
  }

  const cellLabel = formatTimePeriod(monthKey);
  if (c.operator === 'between') {
    const startKey = TIME_PERIOD_LABELS.find(t => t.label === c.value)?.key;
    const endKey = TIME_PERIOD_LABELS.find(t => t.label === c.value2)?.key;
    if (!startKey || !endKey) return false;
    const i0 = monthOrderIndex(startKey);
    const i1 = monthOrderIndex(endKey);
    const ic = monthOrderIndex(monthKey);
    if (i0 < 0 || i1 < 0 || ic < 0) return false;
    const lo = Math.min(i0, i1);
    const hi = Math.max(i0, i1);
    return ic >= lo && ic <= hi;
  }

  return tokens.includes(cellLabel);
}

/** Filter plan-wide hierarchical month keys using AND semantics across active criteria rows. */
export function filterPlanWideKeysByAutoCriteria(
  planWideKeys: string[],
  data: MeasureData[],
  criteria: BulkAutoCriterion[],
): string[] {
  const active = criteria.filter(criterionIsActive);
  if (active.length === 0) return [];

  return planWideKeys.filter(key => {
    const parsed = parseHierarchicalValueCellKey(key);
    if (!parsed) return false;
    for (const c of active) {
      if (!cellMatchesCriterion(parsed.rowId, parsed.monthKey, data, c)) return false;
    }
    return true;
  });
}
