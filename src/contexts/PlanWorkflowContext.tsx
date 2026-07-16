import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type PlanWorkflowStatus =
  | 'Draft'
  | 'Submitted'
  | 'Approved / Rejected'
  | 'Active / Expired';

type PlanWorkflowContextValue = {
  planStatus: PlanWorkflowStatus;
  setPlanStatus: React.Dispatch<React.SetStateAction<PlanWorkflowStatus>>;
  /** User id who submitted the plan for approval (set on submit; cleared when status leaves Submitted). */
  planSubmittedByUserId: string | null;
  setPlanSubmittedByUserId: React.Dispatch<React.SetStateAction<string | null>>;
};

const PlanWorkflowContext = createContext<PlanWorkflowContextValue | null>(null);

export function PlanWorkflowProvider({ children }: { children: ReactNode }) {
  const [planStatus, setPlanStatus] = useState<PlanWorkflowStatus>('Draft');
  const [planSubmittedByUserId, setPlanSubmittedByUserId] = useState<string | null>(null);

  useEffect(() => {
    if (planStatus !== 'Submitted') {
      setPlanSubmittedByUserId(null);
    }
  }, [planStatus]);

  const value = useMemo(
    () => ({ planStatus, setPlanStatus, planSubmittedByUserId, setPlanSubmittedByUserId }),
    [planStatus, planSubmittedByUserId],
  );
  return (
    <PlanWorkflowContext.Provider value={value}>{children}</PlanWorkflowContext.Provider>
  );
}

export function usePlanWorkflow(): PlanWorkflowContextValue {
  const ctx = useContext(PlanWorkflowContext);
  if (!ctx) {
    throw new Error('usePlanWorkflow must be used within PlanWorkflowProvider');
  }
  return ctx;
}
