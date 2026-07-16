import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { APP_USERS } from './UserContext';
import { APPROVER_ROSTER } from '../types/approvalRequest';

const PLAN_APPROVER_ROLES = ['Finance', 'Supply Chain', 'Sales Ops', 'Product Management'] as const;

export type HeaderNotificationKind =
  | 'plan_approval_request'
  | 'plan_approver_decision'
  | 'cell_approval_request'
  | 'cell_approver_decision';

/** Focus/navigation context carried on a cell-approval notification so clicking it can
 *  deep-link into the grid, open the review card, and focus the requested section. */
export interface ApprovalNotificationFocusContext {
  searchTerm?: string;
  startPeriod?: string;
  endPeriod?: string;
  measureSummary?: string;
  dimensionSummary?: string;
  selectedCellKeys?: string[];
}

export interface ApprovalNotificationPayload {
  requesterUserId?: string;
  requesterName: string;
  cellKey?: string;
  summary?: string;
  focusContext?: ApprovalNotificationFocusContext;
}

export interface HeaderNotification {
  id: string;
  recipientUserId: string;
  kind: HeaderNotificationKind;
  title: string;
  body: string;
  createdAt: Date;
  read: boolean;
  /** Present on cell-approval notifications — used to deep-link into the grid on click. */
  payload?: ApprovalNotificationPayload;
}

function approverNameToUserId(name: string): string | undefined {
  return APP_USERS.find((u) => u.name === name)?.id;
}

export type PublishPlanApprovalParams = {
  requesterName: string;
  requesterUserId?: string;
  planLabel?: string;
  notes?: string;
  /** Focus context derived from the requester's edits, so the approver's review
   *  card can focus the grid on the cells the requester actually changed. */
  focusContext?: ApprovalNotificationFocusContext;
};

export type PlanApproverDecisionOutcome = 'approved' | 'approvedWithCondition' | 'rejected';

export type PublishPlanApproverDecisionForRequesterParams = {
  requesterUserId: string;
  approverName: string;
  outcome: PlanApproverDecisionOutcome;
  planLabel?: string;
  notes?: string;
};

export type PublishCellApprovalRequestedParams = {
  requesterUserId?: string;
  requesterName: string;
  /** User ids of the approvers who should be notified. */
  recipientUserIds: string[];
  /** Short human label for the cell, e.g. "Order Quantity · Apr 2026 · Engine Components". */
  summary?: string;
  notes?: string;
  /** The cell key + focus context, so clicking the notification deep-links into the grid. */
  cellKey?: string;
  focusContext?: ApprovalNotificationFocusContext;
};

export type PublishCellApproverDecisionParams = {
  /** User id of the original requester who should be notified of the outcome. */
  requesterUserId: string;
  approverName: string;
  outcome: PlanApproverDecisionOutcome;
  summary?: string;
  notes?: string;
};

type NotificationsPanelOpenRequest = { userId: string; nonce: number };

