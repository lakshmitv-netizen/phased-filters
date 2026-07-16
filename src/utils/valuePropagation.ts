import { MeasureData, GridRow, ParentTotalsRollupMode } from '../types';

type MonthKey = keyof GridRow['values'];

/**
 * Children included when summing or distributing from a parent.
 * `visibleOnly` excludes filtered-out and no-match bucket rows from parent totals.
 * `columnFilterBuckets` normally includes both buckets (match + no match).
 * When `propagateIntoNoMatchRows === false` in bucket mode, exclude the synthetic no-match bucket
 * (same idea as visibleOnly — that branch is scratched out and omitted from parent totals).
 */
export const childrenForParentRollup = (
  children: GridRow[] | undefined,
  mode: ParentTotalsRollupMode | undefined,
  propagateIntoNoMatchRows?: boolean,
): GridRow[] => {
  if (!children?.length) return [];
  if (mode === 'visibleOnly') {
    return children.filter(
      c =>
        !(
          c.type === 'filterSummary' &&
          (c.filterSummaryRole === 'filteredOut' || c.filterSummaryRole === 'filterBucketNoMatch')
        ),
    );
  }
  if (mode === 'columnFilterBuckets' && propagateIntoNoMatchRows === false) {
    return children.filter(
      c => !(c.type === 'filterSummary' && c.filterSummaryRole === 'filterBucketNoMatch'),
    );
  }
  return children;
};

/**
 * Children to sum for a parent's month totals. Match / no-match **bucket** rows must always aggregate
 * every direct child (dimension rows under the bucket). `childrenForParentRollup` is for higher parents
 * (e.g. account excluding the no-match bucket when propagate is off) and must not strip children **inside**
 * the bucket, or the "Does not match filter" row never updates when leaves are edited.
 */
export const rollupChildrenForParentRow = (
  parentRow: GridRow | MeasureData,
  mode: ParentTotalsRollupMode | undefined,
  propagateIntoNoMatchRows?: boolean,
): GridRow[] => {
  const children = parentRow.children;
  if (!children?.length) return [];
  if (
    'type' in parentRow &&
    parentRow.type === 'filterSummary' &&
    (parentRow.filterSummaryRole === 'filterBucketMatch' ||
      parentRow.filterSummaryRole === 'filterBucketNoMatch')
  ) {
    return children;
  }
  return childrenForParentRollup(children, mode, propagateIntoNoMatchRows);
};

/** True if this row is the no-match bucket or a descendant under it (walks parentId chain). */
export const isUnderFilterBucketNoMatchSubtree = (rowId: string, data: MeasureData[]): boolean => {
  let currentId: string | undefined = rowId;
  for (let depth = 0; depth < 200; depth++) {
    if (!currentId) return false;
    const measure = data.find(m => m.id === currentId);
    const row = measure ?? findRowById(currentId, data);
    if (!row) return false;
    if (
      'type' in row &&
      row.type === 'filterSummary' &&
      row.filterSummaryRole === 'filterBucketNoMatch'
    ) {
      return true;
    }
    currentId = ('parentId' in row ? row.parentId : null) ?? undefined;
  }
  return false;
};

/** DFS: every row ID under each `filterBucketNoMatch` node (including the bucket row). */
const collectDescendantIds = (rows: GridRow[], into: Set<string>) => {
  for (const r of rows) {
    into.add(r.id);
    if (r.children?.length) collectDescendantIds(r.children, into);
  }
};

/**
 * All row IDs that belong to a "Does not match filter" bucket subtree (bucket + nested accounts/categories/products).
 * Used for scratch-out styling and edit guards when that branch is excluded from totals.
 */
export const collectFilterBucketNoMatchSubtreeIds = (data: MeasureData[]): Set<string> => {
  const out = new Set<string>();
  const visit = (rows: GridRow[]) => {
    for (const r of rows) {
      if (r.type === 'filterSummary' && r.filterSummaryRole === 'filterBucketNoMatch') {
        out.add(r.id);
        if (r.children?.length) collectDescendantIds(r.children, out);
      }
      if (r.children?.length) visit(r.children);
    }
  };
  for (const m of data) {
    if (m.children?.length) visit(m.children);
  }
  return out;
};

// Flatten the hierarchy to make searching easier
export const flattenHierarchy = (data: MeasureData[]): GridRow[] => {
  const result: GridRow[] = [];
  
  const traverse = (rows: GridRow[]) => {
    for (const row of rows) {
      result.push(row);
      if (row.children) {
        traverse(row.children);
      }
    }
  };
  
  for (const measure of data) {
    traverse(measure.children);
  }
  
  return result;
};

// Find a row by ID
export const findRowById = (rowId: string, data: MeasureData[]): GridRow | null => {
  const allRows = flattenHierarchy(data);
  return allRows.find(row => row.id === rowId) || null;
};

// Find parent row
export const findParentRow = (rowId: string, data: MeasureData[]): GridRow | null => {
  const row = findRowById(rowId, data);
  if (!row || !row.parentId) return null;
  
  // Check if parent is a measure
  const measure = data.find(m => m.id === row.parentId);
  if (measure) return null; // Parent is a measure, no GridRow parent
  
  return findRowById(row.parentId, data);
};

// Get all direct children of a row
export const getChildren = (rowId: string, data: MeasureData[]): GridRow[] => {
  const row = findRowById(rowId, data);
  return row?.children || [];
};

// Get all descendants (children, grandchildren, etc.)
export const getAllDescendants = (rowId: string, data: MeasureData[]): GridRow[] => {
  const result: GridRow[] = [];
  const children = getChildren(rowId, data);
  
  for (const child of children) {
    result.push(child);
    result.push(...getAllDescendants(child.id, data));
  }
  
  return result;
};

// Get all ancestors (parent, grandparent, etc.)
export const getAllAncestors = (rowId: string, data: MeasureData[]): GridRow[] => {
  const result: GridRow[] = [];
  let current = findParentRow(rowId, data);
  
  while (current) {
    result.push(current);
    current = findParentRow(current.id, data);
  }
  
  return result;
};

// Calculate proportional distribution of delta among children
// Excludes locked cells and redistributes their share proportionally among unlockable cells
export const distributeProportionally = (
  delta: number,
  children: GridRow[],
  monthKey: MonthKey,
  lockedCells?: Set<string>
): Map<string, number> => {
  const distribution = new Map<string, number>();
  
  if (children.length === 0) return distribution;
  
  // Filter out locked children
  const unlockableChildren = children.filter(child => {
    const cellKey = `${child.id}-${monthKey}`;
    return !lockedCells?.has(cellKey);
  });
  
  // If all children are locked, return empty distribution
  if (unlockableChildren.length === 0) return distribution;
  
  // Calculate current total from unlockable children only
  const currentTotal = unlockableChildren.reduce((sum, child) => sum + child.values[monthKey], 0);
  
  if (currentTotal === 0) {
    // Equal distribution if all zeros
    const equalDelta = delta / unlockableChildren.length;
    unlockableChildren.forEach(child => distribution.set(child.id, equalDelta));
  } else {
    // Proportional distribution among unlockable children only
    unlockableChildren.forEach(child => {
      const proportion = child.values[monthKey] / currentTotal;
      const childDelta = delta * proportion;
      distribution.set(child.id, childDelta);
    });
  }
  
  return distribution;
};

// Calculate measure value from sum of its children
export const calculateMeasureValue = (
  measureId: string,
  monthKey: MonthKey,
  data: MeasureData[]
): number => {
  const measure = data.find(m => m.id === measureId);
  if (!measure || !measure.children || measure.children.length === 0) {
    return 0;
  }
  
  return measure.children.reduce((sum, child) => sum + child.values[monthKey], 0);
};

// Propagate upward: child → parent → grandparent
// Skips locked ancestors
export const propagateUpward = (
  rowId: string,
  monthKey: MonthKey,
  delta: number,
  data: MeasureData[],
  lockedCells?: Set<string>
): { rowId: string; monthKey: MonthKey; newValue: number }[] => {
  const updates: { rowId: string; monthKey: MonthKey; newValue: number }[] = [];
  const ancestors = getAllAncestors(rowId, data);
  
  for (const ancestor of ancestors) {
    const cellKey = `${ancestor.id}-${monthKey}`;
    // Skip locked ancestors
    if (lockedCells?.has(cellKey)) {
      continue;
    }
    
    const currentValue = ancestor.values[monthKey];
    const newValue = currentValue + delta;
    updates.push({ rowId: ancestor.id, monthKey, newValue });
  }
  
  return updates;
};

// Propagate downward: parent → children → grandchildren
// Excludes locked cells and redistributes their share proportionally
export const propagateDownward = (
  rowId: string,
  monthKey: MonthKey,
  delta: number,
  data: MeasureData[],
  lockedCells?: Set<string>,
  parentRollupMode?: ParentTotalsRollupMode,
  propagateIntoNoMatchRows?: boolean,
): { rowId: string; monthKey: MonthKey; newValue: number }[] => {
  const updates: { rowId: string; monthKey: MonthKey; newValue: number }[] = [];
  const children = childrenForParentRollup(getChildren(rowId, data), parentRollupMode, propagateIntoNoMatchRows);
  
  if (children.length === 0) return updates;
  
  const distribution = distributeProportionally(delta, children, monthKey, lockedCells);
  
  for (const [childId, childDelta] of distribution.entries()) {
    const child = findRowById(childId, data);
    if (!child) continue;
    
    // Double-check: skip if this child is locked (shouldn't happen due to filter, but safety check)
    const cellKey = `${childId}-${monthKey}`;
    if (lockedCells?.has(cellKey)) {
      continue;
    }
    
    const currentValue = child.values[monthKey];
    const newValue = currentValue + childDelta;
    updates.push({ rowId: childId, monthKey, newValue });
    
    // Recursively propagate to grandchildren (pass lockedCells and rollup mode down)
    const grandchildUpdates = propagateDownward(
      childId,
      monthKey,
      childDelta,
      data,
      lockedCells,
      parentRollupMode,
      propagateIntoNoMatchRows,
    );
    updates.push(...grandchildUpdates);
  }
  
  return updates;
};

