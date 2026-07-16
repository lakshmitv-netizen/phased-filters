export interface ApproverState {
  role: string;         // e.g. 'Finance', 'Supply Chain', 'Sales Ops', 'Product Management'
  name: string;         // e.g. 'Alice Brennan'
  initials: string;     // e.g. 'AB'
  status: 'pending' | 'approved' | 'approvedWithCondition' | 'rejected';
  comment?: string;     // For approved: optional note; for approvedWithCondition: the condition text; for rejected: required reason
  resolvedAt?: Date;
}

export interface ApprovalRequest {
  id: string;
  cellKey: string;           // rowId-timeKey
  measureId: string;
  rowId: string;
  timeKey: string;           // "jan2026", "feb2026", etc.
  oldValue: number;
  newValue: number;
  variancePct: number;
  requesterNote: string;     // The adjustment note from the requester
  requesterId: string;
  requesterName: string;
  approverId: string;
  approverName: string;
  status: 'notSubmitted' | 'pending' | 'approved' | 'approvedWithCondition' | 'rejected';
  approverComment?: string;
  approvers?: ApproverState[];  // Per-approver states (when submitted via "Submit to" flow)
  focusContext?: {
    searchTerm?: string;
    startPeriod?: string;
    endPeriod?: string;
    measureSummary?: string;
    dimensionSummary?: string;
    selectedCellKeys?: string[];
  };
  /** Set when a demo user creates or changes this row via Cell Actions, bulk, or grid — stamps show only when true. */
  userInitiated?: boolean;
  createdAt: Date;
  resolvedAt?: Date;
}

/** Derive aggregate status from per-approver list (worst-state-wins).
 *  Priority: rejected > pending > approvedWithCondition > approved */
export function deriveAggregateStatus(approvers: ApproverState[]): 'pending' | 'approved' | 'approvedWithCondition' | 'rejected' {
  if (approvers.some(a => a.status === 'rejected')) return 'rejected';
  if (approvers.some(a => a.status === 'pending')) return 'pending';
  if (approvers.some(a => a.status === 'approvedWithCondition')) return 'approvedWithCondition';
  return 'approved';
}

/** Mock approver roster keyed by role */
export const APPROVER_ROSTER: Record<string, { name: string; initials: string }> = {
  'Finance':            { name: 'Alice Brennan',  initials: 'AB' },
  'Supply Chain':       { name: 'Bob Okoro',       initials: 'BO' },
  'Sales Ops':          { name: 'Carol Singh',     initials: 'CS' },
  'Product Management': { name: 'David Lee',       initials: 'DL' },
};

export const ALL_APPROVER_ROLES = Object.keys(APPROVER_ROSTER);
