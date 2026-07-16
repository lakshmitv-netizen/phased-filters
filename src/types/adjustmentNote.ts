export interface AdjustmentNote {
  id: string;
  cellKey: string; // `${rowId}-${monthKey}` or `${rowId}-${measureId}`
  rowId: string;
  timeKey?: string; // monthKey for HierarchicalGrid, measureId for other layouts
  measureId?: string;
  note: string;
  timestamp: Date;
  userId: string;
  userName: string;
}