// Find measure by row ID
export const findMeasureByRowId = (rowId: string, data: MeasureData[]): MeasureData | null => {
  const row = findRowById(rowId, data);
  if (!row) {
    console.log('[findMeasureByRowId] Row not found for:', rowId);
    return null;
  }
  
  console.log('[findMeasureByRowId] Row found:', { id: row.id, name: row.name, parentId: row.parentId });
  
  // Check if parentId is a measure ID (direct parent is measure)
  if (row.parentId) {
    const measure = data.find(m => m.id === row.parentId);
    if (measure) {
      console.log('[findMeasureByRowId] Found measure via direct parentId:', measure.id);
      return measure;
    }
  }
  
  // Traverse up the hierarchy to find measure
  // First check the current row's parentId
  if (row.parentId) {
    const directMeasure = data.find(m => m.id === row.parentId);
    if (directMeasure) {
      console.log('[findMeasureByRowId] Found measure via direct parentId:', directMeasure.id);
      return directMeasure;
    }
  }
  
  // Traverse up the hierarchy
  let current: GridRow | null = row;
  let depth = 0;
  const maxDepth = 10; // Safety limit
  
  while (current && depth < maxDepth) {
    // Get parent row
    const parent = findParentRow(current.id, data);
    
    if (!parent) {
      // No parent found - check if current's parentId is a measure (this handles account rows)
      if (current.parentId) {
        const measure = data.find(m => m.id === current!.parentId);
        if (measure) {
          console.log('[findMeasureByRowId] Found measure when parent is null:', measure.id);
          return measure;
        }
      }
      break;
    }
    
    // Check if parent's parentId is a measure (this handles account rows whose parent is measure)
    if (parent.parentId) {
      const measure = data.find(m => m.id === parent.parentId);
      if (measure) {
        console.log('[findMeasureByRowId] Found measure via parent.parentId:', measure.id);
        return measure;
      }
    }
    
    current = parent;
    depth++;
  }
  
  console.log('[findMeasureByRowId] No measure found after traversal');
  return null;
};

// Get measure ID from row ID
export const getMeasureIdFromRowId = (rowId: string, data: MeasureData[]): string | null => {
  console.log('[getMeasureIdFromRowId] Looking for measure for rowId:', rowId);
  console.log('[getMeasureIdFromRowId] Available measures:', data.map(m => m.id));
  const measure = findMeasureByRowId(rowId, data);
  console.log('[getMeasureIdFromRowId] Found measure:', measure?.id || 'null');
  return measure?.id || null;
};

// Check if a measure is Sales Agreement
export const isSalesAgreementMeasure = (measureId: string): boolean => {
  return measureId === 'measure-sa-qty' || measureId === 'measure-sa-rev';
};

// Check if a measure is Order
export const isOrderMeasure = (measureId: string): boolean => {
  return measureId === 'measure-order-qty' || measureId === 'measure-order-rev';
};

// Get corresponding Order measure ID from Sales Agreement measure ID
export const getCorrespondingOrderMeasureId = (saMeasureId: string): string | null => {
  if (saMeasureId === 'measure-sa-qty') return 'measure-order-qty';
  if (saMeasureId === 'measure-sa-rev') return 'measure-order-rev';
  return null;
};

// Calculate unit price from revenue and quantity
export const calculateUnitPrice = (
  revenueRowId: string,
  quantityRowId: string,
  monthKey: MonthKey,
  data: MeasureData[]
): number | null => {
  const revenueRow = findRowById(revenueRowId, data);
  const quantityRow = findRowById(quantityRowId, data);
  
  if (!revenueRow || !quantityRow) return null;
  
  const revenue = revenueRow.values[monthKey];
  const quantity = quantityRow.values[monthKey];
  
  if (quantity === 0) return null;
  
  return revenue / quantity;
};

// Get corresponding Revenue measure ID from Quantity measure ID
export const getCorrespondingRevenueMeasureId = (quantityMeasureId: string): string | null => {
  if (quantityMeasureId === 'measure-sa-qty') return 'measure-sa-rev';
  if (quantityMeasureId === 'measure-order-qty') return 'measure-order-rev';
  if (quantityMeasureId === 'measure-forecast-qty') return 'measure-forecast-rev';
  return null;
};

// Get corresponding Quantity measure ID from Revenue measure ID
export const getCorrespondingQuantityMeasureId = (revenueMeasureId: string): string | null => {
  if (revenueMeasureId === 'measure-sa-rev') return 'measure-sa-qty';
  if (revenueMeasureId === 'measure-order-rev') return 'measure-order-qty';
  if (revenueMeasureId === 'measure-forecast-rev') return 'measure-forecast-qty';
  return null;
};

// Get corresponding Forecasted measure ID from Sales Agreement measure ID
export const getCorrespondingForecastedMeasureId = (saMeasureId: string): string | null => {
  if (saMeasureId === 'measure-sa-qty') return 'measure-forecast-qty';
  if (saMeasureId === 'measure-sa-rev') return 'measure-forecast-rev';
  return null;
};

