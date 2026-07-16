import { GridRow, MeasureData } from '../types';

const VALUE_KEYS = [
  'year',
  'q1',
  'q2',
  'q3',
  'q4',
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

function zeroValues(): GridRow['values'] {
  const v = {} as GridRow['values'];
  for (const k of VALUE_KEYS) (v as Record<string, number>)[k] = 0;
  return v;
}

function cloneValues(src: GridRow['values']): GridRow['values'] {
  const v = {} as GridRow['values'];
  for (const k of VALUE_KEYS) (v as Record<string, number>)[k] = Number(src[k as keyof GridRow['values']] ?? 0);
  return v;
}

function addValues(a: GridRow['values'], b: GridRow['values']): GridRow['values'] {
  const o = zeroValues();
  for (const k of VALUE_KEYS) {
    (o as Record<string, number>)[k] =
      (a[k as keyof GridRow['values']] as number) + (b[k as keyof GridRow['values']] as number);
  }
  return o;
}

export function subtractValues(a: GridRow['values'], b: GridRow['values']): GridRow['values'] {
  const o = zeroValues();
  for (const k of VALUE_KEYS) {
    const diff =
      (a[k as keyof GridRow['values']] as number) - (b[k as keyof GridRow['values']] as number);
    (o as Record<string, number>)[k] = diff > 0 ? diff : 0;
  }
  return o;
}

/** Sum leaf rows only (no children) to avoid double-counting parent rollups. */
export function sumDeepestLeafValues(row: GridRow): GridRow['values'] {
  if (!row.children?.length) return cloneValues(row.values);
  return row.children.reduce((acc, c) => addValues(acc, sumDeepestLeafValues(c)), zeroValues());
}

export function sumForest(rows: GridRow[]): GridRow['values'] {
  return rows.reduce((acc, r) => addValues(acc, sumDeepestLeafValues(r)), zeroValues());
}

function deepCloneRow(row: GridRow): GridRow {
  return JSON.parse(JSON.stringify(row)) as GridRow;
}

function filteredOutLabelForType(t: GridRow['type'], n: number): string | null {
  if (n <= 0) return null;
  if (t === 'account' || t === 'category' || t === 'product') {
    return `Filtered out (${n})`;
  }
  return null;
}

function makeFilteredOutRow(
  id: string,
  name: string,
  parentId: string | null,
  level: number,
  values: GridRow['values'],
  dimension: 'account' | 'category' | 'product',
): GridRow {
  return {
    id,
    name,
    parentId,
    level,
    type: 'filterSummary',
    filterSummaryRole: 'filteredOut',
    filteredOutDimension: dimension,
    values,
    children: undefined,
  };
}

/**
 * Merge filtered direct children (visible) with a single aggregate row for anything
 * present in unfiltered but removed by the filter. Matching rows stay at this level (no wrapper).
 */
function injectMerge(
  unfKids: GridRow[],
  filKids: GridRow[],
  parentRowId: string,
  measureId: string,
): GridRow[] {
  if (unfKids.length === 0) {
    return filKids.map(f => augmentFilteredSubtree(f, measureId));
  }

  const filSet = new Set(filKids.map(f => f.id));
  const unfById = new Map(unfKids.map(u => [u.id, u]));

  const result: GridRow[] = filKids.map(fk => {
    const u = unfById.get(fk.id);
    if (!u) return augmentFilteredSubtree(fk, measureId);
    return augmentMergePair(u, fk, measureId);
  });

  const excluded = unfKids.filter(u => !filSet.has(u.id));
  if (excluded.length > 0) {
    const dim = excluded[0].type;
    const label = filteredOutLabelForType(dim, excluded.length);
    if (label && (dim === 'account' || dim === 'category' || dim === 'product')) {
      const sum = sumForest(excluded);
      const level = excluded[0].level ?? 1;
      const parentId = excluded[0].parentId ?? parentRowId;
      const id = `fo-${dim}-${parentRowId}-${measureId}`.replace(/\s+/g, '-');
      result.push(makeFilteredOutRow(id, label, parentId, level, sum, dim));
    }
  }

  return result;
}

function augmentMergePair(unf: GridRow, fil: GridRow, measureId: string): GridRow {
  const unfC = unf.children;
  if (!unfC?.length) {
    return { ...fil };
  }
  const filC = fil.children ?? [];
  const newChildren = injectMerge(unfC, filC, fil.id, measureId);
  return { ...fil, children: newChildren };
}

function augmentFilteredSubtree(fil: GridRow, measureId: string): GridRow {
  if (!fil.children?.length) return { ...fil };
  const unf = deepCloneRow(fil);
  const newChildren = injectMerge(unf.children ?? [], fil.children, fil.id, measureId);
  return { ...fil, children: newChildren };
}

function augmentMeasure(unf: MeasureData, fil: MeasureData): MeasureData {
  const unfC = unf.children ?? [];
  const filC = fil.children ?? [];
  if (unfC.length === 0) {
    return { ...fil, children: filC.map(c => augmentFilteredSubtree(c, fil.id)) };
  }
  const newChildren = injectMerge(unfC, filC, fil.id, fil.id);
  return { ...fil, children: newChildren };
}

type Dim = 'account' | 'category' | 'product';

function isDim(t: string): t is Dim {
  return t === 'account' || t === 'category' || t === 'product';
}

/**
 * Column filters: siblings that fail the filter are not removed from the UI — they are rolled into
 * the same synthetic "Filtered out (N)" rows used for global (panel) hierarchy filters, merging
 * counts/values into an existing FO row when present or appending a new one (ids use `-cf` suffix).
 * `mappedChildren[i]` is the result of filterRowTree(originalChildren[i]) or null when excluded.
 */
function bumpSubtreeLevels(row: GridRow, delta: number): GridRow {
  return {
    ...row,
    level: (row.level ?? 0) + delta,
    children: row.children?.map(c => bumpSubtreeLevels(c, delta)),
  };
}

/**
 * When dimension column filters (multi-condition) are active: under each parent with dimension
 * children, show "Matches filter" / "Does not match filter" bucket rows (single pair per parent;
 * combined AND semantics come from `mappedChildren`). Omits the fail bucket when empty.
 * Falls back to {@link mergeColumnFilteredSiblingsIntoTree} when this parent has no dimension children.
 */
export function mergeColumnFilteredIntoPassFailBuckets(
  parentRow: GridRow,
  originalChildren: GridRow[],
  mappedChildren: (GridRow | null)[],
  measureId: string,
): GridRow[] {
  const hasDimChild = originalChildren.some(c => isDim(c.type));
  if (!hasDimChild) {
    return mergeColumnFilteredSiblingsIntoTree(parentRow, originalChildren, mappedChildren, measureId);
  }

  const pass: GridRow[] = [];
  const fail: GridRow[] = [];

  for (let i = 0; i < originalChildren.length; i++) {
    const c = originalChildren[i];
    const fc = mappedChildren[i];
    if (c.type === 'filterSummary') {
      if (fc) pass.push(fc);
      continue;
    }
    if (fc !== null) {
      pass.push(fc);
      continue;
    }
    if (isDim(c.type)) {
      fail.push(deepCloneRow(c));
    }
  }

  const childLevel =
    originalChildren.length > 0 ? originalChildren[0].level ?? (parentRow.level ?? 0) + 1 : (parentRow.level ?? 0) + 1;

  const out: GridRow[] = [];

  if (pass.length > 0) {
    const matchChildren = pass.map(r => bumpSubtreeLevels(r, 1));
    const id = `fb-match-${parentRow.id}-${measureId}`.replace(/\s+/g, '-');
    out.push({
      id,
      name: 'Matches filter',
      parentId: parentRow.id,
      level: childLevel,
      type: 'filterSummary',
      filterSummaryRole: 'filterBucketMatch',
      values: sumForest(matchChildren),
      children: matchChildren,
    });
  }

  if (fail.length > 0) {
    const failChildren = fail.map(r => bumpSubtreeLevels(r, 1));
    const id = `fb-nomatch-${parentRow.id}-${measureId}`.replace(/\s+/g, '-');
    out.push({
      id,
      name: 'Does not match filter',
      parentId: parentRow.id,
      level: childLevel,
      type: 'filterSummary',
      filterSummaryRole: 'filterBucketNoMatch',
      values: sumForest(failChildren),
      children: failChildren,
    });
  }

  return out;
}

/**
 * When column filters have already produced "Matches filter" / "Does not match filter" rows under a parent,
 * children are only those synthetic buckets — not raw dimensions. Unwrap to dimension rows (levels un-bumped)
 * so {@link mergeColumnFilteredIntoPassFailBuckets} can partition pass/fail correctly instead of falling back
 * to {@link mergeColumnFilteredSiblingsIntoTree} (which flattens / breaks grouping after edits).
 */
export function unwrapColumnFilterBucketChildren(children: GridRow[]): GridRow[] | null {
  if (!children?.length) return null;
  const allColumnBuckets = children.every(
    c =>
      c.type === 'filterSummary' &&
      (c.filterSummaryRole === 'filterBucketMatch' || c.filterSummaryRole === 'filterBucketNoMatch'),
  );
  if (!allColumnBuckets) return null;
  const out: GridRow[] = [];
  for (const b of children) {
    for (const ch of b.children ?? []) {
      out.push(bumpSubtreeLevels(ch, -1));
    }
  }
  if (out.length === 0) return null;
  return out;
}

export function mergeColumnFilteredSiblingsIntoTree(
  parentRow: GridRow,
  originalChildren: GridRow[],
  mappedChildren: (GridRow | null)[],
  measureId: string,
): GridRow[] {
  const droppedByDim: Record<Dim, GridRow[]> = {
    account: [],
    category: [],
    product: [],
  };
  const survivors: GridRow[] = [];

  for (let i = 0; i < originalChildren.length; i++) {
    const c = originalChildren[i];
    const fc = mappedChildren[i];
    if (c.type === 'filterSummary') {
      if (fc) survivors.push(fc);
      continue;
    }
    if (fc !== null) {
      survivors.push(fc);
      continue;
    }
    if (isDim(c.type)) {
      droppedByDim[c.type].push(c);
    }
  }

  let out = [...survivors];
  const dims: Dim[] = ['account', 'category', 'product'];
  for (const dim of dims) {
    const dropped = droppedByDim[dim];
    if (dropped.length === 0) continue;

    const sumVals = dropped.reduce(
      (acc, r) => addValues(acc, sumDeepestLeafValues(r)),
      zeroValues(),
    );
    const foIdx = out.findIndex(
      r =>
        r.type === 'filterSummary' &&
        r.filterSummaryRole === 'filteredOut' &&
        r.filteredOutDimension === dim,
    );
    if (foIdx >= 0) {
      const fo = out[foIdx];
      const match = /^Filtered out \((\d+)\)$/.exec(fo.name);
      const baseN = match ? parseInt(match[1], 10) : 0;
      out[foIdx] = {
        ...fo,
        name: `Filtered out (${baseN + dropped.length})`,
        values: addValues(cloneValues(fo.values), sumVals),
      };
    } else {
      const parentId = dropped[0].parentId ?? parentRow.id;
      const level = dropped[0].level ?? (parentRow.level ?? 0) + 1;
      const id = `fo-${dim}-${parentRow.id}-${measureId}-cf`.replace(/\s+/g, '-');
      out.push(
        makeFilteredOutRow(
          id,
          `Filtered out (${dropped.length})`,
          parentId,
          level,
          sumVals,
          dim,
        ),
      );
    }
  }
  return out;
}

type TopBottomDim = 'account' | 'category' | 'product';

/**
 * When "preserve hierarchy" is off and Top/Bottom N applies globally: show only rows of `targetDim`
 * that pass `rowPassesFilters`. Non-matching rows are omitted from the tree (measure totals stay full hierarchy).
 */
export function mergeGlobalTopBottomNMeasureChildren(
  measureRow: GridRow,
  targetDim: TopBottomDim,
  rowPassesFilters: (r: GridRow) => boolean,
): { children: GridRow[]; hadHiddenTargets: boolean } {
  const collectOfDimension = (nodes: GridRow[] | undefined): GridRow[] => {
    if (!nodes?.length) return [];
    const out: GridRow[] = [];
    for (const n of nodes) {
      if (n.type === targetDim) out.push(n);
      out.push(...collectOfDimension(n.children));
    }
    return out;
  };

  const allTarget = collectOfDimension(measureRow.children);
  const passing = allTarget.filter(rowPassesFilters);

  /** Same-dimension rows that did not pass the filter (e.g. plants outside Top N), not total tree node count. */
  const excludedCount = Math.max(0, allTarget.length - passing.length);

  // Keep original parentId (and level) so GridRow can resolve ancestor names for the flattened
  // hierarchy subtitle; only the displayed tree is flat under the measure.
  const visible = passing.map(r => ({
    ...deepCloneRow(r),
    children: undefined,
  }));

  return { children: visible, hadHiddenTargets: excludedCount > 0 };
}

export function injectFilterSummaryRows(
  filtered: MeasureData[],
  unfiltered: MeasureData[],
): MeasureData[] {
  const unfMap = new Map(unfiltered.map(m => [m.id, m]));
  return filtered.map(fm => {
    const um = unfMap.get(fm.id);
    if (!um) return fm;
    return augmentMeasure(um, fm);
  });
}

function augmentMergePairBuckets(unf: GridRow, fil: GridRow, measureId: string): GridRow {
  const unfC = unf.children;
  if (!unfC?.length) {
    return { ...fil };
  }
  const filC = fil.children ?? [];
  const newChildren = injectMergeBuckets(unfC, filC, fil.id, measureId);
  return { ...fil, children: newChildren };
}

function augmentFilteredSubtreeBuckets(fil: GridRow, measureId: string): GridRow {
  if (!fil.children?.length) return { ...fil };
  const unf = deepCloneRow(fil);
  const newChildren = injectMergeBuckets(unf.children ?? [], fil.children ?? [], fil.id, measureId);
  return { ...fil, children: newChildren };
}

function augmentMeasureBuckets(unf: MeasureData, fil: MeasureData): MeasureData {
  const unfC = unf.children ?? [];
  const filC = fil.children ?? [];
  if (unfC.length === 0) {
    return { ...fil, children: filC.map(c => augmentFilteredSubtreeBuckets(c, fil.id)) };
  }
  const newChildren = injectMergeBuckets(unfC, filC, fil.id, fil.id);
  return { ...fil, children: newChildren };
}

/**
 * Panel (Basic) filters that narrow the hierarchy: same merge as {@link injectFilterSummaryRows},
 * but excluded dimension siblings become a "Does not match filter" bucket with full row clones
 * (and passing branches under "Matches filter") instead of a single "Filtered out (N)" aggregate.
 */
function injectMergeBuckets(
  unfKids: GridRow[],
  filKids: GridRow[],
  parentRowId: string,
  measureId: string,
): GridRow[] {
  if (unfKids.length === 0) {
    return filKids.map(f => augmentFilteredSubtreeBuckets(f, measureId));
  }

  const filSet = new Set(filKids.map(f => f.id));
  const unfById = new Map(unfKids.map(u => [u.id, u]));

  const pass: GridRow[] = filKids.map(fk => {
    const u = unfById.get(fk.id);
    if (!u) return augmentFilteredSubtreeBuckets(fk, measureId);
    return augmentMergePairBuckets(u, fk, measureId);
  });

  const excluded = unfKids.filter(u => !filSet.has(u.id));
  const dimExcluded = excluded.filter(u => isDim(u.type));
  if (dimExcluded.length === 0) {
    return pass;
  }

  const childLevel =
    pass.length > 0 ? pass[0].level ?? 1 : dimExcluded[0].level ?? 1;

  const out: GridRow[] = [];

  if (pass.length > 0) {
    const matchChildren = pass.map(r => bumpSubtreeLevels(r, 1));
    out.push({
      id: `fb-panel-match-${parentRowId}-${measureId}`.replace(/\s+/g, '-'),
      name: 'Matches filter',
      parentId: parentRowId,
      level: childLevel,
      type: 'filterSummary',
      filterSummaryRole: 'filterBucketMatch',
      values: sumForest(matchChildren),
      children: matchChildren,
    });
  }

  const failChildren = dimExcluded.map(u => bumpSubtreeLevels(deepCloneRow(u), 1));
  out.push({
    id: `fb-panel-nomatch-${parentRowId}-${measureId}`.replace(/\s+/g, '-'),
    name: 'Does not match filter',
    parentId: parentRowId,
    level: childLevel,
    type: 'filterSummary',
    filterSummaryRole: 'filterBucketNoMatch',
    values: sumForest(failChildren),
    children: failChildren,
  });

  return out;
}

/**
 * Recompute "Matches filter" / "Does not match filter" aggregate rows from the current child subtrees
 * (deepest-leaf sum via {@link sumForest}). Keeps bucket cells in sync after child edits or re-merge.
 */
export function refreshPassFailBucketAggregates(measures: MeasureData[]): MeasureData[] {
  const visit = (rows: GridRow[]): GridRow[] =>
    rows.map(row => {
      const children = row.children?.length ? visit(row.children) : row.children;
      let next: GridRow = children !== row.children ? { ...row, children } : { ...row };
      if (
        next.type === 'filterSummary' &&
        (next.filterSummaryRole === 'filterBucketMatch' ||
          next.filterSummaryRole === 'filterBucketNoMatch') &&
        children?.length
      ) {
        next = { ...next, values: sumForest(children) };
      }
      return next;
    });

  return measures.map(m => ({
    ...m,
    children: m.children ? visit(m.children) : m.children,
  }));
}

export function injectPassFailBucketRows(
  filtered: MeasureData[],
  unfiltered: MeasureData[],
): MeasureData[] {
  const unfMap = new Map(unfiltered.map(m => [m.id, m]));
  const merged = filtered.map(fm => {
    const um = unfMap.get(fm.id);
    if (!um) return fm;
    return augmentMeasureBuckets(um, fm);
  });
  return refreshPassFailBucketAggregates(merged);
}

/** True if any measure tree contains a synthetic filter summary (filtered-out or column-filter buckets). */
export function hasFilteredOutSummaryRows(measures: MeasureData[]): boolean {
  const walk = (rows: GridRow[] | undefined): boolean => {
    if (!rows?.length) return false;
    for (const r of rows) {
      if (
        r.type === 'filterSummary' &&
        (r.filterSummaryRole === 'filteredOut' ||
          r.filterSummaryRole === 'filterBucketMatch' ||
          r.filterSummaryRole === 'filterBucketNoMatch')
      ) {
        return true;
      }
      if (walk(r.children)) return true;
    }
    return false;
  };
  return measures.some(m => walk(m.children));
}

/** Remove synthetic filter summary rows for persistence. */
export function stripFilterSummaryRows(measures: MeasureData[]): MeasureData[] {
  return measures.map(m => ({
    ...m,
    children: m.children ? stripGridRows(m.children) : [],
  }));
}

function stripGridRows(children: GridRow[]): GridRow[] {
  return children.flatMap(c => {
    if (c.type === 'filterSummary') {
      // Column/panel pass-fail buckets wrap real rows (+1 level). Promote them when stripping so
      // persistence and parent re-inject keep edited values; dropping the wrapper would delete the subtree.
      if (
        c.filterSummaryRole === 'filterBucketMatch' ||
        c.filterSummaryRole === 'filterBucketNoMatch'
      ) {
        const lifted = (c.children ?? []).map(ch => bumpSubtreeLevels(ch, -1));
        return stripGridRows(lifted);
      }
      return [];
    }
    return [stripGridRowDeep(c)];
  });
}

function stripGridRowDeep(row: GridRow): GridRow {
  if (!row.children?.length) return row;
  return { ...row, children: stripGridRows(row.children) };
}
