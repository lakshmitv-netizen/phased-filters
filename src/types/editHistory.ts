/** Synthetic `cellKey` for plan-wide bulk approval rows (no selection → single batch timeline row). */
export const PLAN_WIDE_APPROVAL_BATCH_CELL_KEY = '__plan-wide-approval-batch__';

export interface CellEditHistoryEntry {
  id: string;
  cellKey: string; // `${rowId}-${monthKey}` or `${rowId}-${measureId}`
  rowId: string;
  timeKey?: string; // monthKey for HierarchicalGrid, measureId for other layouts
  measureId?: string;
  oldValue?: number; // Optional - if undefined, this is just a note entry
  newValue?: number; // Optional - if undefined, this is just a note entry
  note?: string; // Optional - adjustment note associated with this edit
  disaggregationRule?: string; // Optional - disaggregation mechanism rule (even, proportional, fixed, custom, do not cascade)
  timestamp: Date;
  userId: string;
  userName: string;
  /** Value cell keys included in a bulk row — show this entry in each cell's history. */
  bulkAffectedCellKeys?: string[];
}

/** Whether a history entry applies to a given value cell (exact, bulk membership, or row+time). */
export function editHistoryEntryAffectsCell(
  entry: CellEditHistoryEntry,
  cellKey: string,
  rowId?: string,
  timeKey?: string
): boolean {
  if (entry.cellKey === cellKey) return true;
  if (entry.bulkAffectedCellKeys?.includes(cellKey)) return true;
  if (rowId && timeKey && entry.rowId === rowId && entry.timeKey === timeKey) return true;
  return false;
}