// Update cross-measure dependencies
export const updateCrossMeasureDependencies = (
  rowId: string,
  monthKey: MonthKey,
  newValue: number,
  data: MeasureData[],
  originalData?: MeasureData[],
  lockedCells?: Set<string>
): { rowId: string; monthKey: MonthKey; newValue: number }[] => {
  const updates: { rowId: string; monthKey: MonthKey; newValue: number }[] = [];
  
  console.log('[CROSS-MEASURE] Function called:', { rowId, monthKey, newValue, dataLength: data.length });
  
  // Check if rowId is itself a measure ID (measure-level edit)
  const directMeasure = data.find(m => m.id === rowId);
  let measureId: string | null = null;
  let row: GridRow | null = null;
  let path: string[] = [];
  
  if (directMeasure) {
    // This is a measure-level edit
    measureId = rowId;
    console.log('[CROSS-MEASURE] RowId is a measure ID:', measureId);
    // For measure-level edits, path is empty (we'll update all account rows)
    path = [];
  } else {
    // This is a child row edit
    measureId = getMeasureIdFromRowId(rowId, data);
    console.log('[CROSS-MEASURE] measureId from row:', measureId);
    
    if (!measureId) {
      console.log('[CROSS-MEASURE] No measureId found, returning empty');
      return updates;
    }
    
    row = findRowById(rowId, data);
    console.log('[CROSS-MEASURE] Row found:', row ? { name: row.name, id: row.id, parentId: row.parentId } : 'null');
    
    if (!row) {
      console.log('[CROSS-MEASURE] Row not found, returning empty');
      return updates;
    }
    
    // Build hierarchy path (from account to the edited row)
    let current: GridRow | null = row;
    while (current) {
      path.push(current.name);
      current = findParentRow(current.id, data);
    }
    path.reverse(); // Now path[0] = account, path[1] = category (if exists), path[2] = product (if exists)
    
    console.log('[CROSS-MEASURE] Path built:', path);
    
    if (path.length === 0) {
      console.log('[CROSS-MEASURE] Path is empty, returning empty');
      return updates;
    }
  }
  
  // Helper to find row by path in a measure (finds row at same hierarchy level)
  const findRowByPath = (rows: GridRow[], pathIndex: number): GridRow | null => {
    if (pathIndex >= path.length) {
      console.log('[CROSS-MEASURE] findRowByPath: pathIndex >= path.length', { pathIndex, pathLength: path.length });
      return null;
    }
    
    console.log('[CROSS-MEASURE] findRowByPath: searching for', path[pathIndex], 'at index', pathIndex, 'in', rows.length, 'rows');
    
    for (const row of rows) {
      console.log('[CROSS-MEASURE] findRowByPath: checking row', { name: row.name, id: row.id, matches: row.name === path[pathIndex] });
      if (row.name === path[pathIndex]) {
        // If this is the last element in path, we found the target row
        if (pathIndex === path.length - 1) {
          console.log('[CROSS-MEASURE] findRowByPath: found target row', { name: row.name, id: row.id });
          return row;
        }
        // Otherwise, continue searching in children
        if (row.children) {
          const found = findRowByPath(row.children, pathIndex + 1);
          if (found) {
            console.log('[CROSS-MEASURE] findRowByPath: found in children', { name: found.name, id: found.id });
            return found;
          }
        }
      }
    }
    console.log('[CROSS-MEASURE] findRowByPath: not found');
    return null;
  };
  
  // Handle measure-level edits (when rowId is a measure ID)
  if (directMeasure) {
    // For measure-level edits, we need to update all account rows proportionally
    
    // Handle Sales Agreement Revenue changes
    if (measureId === 'measure-sa-rev') {
      // 1. Sales Agreement Revenue → Sales Agreement Quantity (reverse: Qty = Rev / Unit Price)
      const quantityMeasureId = 'measure-sa-qty';
      const quantityMeasure = data.find(m => m.id === quantityMeasureId);
      if (quantityMeasure && directMeasure.children.length > 0 && quantityMeasure.children.length > 0) {
        // Calculate unit price from account level
        const revAccount = directMeasure.children[0];
        const qtyAccount = quantityMeasure.children[0];
        const unitPrice = calculateUnitPrice(revAccount.id, qtyAccount.id, monthKey, data);
        if (unitPrice !== null && unitPrice !== 0) {
          const newQuantity = newValue / unitPrice;
          // Update quantity measure
          updates.push({ rowId: quantityMeasureId, monthKey, newValue: newQuantity });
          const qtyDelta = newQuantity - quantityMeasure.values[monthKey];
          if (qtyDelta !== 0 && quantityMeasure.children.length > 0) {
            const accountDistribution = distributeProportionally(qtyDelta, quantityMeasure.children, monthKey, lockedCells);
            for (const [accountId, accountDelta] of accountDistribution.entries()) {
              const account = quantityMeasure.children.find(c => c.id === accountId);
              if (account) {
                const accountNewValue = account.values[monthKey] + accountDelta;
                updates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
                const accountUpdates = propagateDownward(accountId, monthKey, accountDelta, data, lockedCells);
                updates.push(...accountUpdates);
              }
            }
          }
        }
      }
      
      // 2. Sales Agreement Revenue → Order Revenue (100%)
      const orderRevenueMeasureId = 'measure-order-rev';
      const orderRevenueMeasure = data.find(m => m.id === orderRevenueMeasureId);
      if (orderRevenueMeasure) {
        // Update order revenue measure
        updates.push({ rowId: orderRevenueMeasureId, monthKey, newValue });
        const orderRevDelta = newValue - orderRevenueMeasure.values[monthKey];
        if (orderRevDelta !== 0 && orderRevenueMeasure.children.length > 0) {
          // Distribute to account rows proportionally
          const accountDistribution = distributeProportionally(orderRevDelta, orderRevenueMeasure.children, monthKey, lockedCells);
          for (const [accountId, accountDelta] of accountDistribution.entries()) {
            const account = orderRevenueMeasure.children.find(c => c.id === accountId);
            if (account) {
              const accountNewValue = account.values[monthKey] + accountDelta;
              updates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
              const accountUpdates = propagateDownward(accountId, monthKey, accountDelta, data);
              updates.push(...accountUpdates);
            }
          }
        }
        
        // 2b. Order Revenue → Order Quantity (reverse: Qty = Rev / Unit Price)
        const orderQuantityMeasureId = 'measure-order-qty';
        const orderQuantityMeasure = data.find(m => m.id === orderQuantityMeasureId);
        if (orderQuantityMeasure && orderRevenueMeasure.children.length > 0 && orderQuantityMeasure.children.length > 0) {
          // Calculate unit price from account level
          const orderRevAccount = orderRevenueMeasure.children[0];
          const orderQtyAccount = orderQuantityMeasure.children[0];
          const unitPrice = calculateUnitPrice(orderRevAccount.id, orderQtyAccount.id, monthKey, data);
          if (unitPrice !== null && unitPrice !== 0) {
            const newOrderQuantity = newValue / unitPrice;
            // Update order quantity measure
            updates.push({ rowId: orderQuantityMeasureId, monthKey, newValue: newOrderQuantity });
            const orderQtyDelta = newOrderQuantity - orderQuantityMeasure.values[monthKey];
            if (orderQtyDelta !== 0 && orderQuantityMeasure.children.length > 0) {
              const accountDistribution = distributeProportionally(orderQtyDelta, orderQuantityMeasure.children, monthKey, lockedCells);
              for (const [accountId, accountDelta] of accountDistribution.entries()) {
                const account = orderQuantityMeasure.children.find(c => c.id === accountId);
                if (account) {
                  const accountNewValue = account.values[monthKey] + accountDelta;
                  updates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
                  const accountUpdates = propagateDownward(accountId, monthKey, accountDelta, data, lockedCells);
                  updates.push(...accountUpdates);
                }
              }
            }
          }
        }
      }
      
      // 3. Sales Agreement Revenue → Forecasted Revenue (100%)
      const forecastRevenueMeasureId = 'measure-forecast-rev';
      const forecastRevenueMeasure = data.find(m => m.id === forecastRevenueMeasureId);
      if (forecastRevenueMeasure) {
        // Update forecast revenue measure
        updates.push({ rowId: forecastRevenueMeasureId, monthKey, newValue });
        const forecastRevDelta = newValue - forecastRevenueMeasure.values[monthKey];
        if (forecastRevDelta !== 0 && forecastRevenueMeasure.children.length > 0) {
          // Distribute to account rows proportionally
          const accountDistribution = distributeProportionally(forecastRevDelta, forecastRevenueMeasure.children, monthKey, lockedCells);
          for (const [accountId, accountDelta] of accountDistribution.entries()) {
            const account = forecastRevenueMeasure.children.find(c => c.id === accountId);
            if (account) {
              const accountNewValue = account.values[monthKey] + accountDelta;
              updates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
              const accountUpdates = propagateDownward(accountId, monthKey, accountDelta, data);
              updates.push(...accountUpdates);
            }
          }
        }
        
        // 3b. Forecasted Revenue → Forecasted Quantity (reverse: Qty = Rev / Unit Price)
        const forecastQuantityMeasureId = 'measure-forecast-qty';
        const forecastQuantityMeasure = data.find(m => m.id === forecastQuantityMeasureId);
        if (forecastQuantityMeasure && forecastRevenueMeasure.children.length > 0 && forecastQuantityMeasure.children.length > 0) {
          // Calculate unit price from account level
          const forecastRevAccount = forecastRevenueMeasure.children[0];
          const forecastQtyAccount = forecastQuantityMeasure.children[0];
          const unitPrice = calculateUnitPrice(forecastRevAccount.id, forecastQtyAccount.id, monthKey, data);
          if (unitPrice !== null && unitPrice !== 0) {
            const newForecastQuantity = newValue / unitPrice;
            // Update forecast quantity measure
            updates.push({ rowId: forecastQuantityMeasureId, monthKey, newValue: newForecastQuantity });
            const forecastQtyDelta = newForecastQuantity - forecastQuantityMeasure.values[monthKey];
            if (forecastQtyDelta !== 0 && forecastQuantityMeasure.children.length > 0) {
              const accountDistribution = distributeProportionally(forecastQtyDelta, forecastQuantityMeasure.children, monthKey, lockedCells);
              for (const [accountId, accountDelta] of accountDistribution.entries()) {
                const account = forecastQuantityMeasure.children.find(c => c.id === accountId);
                if (account) {
                  const accountNewValue = account.values[monthKey] + accountDelta;
                  updates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
                  const accountUpdates = propagateDownward(accountId, monthKey, accountDelta, data, lockedCells);
                  updates.push(...accountUpdates);
                }
              }
            }
          }
        }
      }
    }
    
    if (measureId === 'measure-sa-qty') {
      // 1. Sales Agreement Quantity → Sales Agreement Revenue
      const revenueMeasureId = 'measure-sa-rev';
      const revenueMeasure = data.find(m => m.id === revenueMeasureId);
      if (revenueMeasure && directMeasure.children.length > 0) {
        // Calculate unit price from measure totals
        const currentQty = directMeasure.values[monthKey];
        const currentRev = revenueMeasure.values[monthKey];
        if (currentQty !== 0) {
          const unitPrice = currentRev / currentQty;
          const newRevenue = newValue * unitPrice;
          // Update revenue measure
          updates.push({ rowId: revenueMeasureId, monthKey, newValue: newRevenue });
          // Distribute to account rows proportionally
          const revenueDelta = newRevenue - currentRev;
          if (revenueDelta !== 0 && revenueMeasure.children.length > 0) {
            const accountDistribution = distributeProportionally(revenueDelta, revenueMeasure.children, monthKey, lockedCells);
            for (const [accountId, accountDelta] of accountDistribution.entries()) {
              const account = revenueMeasure.children.find(c => c.id === accountId);
              if (account) {
                const accountNewValue = account.values[monthKey] + accountDelta;
                updates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
                const accountUpdates = propagateDownward(accountId, monthKey, accountDelta, data, lockedCells);
                updates.push(...accountUpdates);
              }
            }
          }
        }
      }
      
      // 2. Sales Agreement Quantity → Order Quantity (100%)
      const orderMeasureId = 'measure-order-qty';
      const orderMeasure = data.find(m => m.id === orderMeasureId);
      if (orderMeasure) {
        // Update order measure
        updates.push({ rowId: orderMeasureId, monthKey, newValue });
        const orderDelta = newValue - orderMeasure.values[monthKey];
        if (orderDelta !== 0 && orderMeasure.children.length > 0) {
          // Distribute to account rows proportionally
          const accountDistribution = distributeProportionally(orderDelta, orderMeasure.children, monthKey, lockedCells);
          for (const [accountId, accountDelta] of accountDistribution.entries()) {
            const account = orderMeasure.children.find(c => c.id === accountId);
            if (account) {
              const accountNewValue = account.values[monthKey] + accountDelta;
              updates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
              const accountUpdates = propagateDownward(accountId, monthKey, accountDelta, data);
              updates.push(...accountUpdates);
            }
          }
        }
        
        // 2b. Order Quantity → Order Revenue (via unit price)
        const orderRevenueMeasureId = 'measure-order-rev';
        const orderRevenueMeasure = data.find(m => m.id === orderRevenueMeasureId);
        if (orderRevenueMeasure && orderMeasure.children.length > 0 && orderRevenueMeasure.children.length > 0) {
          // Calculate unit price from account level
          const orderAccount = orderMeasure.children[0];
          const orderRevAccount = orderRevenueMeasure.children[0];
          const unitPrice = calculateUnitPrice(orderRevAccount.id, orderAccount.id, monthKey, data);
          if (unitPrice !== null) {
            const newOrderRevenue = newValue * unitPrice;
            updates.push({ rowId: orderRevenueMeasureId, monthKey, newValue: newOrderRevenue });
            const orderRevDelta = newOrderRevenue - orderRevenueMeasure.values[monthKey];
            if (orderRevDelta !== 0 && orderRevenueMeasure.children.length > 0) {
              const accountDistribution = distributeProportionally(orderRevDelta, orderRevenueMeasure.children, monthKey, lockedCells);
              for (const [accountId, accountDelta] of accountDistribution.entries()) {
                const account = orderRevenueMeasure.children.find(c => c.id === accountId);
                if (account) {
                  const accountNewValue = account.values[monthKey] + accountDelta;
                  updates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
                  const accountUpdates = propagateDownward(accountId, monthKey, accountDelta, data, lockedCells);
                  updates.push(...accountUpdates);
                }
              }
            }
          }
        }
      }
      
      // 3. Sales Agreement Quantity → Forecasted Quantity (100%)
      const forecastMeasureId = 'measure-forecast-qty';
      const forecastMeasure = data.find(m => m.id === forecastMeasureId);
      if (forecastMeasure) {
        // Update forecast measure
        updates.push({ rowId: forecastMeasureId, monthKey, newValue });
        const forecastDelta = newValue - forecastMeasure.values[monthKey];
        if (forecastDelta !== 0 && forecastMeasure.children.length > 0) {
          // Distribute to account rows proportionally
          const accountDistribution = distributeProportionally(forecastDelta, forecastMeasure.children, monthKey, lockedCells);
          for (const [accountId, accountDelta] of accountDistribution.entries()) {
            const account = forecastMeasure.children.find(c => c.id === accountId);
            if (account) {
              const accountNewValue = account.values[monthKey] + accountDelta;
              updates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
              const accountUpdates = propagateDownward(accountId, monthKey, accountDelta, data);
              updates.push(...accountUpdates);
            }
          }
        }
        
        // 3b. Forecasted Quantity → Forecasted Revenue (via unit price)
        const forecastRevenueMeasureId = 'measure-forecast-rev';
        const forecastRevenueMeasure = data.find(m => m.id === forecastRevenueMeasureId);
        if (forecastRevenueMeasure && forecastMeasure.children.length > 0 && forecastRevenueMeasure.children.length > 0) {
          // Calculate unit price from account level
          const forecastAccount = forecastMeasure.children[0];
          const forecastRevAccount = forecastRevenueMeasure.children[0];
          const unitPrice = calculateUnitPrice(forecastRevAccount.id, forecastAccount.id, monthKey, data);
          if (unitPrice !== null) {
            const newForecastRevenue = newValue * unitPrice;
            updates.push({ rowId: forecastRevenueMeasureId, monthKey, newValue: newForecastRevenue });
            const forecastRevDelta = newForecastRevenue - forecastRevenueMeasure.values[monthKey];
            if (forecastRevDelta !== 0 && forecastRevenueMeasure.children.length > 0) {
              const accountDistribution = distributeProportionally(forecastRevDelta, forecastRevenueMeasure.children, monthKey, lockedCells);
              for (const [accountId, accountDelta] of accountDistribution.entries()) {
                const account = forecastRevenueMeasure.children.find(c => c.id === accountId);
                if (account) {
                  const accountNewValue = account.values[monthKey] + accountDelta;
                  updates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
                  const accountUpdates = propagateDownward(accountId, monthKey, accountDelta, data, lockedCells);
                  updates.push(...accountUpdates);
                }
              }
            }
          }
        }
      }
    }
    
    return updates; // Return early for measure-level edits
  }
  
  // Handle child row edits (when rowId is a child row, not a measure)


  // Handle Sales Agreement Revenue changes
  if (measureId === 'measure-sa-rev') {
    // 1. Sales Agreement Revenue → Sales Agreement Quantity (reverse: Qty = Rev / Unit Price)
    const quantityMeasureId = 'measure-sa-qty';
    const quantityMeasure = data.find(m => m.id === quantityMeasureId);
    if (quantityMeasure && path.length > 0 && row) {
      // Find the corresponding row at the same hierarchy level
      const quantityRow = findRowByPath(quantityMeasure.children, 0);
      if (quantityRow) {
        const unitPrice = calculateUnitPrice(rowId, quantityRow.id, monthKey, data);
        if (unitPrice !== null && unitPrice !== 0) {
          const newQuantity = newValue / unitPrice;
          updates.push({ rowId: quantityRow.id, monthKey, newValue: newQuantity });
          const qtyDelta = newQuantity - quantityRow.values[monthKey];
          if (qtyDelta !== 0) {
            updates.push(...propagateUpward(quantityRow.id, monthKey, qtyDelta, data, lockedCells));
            updates.push(...propagateDownward(quantityRow.id, monthKey, qtyDelta, data, lockedCells));
          }
        }
      }
    }
    
    // 2. Sales Agreement Revenue → Order Revenue (100%)
    const orderRevenueMeasureId = 'measure-order-rev';
    const orderRevenueMeasure = data.find(m => m.id === orderRevenueMeasureId);
    if (orderRevenueMeasure && path.length > 0 && row) {
      // Find the corresponding row at the same hierarchy level
      const orderRevenueRow = findRowByPath(orderRevenueMeasure.children, 0);
      if (orderRevenueRow) {
        updates.push({ rowId: orderRevenueRow.id, monthKey, newValue });
        const orderRevDelta = newValue - orderRevenueRow.values[monthKey];
        if (orderRevDelta !== 0) {
          updates.push(...propagateUpward(orderRevenueRow.id, monthKey, orderRevDelta, data, lockedCells));
          updates.push(...propagateDownward(orderRevenueRow.id, monthKey, orderRevDelta, data, lockedCells));
        }
        
        // 2b. Order Revenue → Order Quantity (reverse: Qty = Rev / Unit Price)
        const orderQuantityMeasureId = 'measure-order-qty';
        const orderQuantityMeasure = data.find(m => m.id === orderQuantityMeasureId);
        if (orderQuantityMeasure && path.length > 0) {
          const orderQuantityRow = findRowByPath(orderQuantityMeasure.children, 0);
          if (orderQuantityRow) {
            const unitPrice = calculateUnitPrice(orderRevenueRow.id, orderQuantityRow.id, monthKey, data);
            if (unitPrice !== null && unitPrice !== 0) {
              const newOrderQuantity = newValue / unitPrice;
              updates.push({ rowId: orderQuantityRow.id, monthKey, newValue: newOrderQuantity });
              const orderQtyDelta = newOrderQuantity - orderQuantityRow.values[monthKey];
              if (orderQtyDelta !== 0) {
                updates.push(...propagateUpward(orderQuantityRow.id, monthKey, orderQtyDelta, data, lockedCells));
                updates.push(...propagateDownward(orderQuantityRow.id, monthKey, orderQtyDelta, data, lockedCells));
              }
            }
          }
        }
      }
    }
    
    // 3. Sales Agreement Revenue → Forecasted Revenue (100%)
    const forecastRevenueMeasureId = 'measure-forecast-rev';
    const forecastRevenueMeasure = data.find(m => m.id === forecastRevenueMeasureId);
    if (forecastRevenueMeasure && path.length > 0 && row) {
      // Find the corresponding row at the same hierarchy level
      const forecastRevenueRow = findRowByPath(forecastRevenueMeasure.children, 0);
      if (forecastRevenueRow) {
        updates.push({ rowId: forecastRevenueRow.id, monthKey, newValue });
        const forecastRevDelta = newValue - forecastRevenueRow.values[monthKey];
        if (forecastRevDelta !== 0) {
          updates.push(...propagateUpward(forecastRevenueRow.id, monthKey, forecastRevDelta, data, lockedCells));
          updates.push(...propagateDownward(forecastRevenueRow.id, monthKey, forecastRevDelta, data, lockedCells));
        }
        
        // 3b. Forecasted Revenue → Forecasted Quantity (reverse: Qty = Rev / Unit Price)
        const forecastQuantityMeasureId = 'measure-forecast-qty';
        const forecastQuantityMeasure = data.find(m => m.id === forecastQuantityMeasureId);
        if (forecastQuantityMeasure && path.length > 0) {
          const forecastQuantityRow = findRowByPath(forecastQuantityMeasure.children, 0);
          if (forecastQuantityRow) {
            const unitPrice = calculateUnitPrice(forecastRevenueRow.id, forecastQuantityRow.id, monthKey, data);
            if (unitPrice !== null && unitPrice !== 0) {
              const newForecastQuantity = newValue / unitPrice;
              updates.push({ rowId: forecastQuantityRow.id, monthKey, newValue: newForecastQuantity });
              const forecastQtyDelta = newForecastQuantity - forecastQuantityRow.values[monthKey];
              if (forecastQtyDelta !== 0) {
                updates.push(...propagateUpward(forecastQuantityRow.id, monthKey, forecastQtyDelta, data, lockedCells));
                updates.push(...propagateDownward(forecastQuantityRow.id, monthKey, forecastQtyDelta, data, lockedCells));
              }
            }
          }
        }
      }
    }
  }
  
  // 1. Sales Agreement Quantity → Sales Agreement Revenue (via unit price)
  if (measureId === 'measure-sa-qty') {
    console.log('[CROSS-MEASURE] Processing SA Qty → SA Rev');
    const revenueMeasureId = 'measure-sa-rev';
    const revenueMeasure = data.find(m => m.id === revenueMeasureId);
    console.log('[CROSS-MEASURE] SA Revenue measure found:', !!revenueMeasure, 'path length:', path.length, 'row:', !!row);
    if (revenueMeasure && path.length > 0 && row) {
      // Find the corresponding row at the same hierarchy level
      const revenueRow = findRowByPath(revenueMeasure.children, 0);
      console.log('[CROSS-MEASURE] SA Revenue row found:', revenueRow ? { name: revenueRow.name, id: revenueRow.id } : 'null');
      if (revenueRow) {
        // Calculate unit price from ORIGINAL values (before edit) for accurate calculation
        // IMPORTANT: Unit price should be consistent across all hierarchy levels for the same measure
        // We prioritize measure-level totals as they represent the overall relationship
        let unitPrice: number | null = null;
        
        // Strategy 1: ALWAYS try measure-level totals first (most reliable and consistent)
        // Use originalData if available to get pre-edit values
        const qtyMeasure = originalData ? originalData.find(m => m.id === 'measure-sa-qty') : data.find(m => m.id === 'measure-sa-qty');
        const revMeasure = originalData ? originalData.find(m => m.id === 'measure-sa-rev') : data.find(m => m.id === 'measure-sa-rev');
        if (qtyMeasure && revMeasure && qtyMeasure.values[monthKey] !== 0) {
          // Calculate unit price from measure totals
          // Even if revenue is 0, we can still calculate unit price if we have a fallback
          unitPrice = revMeasure.values[monthKey] / qtyMeasure.values[monthKey];
          console.log('[CROSS-MEASURE] Unit price from measure totals:', unitPrice, 'rev:', revMeasure.values[monthKey], 'qty:', qtyMeasure.values[monthKey]);
          
          // If measure-level unit price is invalid (NaN, Infinity, or zero), try other strategies
          if (!isFinite(unitPrice) || isNaN(unitPrice) || unitPrice === 0) {
            unitPrice = null; // Reset to try other strategies
          }
        }
        
        // Strategy 2: If measure-level failed, try account-level from original data
        // This maintains consistency at account level
        if ((unitPrice === null || !isFinite(unitPrice) || isNaN(unitPrice)) && originalData) {
          const qtyMeasureForSearch = originalData.find(m => m.id === 'measure-sa-qty');
          const revMeasureForSearch = originalData.find(m => m.id === 'measure-sa-rev');
          if (qtyMeasureForSearch && revMeasureForSearch && qtyMeasureForSearch.children && qtyMeasureForSearch.children.length > 0) {
            // Try first account
            const qtyAccount = qtyMeasureForSearch.children[0];
            const revAccount = revMeasureForSearch.children[0];
            if (qtyAccount && revAccount && qtyAccount.values[monthKey] !== 0 && revAccount.values[monthKey] !== 0) {
              unitPrice = revAccount.values[monthKey] / qtyAccount.values[monthKey];
              console.log('[CROSS-MEASURE] Unit price from account-level values:', unitPrice, 'rev:', revAccount.values[monthKey], 'qty:', qtyAccount.values[monthKey]);
            }
          }
        }
        
        // Strategy 3: If still null, try original row-level values
        if ((unitPrice === null || !isFinite(unitPrice) || isNaN(unitPrice)) && originalData) {
          const originalRow = findRowById(rowId, originalData);
          const originalRevenueRow = findRowById(revenueRow.id, originalData);
          if (originalRow && originalRevenueRow) {
            const oldQuantity = originalRow.values[monthKey];
            const oldRevenue = originalRevenueRow.values[monthKey];
            if (oldQuantity !== 0 && oldRevenue !== 0) {
              unitPrice = oldRevenue / oldQuantity;
              console.log('[CROSS-MEASURE] Unit price from original row values:', unitPrice, 'rev:', oldRevenue, 'qty:', oldQuantity);
            }
          }
        }
        
        // Strategy 4: Final fallback - use default unit price (100) if all else fails
        // This ensures revenue can be calculated even if initial data is zero
        // Default is based on mock data ratio (80000/800 = 100)
        if (unitPrice === null || !isFinite(unitPrice) || isNaN(unitPrice) || unitPrice === 0) {
          unitPrice = 100;
          console.log('[CROSS-MEASURE] Using default unit price:', unitPrice);
        }
        
        console.log('[CROSS-MEASURE] Final unit price for SA:', unitPrice, 'newQty:', newValue);
        
        // CRITICAL: If quantity is zero, revenue must be zero (regardless of unit price)
        let newRevenue: number;
        if (newValue === 0) {
          newRevenue = 0;
          console.log('[CROSS-MEASURE] Quantity is zero, setting revenue to zero');
        } else if (unitPrice !== null && !isNaN(unitPrice) && isFinite(unitPrice) && unitPrice > 0) {
          newRevenue = newValue * unitPrice;
          console.log('[CROSS-MEASURE] New SA Revenue:', newRevenue);
        } else {
          console.log('[CROSS-MEASURE] Unit price is still invalid for SA Revenue, using default calculation');
          // Even if unit price is invalid, calculate revenue using default
          const defaultUnitPrice = 100;
          newRevenue = newValue * defaultUnitPrice;
        }
        
        updates.push({ rowId: revenueRow.id, monthKey, newValue: newRevenue });
        const revenueDelta = newRevenue - revenueRow.values[monthKey];
        if (revenueDelta !== 0) {
          updates.push(...propagateUpward(revenueRow.id, monthKey, revenueDelta, data, lockedCells));
          updates.push(...propagateDownward(revenueRow.id, monthKey, revenueDelta, data, lockedCells));
        }
      } else {
        console.log('[CROSS-MEASURE] SA Revenue row not found for path:', path);
        // Fallback: If row not found by path, try to use account-level row
        if (revenueMeasure && revenueMeasure.children && revenueMeasure.children.length > 0) {
          const accountRow = revenueMeasure.children[0];
          console.log('[CROSS-MEASURE] Using account-level row as fallback:', accountRow.name);
          
          // Calculate unit price using same strategies
          let unitPrice: number | null = null;
          
          // Strategy 1: Measure-level totals
          const qtyMeasure = originalData ? originalData.find(m => m.id === 'measure-sa-qty') : data.find(m => m.id === 'measure-sa-qty');
          const revMeasure = originalData ? originalData.find(m => m.id === 'measure-sa-rev') : data.find(m => m.id === 'measure-sa-rev');
          if (qtyMeasure && revMeasure && qtyMeasure.values[monthKey] !== 0 && revMeasure.values[monthKey] !== 0) {
            unitPrice = revMeasure.values[monthKey] / qtyMeasure.values[monthKey];
          }
          
          // Strategy 2: Account-level values from original data
          if ((unitPrice === null || unitPrice === 0 || !isFinite(unitPrice)) && originalData) {
            const qtyAccount = originalData.find(m => m.id === 'measure-sa-qty')?.children?.[0];
            const revAccount = originalData.find(m => m.id === 'measure-sa-rev')?.children?.[0];
            if (qtyAccount && revAccount && qtyAccount.values[monthKey] !== 0 && revAccount.values[monthKey] !== 0) {
              unitPrice = revAccount.values[monthKey] / qtyAccount.values[monthKey];
            }
          }
          
          // Strategy 3: Default unit price
          if (unitPrice === null || unitPrice === 0 || !isFinite(unitPrice) || isNaN(unitPrice)) {
            unitPrice = 100;
          }
          
          // CRITICAL: If quantity is zero, revenue must be zero (regardless of unit price)
          let newRevenue: number;
          if (newValue === 0) {
            newRevenue = 0;
          } else if (unitPrice !== null && !isNaN(unitPrice) && isFinite(unitPrice) && unitPrice > 0) {
            newRevenue = newValue * unitPrice;
          } else {
            newRevenue = 0; // Fallback to zero if unit price is invalid
          }
          
          updates.push({ rowId: accountRow.id, monthKey, newValue: newRevenue });
          const revenueDelta = newRevenue - accountRow.values[monthKey];
          if (revenueDelta !== 0) {
            updates.push(...propagateUpward(accountRow.id, monthKey, revenueDelta, data, lockedCells));
            updates.push(...propagateDownward(accountRow.id, monthKey, revenueDelta, data, lockedCells));
          }
        }
      }
    } else {
      console.log('[CROSS-MEASURE] Conditions not met for SA Revenue update:', { 
        hasRevenueMeasure: !!revenueMeasure, 
        pathLength: path.length, 
        hasRow: !!row 
      });
      // Even if conditions aren't met, try to update at measure level if possible
      if (revenueMeasure && !directMeasure) {
        // Try to update the measure total directly
        const qtyMeasure = originalData ? originalData.find(m => m.id === 'measure-sa-qty') : data.find(m => m.id === 'measure-sa-qty');
        const revMeasure = originalData ? originalData.find(m => m.id === 'measure-sa-rev') : data.find(m => m.id === 'measure-sa-rev');
        let unitPrice: number | null = null;
        
        if (qtyMeasure && revMeasure && qtyMeasure.values[monthKey] !== 0 && revMeasure.values[monthKey] !== 0) {
          unitPrice = revMeasure.values[monthKey] / qtyMeasure.values[monthKey];
        }
        
        if (unitPrice === null || unitPrice === 0 || !isFinite(unitPrice) || isNaN(unitPrice)) {
          unitPrice = 100;
        }
        
        // CRITICAL: If quantity is zero, revenue must be zero (regardless of unit price)
        let newRevenue: number;
        if (newValue === 0) {
          newRevenue = 0;
        } else if (unitPrice !== null && !isNaN(unitPrice) && isFinite(unitPrice) && unitPrice > 0) {
          newRevenue = newValue * unitPrice;
        } else {
          newRevenue = 0; // Fallback to zero if unit price is invalid
        }
        
        // Update measure total
        updates.push({ rowId: revenueMeasure.id, monthKey, newValue: newRevenue });
        // Distribute to account rows proportionally
        if (revenueMeasure.children && revenueMeasure.children.length > 0) {
          const revenueDelta = newRevenue - revenueMeasure.values[monthKey];
          if (revenueDelta !== 0) {
            const accountDistribution = distributeProportionally(revenueDelta, revenueMeasure.children, monthKey, lockedCells);
            for (const [accountId, accountDelta] of accountDistribution.entries()) {
              const account = revenueMeasure.children.find(c => c.id === accountId);
              if (account) {
                const accountNewValue = account.values[monthKey] + accountDelta;
                updates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
                updates.push(...propagateDownward(accountId, monthKey, accountDelta, data, lockedCells));
              }
            }
          }
        }
      }
    }
  }
  
  // 2. Sales Agreement Quantity → Order Quantity (100%)
  if (measureId === 'measure-sa-qty') {
    console.log('[CROSS-MEASURE] Processing SA Qty → Order Qty');
    const orderMeasureId = 'measure-order-qty';
    const orderMeasure = data.find(m => m.id === orderMeasureId);
    console.log('[CROSS-MEASURE] Order Qty measure found:', !!orderMeasure, 'path length:', path.length, 'row:', !!row);
    if (orderMeasure && path.length > 0 && row) {
      // Find the corresponding row at the same hierarchy level
      const orderRow = findRowByPath(orderMeasure.children, 0);
      console.log('[CROSS-MEASURE] Order Qty row found:', orderRow ? { name: orderRow.name, id: orderRow.id } : 'null');
      if (orderRow) {
        updates.push({ rowId: orderRow.id, monthKey, newValue });
        const orderDelta = newValue - orderRow.values[monthKey];
        if (orderDelta !== 0) {
          updates.push(...propagateUpward(orderRow.id, monthKey, orderDelta, data, lockedCells));
          updates.push(...propagateDownward(orderRow.id, monthKey, orderDelta, data, lockedCells));
        }
        
        // 2b. Order Quantity → Order Revenue (via unit price) - triggered by SA Qty change
        const orderRevenueMeasureId = 'measure-order-rev';
        const orderRevenueMeasure = data.find(m => m.id === orderRevenueMeasureId);
        if (orderRevenueMeasure && path.length > 0) {
          const orderRevenueRow = findRowByPath(orderRevenueMeasure.children, 0);
          console.log('[CROSS-MEASURE] Order Rev row found:', orderRevenueRow ? { name: orderRevenueRow.name, id: orderRevenueRow.id } : 'null');
          if (orderRevenueRow) {
            // CRITICAL: If quantity is zero, revenue must be zero (regardless of unit price)
            let newOrderRevenue: number;
            if (newValue === 0) {
              newOrderRevenue = 0;
              console.log('[CROSS-MEASURE] Order Quantity is zero, setting revenue to zero');
            } else {
              // Calculate unit price from ORIGINAL data (before edits) for accurate calculation
              let unitPrice: number | null = null;
              
              // Strategy 1: Try measure-level totals from original data
              if (originalData) {
                const orderQtyMeasure = originalData.find(m => m.id === 'measure-order-qty');
                const orderRevMeasure = originalData.find(m => m.id === 'measure-order-rev');
                if (orderQtyMeasure && orderRevMeasure && orderQtyMeasure.values[monthKey] !== 0) {
                  unitPrice = orderRevMeasure.values[monthKey] / orderQtyMeasure.values[monthKey];
                  console.log('[CROSS-MEASURE] Order unit price from measure totals:', unitPrice);
                }
              }
              
              // Strategy 2: Try account-level from original data
              if ((unitPrice === null || unitPrice === 0 || !isFinite(unitPrice)) && originalData) {
                const orderQtyMeasure = originalData.find(m => m.id === 'measure-order-qty');
                const orderRevMeasure = originalData.find(m => m.id === 'measure-order-rev');
                if (orderQtyMeasure && orderRevMeasure && orderQtyMeasure.children && orderQtyMeasure.children.length > 0) {
                  const qtyAccount = orderQtyMeasure.children[0];
                  const revAccount = orderRevMeasure.children[0];
                  if (qtyAccount && revAccount && qtyAccount.values[monthKey] !== 0 && revAccount.values[monthKey] !== 0) {
                    unitPrice = revAccount.values[monthKey] / qtyAccount.values[monthKey];
                    console.log('[CROSS-MEASURE] Order unit price from account-level:', unitPrice);
                  }
                }
              }
              
              // Strategy 3: Try current data as fallback
              if ((unitPrice === null || unitPrice === 0 || !isFinite(unitPrice))) {
                unitPrice = calculateUnitPrice(orderRevenueRow.id, orderRow.id, monthKey, data);
                console.log('[CROSS-MEASURE] Order unit price from current data:', unitPrice);
              }
              
              // Strategy 4: Default unit price
              if (unitPrice === null || unitPrice === 0 || !isFinite(unitPrice) || isNaN(unitPrice)) {
                unitPrice = 100; // Default unit price
                console.log('[CROSS-MEASURE] Using default unit price for Order:', unitPrice);
              }
              
              if (unitPrice !== null && !isNaN(unitPrice) && isFinite(unitPrice) && unitPrice > 0) {
                newOrderRevenue = newValue * unitPrice;
                console.log('[CROSS-MEASURE] New Order Revenue:', newOrderRevenue);
              } else {
                console.log('[CROSS-MEASURE] Unit price is still invalid for Order Revenue');
                newOrderRevenue = 0;
              }
            }
            
            updates.push({ rowId: orderRevenueRow.id, monthKey, newValue: newOrderRevenue });
            const orderRevDelta = newOrderRevenue - orderRevenueRow.values[monthKey];
            if (orderRevDelta !== 0) {
              updates.push(...propagateUpward(orderRevenueRow.id, monthKey, orderRevDelta, data, lockedCells));
              updates.push(...propagateDownward(orderRevenueRow.id, monthKey, orderRevDelta, data, lockedCells));
            }
          }
        }
      } else {
        console.log('[CROSS-MEASURE] Order Qty row not found for path:', path);
      }
    } else {
      console.log('[CROSS-MEASURE] Conditions not met for Order Qty update:', { 
        hasOrderMeasure: !!orderMeasure, 
        pathLength: path.length, 
        hasRow: !!row 
      });
    }
  }
  
  // 3. Sales Agreement Quantity → Forecasted Quantity (100%)
  if (measureId === 'measure-sa-qty') {
    console.log('[CROSS-MEASURE] Processing SA Qty → Forecasted Qty');
    const forecastMeasureId = 'measure-forecast-qty';
    const forecastMeasure = data.find(m => m.id === forecastMeasureId);
    console.log('[CROSS-MEASURE] Forecasted Qty measure found:', !!forecastMeasure, 'path length:', path.length, 'row:', !!row);
    if (forecastMeasure && path.length > 0 && row) {
      // Find the corresponding row at the same hierarchy level
      const forecastRow = findRowByPath(forecastMeasure.children, 0);
      console.log('[CROSS-MEASURE] Forecasted Qty row found:', forecastRow ? { name: forecastRow.name, id: forecastRow.id } : 'null');
      if (forecastRow) {
        updates.push({ rowId: forecastRow.id, monthKey, newValue });
        const forecastDelta = newValue - forecastRow.values[monthKey];
        if (forecastDelta !== 0) {
          updates.push(...propagateUpward(forecastRow.id, monthKey, forecastDelta, data, lockedCells));
          updates.push(...propagateDownward(forecastRow.id, monthKey, forecastDelta, data, lockedCells));
        }
        
        // 3b. Forecasted Quantity → Forecasted Revenue (via unit price)
        const forecastRevenueMeasureId = 'measure-forecast-rev';
        const forecastRevenueMeasure = data.find(m => m.id === forecastRevenueMeasureId);
        if (forecastRevenueMeasure && path.length > 0) {
          const forecastRevenueRow = findRowByPath(forecastRevenueMeasure.children, 0);
          console.log('[CROSS-MEASURE] Forecasted Rev row found:', forecastRevenueRow ? { name: forecastRevenueRow.name, id: forecastRevenueRow.id } : 'null');
          if (forecastRevenueRow) {
            // Calculate unit price from ORIGINAL values (before edit) for accurate calculation
            let unitPrice: number | null = null;
            
            // Strategy 1: Try measure-level totals from original data
            const forecastQtyMeasure = originalData ? originalData.find(m => m.id === 'measure-forecast-qty') : data.find(m => m.id === 'measure-forecast-qty');
            const forecastRevMeasure = originalData ? originalData.find(m => m.id === 'measure-forecast-rev') : data.find(m => m.id === 'measure-forecast-rev');
            if (forecastQtyMeasure && forecastRevMeasure && forecastQtyMeasure.values[monthKey] !== 0) {
              unitPrice = forecastRevMeasure.values[monthKey] / forecastQtyMeasure.values[monthKey];
              console.log('[CROSS-MEASURE] Forecast unit price from measure totals:', unitPrice);
              
              if (!isFinite(unitPrice) || isNaN(unitPrice) || unitPrice === 0) {
                unitPrice = null;
              }
            }
            
            // Strategy 2: Try account-level from original data
            if ((unitPrice === null || !isFinite(unitPrice) || isNaN(unitPrice)) && originalData) {
              const forecastQtyMeasureForSearch = originalData.find(m => m.id === 'measure-forecast-qty');
              const forecastRevMeasureForSearch = originalData.find(m => m.id === 'measure-forecast-rev');
              if (forecastQtyMeasureForSearch && forecastRevMeasureForSearch && forecastQtyMeasureForSearch.children && forecastQtyMeasureForSearch.children.length > 0) {
                const qtyAccount = forecastQtyMeasureForSearch.children[0];
                const revAccount = forecastRevMeasureForSearch.children[0];
                if (qtyAccount && revAccount && qtyAccount.values[monthKey] !== 0 && revAccount.values[monthKey] !== 0) {
                  unitPrice = revAccount.values[monthKey] / qtyAccount.values[monthKey];
                  console.log('[CROSS-MEASURE] Forecast unit price from account-level:', unitPrice);
                }
              }
            }
            
            // Strategy 3: Try current data as fallback
            if ((unitPrice === null || !isFinite(unitPrice) || isNaN(unitPrice))) {
              unitPrice = calculateUnitPrice(forecastRevenueRow.id, forecastRow.id, monthKey, data);
              console.log('[CROSS-MEASURE] Forecast unit price from current data:', unitPrice);
            }
            
            // Strategy 4: Default unit price
            if (unitPrice === null || !isFinite(unitPrice) || isNaN(unitPrice) || unitPrice === 0) {
              unitPrice = 100; // Default unit price
              console.log('[CROSS-MEASURE] Using default unit price for Forecast:', unitPrice);
            }
            
            // CRITICAL: If quantity is zero, revenue must be zero (regardless of unit price)
            let newForecastRevenue: number;
            if (newValue === 0) {
              newForecastRevenue = 0;
              console.log('[CROSS-MEASURE] Forecast Quantity is zero, setting revenue to zero');
            } else if (unitPrice !== null && !isNaN(unitPrice) && isFinite(unitPrice) && unitPrice > 0) {
              newForecastRevenue = newValue * unitPrice;
              console.log('[CROSS-MEASURE] New Forecast Revenue:', newForecastRevenue);
            } else {
              console.log('[CROSS-MEASURE] Unit price is still invalid for Forecast Revenue');
              newForecastRevenue = 0;
            }
            
            updates.push({ rowId: forecastRevenueRow.id, monthKey, newValue: newForecastRevenue });
            const forecastRevDelta = newForecastRevenue - forecastRevenueRow.values[monthKey];
            if (forecastRevDelta !== 0) {
              updates.push(...propagateUpward(forecastRevenueRow.id, monthKey, forecastRevDelta, data, lockedCells));
              updates.push(...propagateDownward(forecastRevenueRow.id, monthKey, forecastRevDelta, data, lockedCells));
            }
          }
        }
      } else {
        console.log('[CROSS-MEASURE] Forecasted Qty row not found for path:', path);
      }
    } else {
      console.log('[CROSS-MEASURE] Conditions not met for Forecasted Qty update:', { 
        hasForecastMeasure: !!forecastMeasure, 
        pathLength: path.length, 
        hasRow: !!row 
      });
    }
  }
  
  // 4. Order Quantity → Order Revenue (via unit price)
  if (measureId === 'measure-order-qty') {
    console.log('[CROSS-MEASURE] Processing Order Qty → Order Rev');
    const revenueMeasureId = 'measure-order-rev';
    const revenueMeasure = data.find(m => m.id === revenueMeasureId);
    console.log('[CROSS-MEASURE] Order Revenue measure found:', !!revenueMeasure, 'path length:', path.length);
    if (revenueMeasure && path.length > 0 && row) {
      // Find the corresponding row at the same hierarchy level
      const revenueRow = findRowByPath(revenueMeasure.children, 0);
      console.log('[CROSS-MEASURE] Order Revenue row found:', revenueRow ? revenueRow.name : 'null');
      if (revenueRow) {
        // CRITICAL: If quantity is zero, revenue must be zero (regardless of unit price)
        let newRevenue: number;
        if (newValue === 0) {
          newRevenue = 0;
          console.log('[CROSS-MEASURE] Order Quantity is zero, setting revenue to zero');
        } else {
          const unitPrice = calculateUnitPrice(revenueRow.id, rowId, monthKey, data);
          console.log('[CROSS-MEASURE] Unit price for Order:', unitPrice);
          if (unitPrice !== null && unitPrice !== 0) {
            newRevenue = newValue * unitPrice;
            console.log('[CROSS-MEASURE] New Order Revenue:', newRevenue);
          } else {
            console.log('[CROSS-MEASURE] Unit price is null for Order Revenue, cannot calculate');
            return updates; // Skip update if we can't calculate unit price
          }
        }
        
        updates.push({ rowId: revenueRow.id, monthKey, newValue: newRevenue });
        const revenueDelta = newRevenue - revenueRow.values[monthKey];
        if (revenueDelta !== 0) {
          updates.push(...propagateUpward(revenueRow.id, monthKey, revenueDelta, data, lockedCells));
          updates.push(...propagateDownward(revenueRow.id, monthKey, revenueDelta, data, lockedCells));
        }
      }
    }
  }
  
  // 3b. Order Revenue → Order Quantity (reverse: Qty = Rev / Unit Price)
  if (measureId === 'measure-order-rev') {
    const quantityMeasureId = 'measure-order-qty';
    const quantityMeasure = data.find(m => m.id === quantityMeasureId);
    if (quantityMeasure && path.length > 0 && row) {
      // Find the corresponding row at the same hierarchy level
      const quantityRow = findRowByPath(quantityMeasure.children, 0);
      if (quantityRow) {
        const unitPrice = calculateUnitPrice(rowId, quantityRow.id, monthKey, data);
        if (unitPrice !== null && unitPrice !== 0) {
          const newQuantity = newValue / unitPrice;
          updates.push({ rowId: quantityRow.id, monthKey, newValue: newQuantity });
          const qtyDelta = newQuantity - quantityRow.values[monthKey];
          if (qtyDelta !== 0) {
            updates.push(...propagateUpward(quantityRow.id, monthKey, qtyDelta, data, lockedCells));
            updates.push(...propagateDownward(quantityRow.id, monthKey, qtyDelta, data, lockedCells));
          }
        }
      }
    }
  }
  
  // 4. Sales Agreement Quantity → Forecasted Quantity (100%)
  if (measureId === 'measure-sa-qty') {
    console.log('[CROSS-MEASURE] Processing SA Qty → Forecasted Qty');
    const forecastMeasureId = 'measure-forecast-qty';
    const forecastMeasure = data.find(m => m.id === forecastMeasureId);
    console.log('[CROSS-MEASURE] Forecasted Qty measure found:', !!forecastMeasure, 'path length:', path.length, 'row:', !!row);
    if (forecastMeasure && path.length > 0 && row) {
      // Find the corresponding row at the same hierarchy level
      const forecastRow = findRowByPath(forecastMeasure.children, 0);
      console.log('[CROSS-MEASURE] Forecasted Qty row found:', forecastRow ? { name: forecastRow.name, id: forecastRow.id } : 'null');
      if (forecastRow) {
        updates.push({ rowId: forecastRow.id, monthKey, newValue });
        const forecastDelta = newValue - forecastRow.values[monthKey];
        if (forecastDelta !== 0) {
          updates.push(...propagateUpward(forecastRow.id, monthKey, forecastDelta, data, lockedCells));
          updates.push(...propagateDownward(forecastRow.id, monthKey, forecastDelta, data, lockedCells));
        }
        
        // 4b. Forecasted Quantity → Forecasted Revenue (via unit price) - triggered by SA Qty change
        const forecastRevenueMeasureId = 'measure-forecast-rev';
        const forecastRevenueMeasure = data.find(m => m.id === forecastRevenueMeasureId);
        if (forecastRevenueMeasure && path.length > 0) {
          const forecastRevenueRow = findRowByPath(forecastRevenueMeasure.children, 0);
          console.log('[CROSS-MEASURE] Forecasted Rev row found:', forecastRevenueRow ? { name: forecastRevenueRow.name, id: forecastRevenueRow.id } : 'null');
          if (forecastRevenueRow) {
            // CRITICAL: If quantity is zero, revenue must be zero (regardless of unit price)
            let newForecastRevenue: number;
            if (newValue === 0) {
              newForecastRevenue = 0;
              console.log('[CROSS-MEASURE] Forecasted Quantity is zero, setting revenue to zero');
            } else {
              // Calculate unit price from ORIGINAL data (before edits) for accurate calculation
              let unitPrice: number | null = null;
              
              // Strategy 1: Try measure-level totals from original data
              if (originalData) {
                const forecastQtyMeasure = originalData.find(m => m.id === 'measure-forecast-qty');
                const forecastRevMeasure = originalData.find(m => m.id === 'measure-forecast-rev');
                if (forecastQtyMeasure && forecastRevMeasure && forecastQtyMeasure.values[monthKey] !== 0) {
                  unitPrice = forecastRevMeasure.values[monthKey] / forecastQtyMeasure.values[monthKey];
                  console.log('[CROSS-MEASURE] Forecasted unit price from measure totals:', unitPrice);
                }
              }
              
              // Strategy 2: Try account-level from original data
              if ((unitPrice === null || unitPrice === 0 || !isFinite(unitPrice)) && originalData) {
                const forecastQtyMeasure = originalData.find(m => m.id === 'measure-forecast-qty');
                const forecastRevMeasure = originalData.find(m => m.id === 'measure-forecast-rev');
                if (forecastQtyMeasure && forecastRevMeasure && forecastQtyMeasure.children && forecastQtyMeasure.children.length > 0) {
                  const qtyAccount = forecastQtyMeasure.children[0];
                  const revAccount = forecastRevMeasure.children[0];
                  if (qtyAccount && revAccount && qtyAccount.values[monthKey] !== 0 && revAccount.values[monthKey] !== 0) {
                    unitPrice = revAccount.values[monthKey] / qtyAccount.values[monthKey];
                    console.log('[CROSS-MEASURE] Forecasted unit price from account-level:', unitPrice);
                  }
                }
              }
              
              // Strategy 3: Try current data as fallback
              if ((unitPrice === null || unitPrice === 0 || !isFinite(unitPrice))) {
                unitPrice = calculateUnitPrice(forecastRevenueRow.id, forecastRow.id, monthKey, data);
                console.log('[CROSS-MEASURE] Forecasted unit price from current data:', unitPrice);
              }
              
              // Strategy 4: Default unit price
              if (unitPrice === null || unitPrice === 0 || !isFinite(unitPrice) || isNaN(unitPrice)) {
                unitPrice = 100; // Default unit price
                console.log('[CROSS-MEASURE] Using default unit price for Forecasted:', unitPrice);
              }
              
              if (unitPrice !== null && !isNaN(unitPrice) && isFinite(unitPrice) && unitPrice > 0) {
                newForecastRevenue = newValue * unitPrice;
                console.log('[CROSS-MEASURE] New Forecasted Revenue:', newForecastRevenue);
              } else {
                console.log('[CROSS-MEASURE] Unit price is still invalid for Forecasted Revenue');
                newForecastRevenue = 0;
              }
            }
            
            updates.push({ rowId: forecastRevenueRow.id, monthKey, newValue: newForecastRevenue });
            const forecastRevDelta = newForecastRevenue - forecastRevenueRow.values[monthKey];
            if (forecastRevDelta !== 0) {
              updates.push(...propagateUpward(forecastRevenueRow.id, monthKey, forecastRevDelta, data, lockedCells));
              updates.push(...propagateDownward(forecastRevenueRow.id, monthKey, forecastRevDelta, data, lockedCells));
            }
          }
        }
      } else {
        console.log('[CROSS-MEASURE] Forecasted Qty row not found for path:', path);
      }
    } else {
      console.log('[CROSS-MEASURE] Conditions not met for Forecasted Qty update:', { 
        hasForecastMeasure: !!forecastMeasure, 
        pathLength: path.length, 
        hasRow: !!row 
      });
    }
  }
  
  // 5. Forecasted Quantity → Forecasted Revenue (via unit price)
  if (measureId === 'measure-forecast-qty') {
    console.log('[CROSS-MEASURE] Processing Forecasted Qty → Forecasted Rev');
    const revenueMeasureId = 'measure-forecast-rev';
    const revenueMeasure = data.find(m => m.id === revenueMeasureId);
    console.log('[CROSS-MEASURE] Forecasted Revenue measure found:', !!revenueMeasure, 'path length:', path.length);
    if (revenueMeasure && path.length > 0 && row) {
      // Find the corresponding row at the same hierarchy level
      const revenueRow = findRowByPath(revenueMeasure.children, 0);
      console.log('[CROSS-MEASURE] Forecasted Revenue row found:', revenueRow ? revenueRow.name : 'null');
      if (revenueRow) {
        // CRITICAL: If quantity is zero, revenue must be zero (regardless of unit price)
        let newRevenue: number;
        if (newValue === 0) {
          newRevenue = 0;
          console.log('[CROSS-MEASURE] Forecasted Quantity is zero, setting revenue to zero');
        } else {
          const unitPrice = calculateUnitPrice(revenueRow.id, rowId, monthKey, data);
          console.log('[CROSS-MEASURE] Unit price for Forecasted:', unitPrice);
          if (unitPrice !== null && unitPrice !== 0) {
            newRevenue = newValue * unitPrice;
            console.log('[CROSS-MEASURE] New Forecasted Revenue:', newRevenue);
          } else {
            console.log('[CROSS-MEASURE] Unit price is null for Forecasted Revenue, cannot calculate');
            return updates; // Skip update if we can't calculate unit price
          }
        }
        
        updates.push({ rowId: revenueRow.id, monthKey, newValue: newRevenue });
        const revenueDelta = newRevenue - revenueRow.values[monthKey];
        if (revenueDelta !== 0) {
          updates.push(...propagateUpward(revenueRow.id, monthKey, revenueDelta, data, lockedCells));
          updates.push(...propagateDownward(revenueRow.id, monthKey, revenueDelta, data, lockedCells));
        }
      }
    }
  }
  
  // 5b. Forecasted Revenue → Forecasted Quantity (reverse: Qty = Rev / Unit Price)
  if (measureId === 'measure-forecast-rev') {
    const quantityMeasureId = 'measure-forecast-qty';
    const quantityMeasure = data.find(m => m.id === quantityMeasureId);
    if (quantityMeasure && path.length > 0 && row) {
      // Find the corresponding row at the same hierarchy level
      const quantityRow = findRowByPath(quantityMeasure.children, 0);
      if (quantityRow) {
        const unitPrice = calculateUnitPrice(rowId, quantityRow.id, monthKey, data);
        if (unitPrice !== null && unitPrice !== 0) {
          const newQuantity = newValue / unitPrice;
          updates.push({ rowId: quantityRow.id, monthKey, newValue: newQuantity });
          const qtyDelta = newQuantity - quantityRow.values[monthKey];
          if (qtyDelta !== 0) {
            updates.push(...propagateUpward(quantityRow.id, monthKey, qtyDelta, data, lockedCells));
            updates.push(...propagateDownward(quantityRow.id, monthKey, qtyDelta, data, lockedCells));
          }
        }
      }
    }
  }
  
  // Adjustment Measures Dependencies
  // Final Forecast = Average of (Baseline Forecast + Account Manager Adjusted Forecast + Sales Manager Adjusted Forecast + Regional Director Adjusted Forecast)
  const adjustmentMeasureIds = [
    'measure-baseline-forecast',
    'measure-account-manager-adjusted',
    'measure-sales-manager-adjusted',
    'measure-regional-director-adjusted'
  ];
  
  if (measureId && adjustmentMeasureIds.includes(measureId)) {
    console.log('[CROSS-MEASURE] Processing Adjustment Measure dependency:', measureId);
    const finalForecastMeasureId = 'measure-final-forecast';
    const finalForecastMeasure = data.find(m => m.id === finalForecastMeasureId);
    
    if (finalForecastMeasure) {
      // Get all 4 independent measures
      const baselineMeasure = data.find(m => m.id === 'measure-baseline-forecast');
      const accountManagerMeasure = data.find(m => m.id === 'measure-account-manager-adjusted');
      const salesManagerMeasure = data.find(m => m.id === 'measure-sales-manager-adjusted');
      const regionalDirectorMeasure = data.find(m => m.id === 'measure-regional-director-adjusted');
      
      if (baselineMeasure && accountManagerMeasure && salesManagerMeasure && regionalDirectorMeasure) {
        // Calculate average for Final Forecast
        // If editing at measure level, update measure-level value
        if (directMeasure) {
          const baselineValue = baselineMeasure.values[monthKey];
          const accountManagerValue = accountManagerMeasure.values[monthKey];
          const salesManagerValue = salesManagerMeasure.values[monthKey];
          const regionalDirectorValue = regionalDirectorMeasure.values[monthKey];
          
          const averageValue = (baselineValue + accountManagerValue + salesManagerValue + regionalDirectorValue) / 4;
          const finalForecastValue = finalForecastMeasure.values[monthKey];
          
          if (Math.abs(averageValue - finalForecastValue) > 0.01) {
            updates.push({ rowId: finalForecastMeasureId, monthKey, newValue: averageValue });
            const delta = averageValue - finalForecastValue;
            if (Math.abs(delta) > 0.01) {
              updates.push(...propagateUpward(finalForecastMeasureId, monthKey, delta, data, lockedCells));
              updates.push(...propagateDownward(finalForecastMeasureId, monthKey, delta, data, lockedCells));
            }
            console.log('[CROSS-MEASURE] Updated Final Forecast measure-level:', averageValue);
          }
        } 
        // If editing at row level, update corresponding row in Final Forecast at the same hierarchy level
        else if (row && path.length > 0) {
          // Find corresponding rows at the same hierarchy level in each measure
          const finalForecastRow = findRowByPath(finalForecastMeasure.children, 0);
          const baselineRow = findRowByPath(baselineMeasure.children, 0);
          const accountManagerRow = findRowByPath(accountManagerMeasure.children, 0);
          const salesManagerRow = findRowByPath(salesManagerMeasure.children, 0);
          const regionalDirectorRow = findRowByPath(regionalDirectorMeasure.children, 0);
          
          if (finalForecastRow && baselineRow && accountManagerRow && salesManagerRow && regionalDirectorRow) {
            // Recursively update Final Forecast at all hierarchy levels
            const updateFinalForecastRecursive = (
              finalRow: GridRow,
              baselineRow: GridRow,
              accountManagerRow: GridRow,
              salesManagerRow: GridRow,
              regionalDirectorRow: GridRow
            ) => {
              // Calculate average for current level
              const baselineValue = baselineRow.values[monthKey];
              const accountManagerValue = accountManagerRow.values[monthKey];
              const salesManagerValue = salesManagerRow.values[monthKey];
              const regionalDirectorValue = regionalDirectorRow.values[monthKey];
              
              const averageValue = (baselineValue + accountManagerValue + salesManagerValue + regionalDirectorValue) / 4;
              const finalForecastCurrentValue = finalRow.values[monthKey];
              
              if (Math.abs(averageValue - finalForecastCurrentValue) > 0.01) {
                updates.push({ rowId: finalRow.id, monthKey, newValue: averageValue });
                const delta = averageValue - finalForecastCurrentValue;
                if (Math.abs(delta) > 0.01) {
                  updates.push(...propagateUpward(finalRow.id, monthKey, delta, data, lockedCells));
                  updates.push(...propagateDownward(finalRow.id, monthKey, delta, data, lockedCells));
                }
                console.log('[CROSS-MEASURE] Updated Final Forecast at row:', finalRow.name, 'value:', averageValue);
              }
              
              // Recursively update children if they exist
              if (finalRow.children && baselineRow.children && accountManagerRow.children && 
                  salesManagerRow.children && regionalDirectorRow.children) {
                for (let i = 0; i < finalRow.children.length; i++) {
                  const finalChild = finalRow.children[i];
                  const baselineChild = baselineRow.children.find(c => c.name === finalChild.name);
                  const accountManagerChild = accountManagerRow.children.find(c => c.name === finalChild.name);
                  const salesManagerChild = salesManagerRow.children.find(c => c.name === finalChild.name);
                  const regionalDirectorChild = regionalDirectorRow.children.find(c => c.name === finalChild.name);
                  
                  if (baselineChild && accountManagerChild && salesManagerChild && regionalDirectorChild) {
                    updateFinalForecastRecursive(
                      finalChild,
                      baselineChild,
                      accountManagerChild,
                      salesManagerChild,
                      regionalDirectorChild
                    );
                  }
                }
              }
            };
            
            updateFinalForecastRecursive(
              finalForecastRow,
              baselineRow,
              accountManagerRow,
              salesManagerRow,
              regionalDirectorRow
            );
          }
        }
      }
    }
  }
  
  return updates;
};

