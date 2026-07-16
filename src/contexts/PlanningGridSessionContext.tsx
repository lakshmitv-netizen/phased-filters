import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { MeasureData } from '../types';
import type { CellEditHistoryEntry } from '../types/editHistory';

/** Serializable cell edit state from HierarchicalGrid (survives route changes). */
export type PlanningGridCellMapsSnapshot = {
  editedCells: [string, number][];
  savedEditedCells: [string, string][];
  impactedCells: [string, number][];
  unsavedNotes: [string, string][];
  savedImpactedCells: string[];
};

export type PlanningGridSessionSnapshot = {
  industryKey: string;
  data: MeasureData[];
  originalData: MeasureData[];
  editHistory: CellEditHistoryEntry[];
  draftEditHistory: [string, CellEditHistoryEntry][];
  cellMaps: PlanningGridCellMapsSnapshot;
};

type PlanningGridSessionContextValue = {
  session: PlanningGridSessionSnapshot | null;
  saveSession: (snapshot: PlanningGridSessionSnapshot) => void;
  clearSession: () => void;
};

const PlanningGridSessionContext = createContext<PlanningGridSessionContextValue | null>(null);

export function PlanningGridSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PlanningGridSessionSnapshot | null>(null);

  const saveSession = useCallback((snapshot: PlanningGridSessionSnapshot) => {
    setSession(snapshot);
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, saveSession, clearSession }),
    [session, saveSession, clearSession]
  );

  return (
    <PlanningGridSessionContext.Provider value={value}>
      {children}
    </PlanningGridSessionContext.Provider>
  );
}

export function usePlanningGridSession(): PlanningGridSessionContextValue {
  const ctx = useContext(PlanningGridSessionContext);
  if (!ctx) {
    throw new Error('usePlanningGridSession must be used within PlanningGridSessionProvider');
  }
  return ctx;
}

/** Deep clone measure data (JSON-safe mock tree). */
export function cloneMeasureData(data: MeasureData[]): MeasureData[] {
  return JSON.parse(JSON.stringify(data)) as MeasureData[];
}

export function reviveEditHistory(entries: CellEditHistoryEntry[]): CellEditHistoryEntry[] {
  return entries.map((e) => ({
    ...e,
    timestamp: e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp as unknown as string),
  }));
}