type NotificationsContextValue = {
  notifications: HeaderNotification[];
  /** After plan is submitted for approval — one unread notification per approver. */
  publishPlanApprovalRequested: (params: PublishPlanApprovalParams) => void;
  /** When an approver records a decision — notify the plan submitter (bell + optional panel open). */
  publishPlanApproverDecisionForRequester: (params: PublishPlanApproverDecisionForRequesterParams) => void;
  /** When a user requests approval on a cell — notify the targeted approver(s). */
  publishCellApprovalRequested: (params: PublishCellApprovalRequestedParams) => void;
  /** When an approver records a decision on a cell — notify the original requester (bell + panel open). */
  publishCellApproverDecision: (params: PublishCellApproverDecisionParams) => void;
  /** When plan returns to Draft and requests are withdrawn. */
  withdrawPlanApprovalNotifications: () => void;
  markNotificationRead: (id: string) => void;
  markAllReadForUser: (userId: string) => void;
  /** Present when the requester should auto-open the notifications popover (consumed by Header). */
  notificationsPanelOpenRequest: NotificationsPanelOpenRequest | null;
  consumeNotificationsPanelOpenRequest: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const DEFAULT_PLAN_LABEL = 'Planning & Forecasting FY26';

function decisionOutcomeVerb(outcome: PlanApproverDecisionOutcome): string {
  switch (outcome) {
    case 'approved':
      return 'approved';
    case 'approvedWithCondition':
      return 'approved with conditions';
    case 'rejected':
      return 'rejected';
    default:
      return 'updated';
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<HeaderNotification[]>([]);
  const [notificationsPanelOpenRequest, setNotificationsPanelOpenRequest] =
    useState<NotificationsPanelOpenRequest | null>(null);

  const consumeNotificationsPanelOpenRequest = useCallback(() => {
    setNotificationsPanelOpenRequest(null);
  }, []);

  const publishPlanApprovalRequested = useCallback(
    ({ requesterName, requesterUserId, planLabel = DEFAULT_PLAN_LABEL, notes, focusContext }: PublishPlanApprovalParams) => {
      const createdAt = new Date();
      const batchKey = `plan-appr-${createdAt.getTime()}`;
      setNotifications((prev) => {
        const rest = prev.filter((n) => n.kind !== 'plan_approval_request');
        const added: HeaderNotification[] = [];
        for (const role of PLAN_APPROVER_ROLES) {
          const entry = APPROVER_ROSTER[role];
          if (!entry) continue;
          const recipientUserId = approverNameToUserId(entry.name);
          if (!recipientUserId) continue;
          const bodyLines = [
            `${requesterName} submitted ${planLabel} for your review as ${role}.`,
            'Open Planning & Forecasting to review and approve.',
          ];
          if (notes?.trim()) {
            bodyLines.push(`Requester note: ${notes.trim()}`);
          }
          added.push({
            id: `${batchKey}-${recipientUserId}`,
            recipientUserId,
            kind: 'plan_approval_request',
            title: 'Planning approval requested',
            body: bodyLines.join('\n\n'),
            createdAt,
            read: false,
            // Carry a payload so clicking the bell deep-links into the grid and
            // injects the "Review approval request from <requester>" card. Plan-level
            // submits aren't tied to one cell, but we attach a focusContext built
            // from the requester's edits so the approver can focus the changed cells.
            payload: {
              requesterUserId,
              requesterName,
              summary: planLabel,
              focusContext,
            },
          });
        }
        return [...rest, ...added];
      });
    },
    []
  );

  const publishPlanApproverDecisionForRequester = useCallback(
    ({
      requesterUserId,
      approverName,
      outcome,
      planLabel = DEFAULT_PLAN_LABEL,
      notes,
    }: PublishPlanApproverDecisionForRequesterParams) => {
      const createdAt = new Date();
      const id = `plan-appr-decision-${createdAt.getTime()}-${requesterUserId}`;
      const verb = decisionOutcomeVerb(outcome);
      const bodyLines = [
        `${approverName} ${verb} ${planLabel}.`,
        'Open Planning & Forecasting to review the outcome on the record.',
      ];
      if (notes?.trim()) {
        bodyLines.push(`Approver note: ${notes.trim()}`);
      }
      const title =
        outcome === 'rejected'
          ? 'Plan rejected'
          : outcome === 'approvedWithCondition'
            ? 'Plan approved with conditions'
            : 'Plan approved';

      setNotifications((prev) => [
        {
          id,
          recipientUserId: requesterUserId,
          kind: 'plan_approver_decision',
          title,
          body: bodyLines.join('\n\n'),
          createdAt,
          read: false,
        },
        ...prev,
      ]);
      setNotificationsPanelOpenRequest({ userId: requesterUserId, nonce: createdAt.getTime() });
    },
    []
  );

  const publishCellApprovalRequested = useCallback(
    ({ requesterUserId, requesterName, recipientUserIds, summary, notes, cellKey, focusContext }: PublishCellApprovalRequestedParams) => {
      const createdAt = new Date();
      const batchKey = `cell-appr-${createdAt.getTime()}`;
      const uniqueRecipients = Array.from(new Set(recipientUserIds.filter(Boolean)));
      if (uniqueRecipients.length === 0) return;
      const payload: ApprovalNotificationPayload = {
        requesterUserId,
        requesterName,
        cellKey,
        summary,
        focusContext,
      };
      setNotifications((prev) => {
        const added: HeaderNotification[] = uniqueRecipients.map((recipientUserId) => {
          const bodyLines = [
            `${requesterName} requested your approval${summary ? ` on ${summary}` : ''}.`,
            'Open Planning & Forecasting to review and approve.',
          ];
          if (notes?.trim()) {
            bodyLines.push(`Requester note: ${notes.trim()}`);
          }
          return {
            id: `${batchKey}-${recipientUserId}`,
            recipientUserId,
            kind: 'cell_approval_request' as const,
            title: 'Approval requested',
            body: bodyLines.join('\n\n'),
            createdAt,
            read: false,
            payload,
          };
        });
        return [...added, ...prev];
      });
    },
    []
  );

  const publishCellApproverDecision = useCallback(
    ({ requesterUserId, approverName, outcome, summary, notes }: PublishCellApproverDecisionParams) => {
      if (!requesterUserId) return;
      const createdAt = new Date();
      const id = `cell-appr-decision-${createdAt.getTime()}-${requesterUserId}`;
      const verb = decisionOutcomeVerb(outcome);
      const bodyLines = [
        `${approverName} ${verb} your change${summary ? ` on ${summary}` : ''}.`,
        'Open Planning & Forecasting to review the outcome.',
      ];
      if (notes?.trim()) {
        bodyLines.push(`Approver note: ${notes.trim()}`);
      }
      const title =
        outcome === 'rejected'
          ? 'Change rejected'
          : outcome === 'approvedWithCondition'
            ? 'Change approved with conditions'
            : 'Change approved';

      setNotifications((prev) => [
        {
          id,
          recipientUserId: requesterUserId,
          kind: 'cell_approver_decision',
          title,
          body: bodyLines.join('\n\n'),
          createdAt,
          read: false,
        },
        ...prev,
      ]);
      setNotificationsPanelOpenRequest({ userId: requesterUserId, nonce: createdAt.getTime() });
    },
    []
  );

  const withdrawPlanApprovalNotifications = useCallback(() => {
    setNotifications((prev) => prev.filter((n) => n.kind !== 'plan_approval_request'));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllReadForUser = useCallback((userId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.recipientUserId === userId ? { ...n, read: true } : n))
    );
  }, []);

  const value = useMemo(
    () => ({
      notifications,
      publishPlanApprovalRequested,
      publishPlanApproverDecisionForRequester,
      publishCellApprovalRequested,
      publishCellApproverDecision,
      withdrawPlanApprovalNotifications,
      markNotificationRead,
      markAllReadForUser,
      notificationsPanelOpenRequest,
      consumeNotificationsPanelOpenRequest,
    }),
    [
      notifications,
      publishPlanApprovalRequested,
      publishPlanApproverDecisionForRequester,
      publishCellApprovalRequested,
      publishCellApproverDecision,
      withdrawPlanApprovalNotifications,
      markNotificationRead,
      markAllReadForUser,
      notificationsPanelOpenRequest,
      consumeNotificationsPanelOpenRequest,
    ]
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return ctx;
}

export function formatNotificationTimestamp(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'a few seconds ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return min <= 1 ? '1 minute ago' : `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? '1 hour ago' : `${hr} hours ago`;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
