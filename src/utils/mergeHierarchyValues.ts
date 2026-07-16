import type { GridRow, MeasureData } from '../types';

function cloneMeasureData(data: MeasureData[]): MeasureData[] {
  return JSON.parse(JSON.stringify(data)) as MeasureData[];
}

/**
 * Start from the full hierarchy (`full`) and overlay cell `values` from the live grid (`live`).
 * Rows only present in `full` (e.g. categories hidden by the Filters panel) keep their baseline
 * values; rows present in `live` get current numbers (edits, recalculated parents, etc.).
 */
export function mergeRowValuesIntoFullTree(full: MeasureData[], live: MeasureData[]): MeasureData[] {
  const out = cloneMeasureData(full);
  const valueById = new Map<string, GridRow['values']>();

  const collect = (rows: (GridRow | MeasureData)[]) => {
    for (const r of rows) {
      valueById.set(r.id, r.values);
      if (r.children?.length) collect(r.children);
    }
  };
  collect(live);

  const apply = (row: GridRow | MeasureData) => {
    const v = valueById.get(row.id);
    if (v) Object.assign(row.values, v);
    if (row.children?.length) row.children.forEach(apply);
  };
  out.forEach(apply);
  return out;
}
