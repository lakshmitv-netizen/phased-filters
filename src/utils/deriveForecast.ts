// Derives "Forecasted Quantity" as the element-wise sum of "Sales Agreement
// Quantity" and "Opportunity Quantity" across a measure list. The three measures
// share an identical row hierarchy (same structure, same order) within a dataset,
// so we can zip their trees by position and sum every numeric value key. Because
// each source measure already rolls up bottom-up (aggregates = sum of months),
// summing the raw bags keeps every parent total and aggregate consistent.

import type { MeasureData, GridRow } from '../types';

type ValueBag = GridRow['values'];

const SA_RE = /sales agreement quantity/i;
const OPP_RE = /opportunity quantity/i;
const FORECAST_RE = /forecast(ed)? quantity/i;

function addBags(a: ValueBag, b: ValueBag): ValueBag {
  const out: Record<string, number> = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((k) => {
    out[k] = ((a as Record<string, number>)[k] ?? 0) + ((b as Record<string, number>)[k] ?? 0);
  });
  return out as unknown as ValueBag;
}

/** Rebuild `target`'s tree keeping its ids/names/types but with values = a + b. */
function sumRow(target: GridRow, a: GridRow, b: GridRow): GridRow {
  const values = addBags(a.values, b.values);
  if (target.children && a.children && b.children) {
    const n = Math.min(target.children.length, a.children.length, b.children.length);
    const children = target.children.map((c, i) =>
      i < n ? sumRow(c, a.children![i], b.children![i]) : c,
    );
    return { ...target, values, children };
  }
  return { ...target, values };
}

/**
 * Returns a new measure list where the Forecasted Quantity measure equals
 * Sales Agreement Quantity + Opportunity Quantity. If any of the three measures
 * is missing (e.g. the user didn't select them), the list is returned unchanged.
 */
export function withForecastAsSum(measures: MeasureData[]): MeasureData[] {
  const sa = measures.find((m) => SA_RE.test(m.name));
  const opp = measures.find((m) => OPP_RE.test(m.name));
  const forecast = measures.find((m) => FORECAST_RE.test(m.name));
  if (!sa || !opp || !forecast) return measures;
  if (!sa.children || !opp.children || !forecast.children) return measures;

  const n = Math.min(forecast.children.length, sa.children.length, opp.children.length);
  const children = forecast.children.map((c, i) =>
    i < n ? sumRow(c, sa.children![i], opp.children![i]) : c,
  );
  const values = addBags(sa.values, opp.values);

  return measures.map((m) => (m.id === forecast.id ? { ...m, values, children } : m));
}
