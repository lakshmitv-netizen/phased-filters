import React from 'react';
import { ApprovalRequest } from '../types';
import { ApproverState } from '../types/approvalRequest';
import '../styles/components/CellEditInfoPopover.css';
import '../styles/components/ApprovalStatusChangePopover.css';

interface ApprovalStatusChangePopoverProps {
  approval: ApprovalRequest;
  position: { top: number; left: number };
  onViewHistory: () => void;
  onShowDetails?: () => void;
  onClose: () => void;
  onPopoverMouseEnter?: () => void;
  onPopoverMouseLeave?: () => void;
}

const ApprovalStatusChangePopover: React.FC<ApprovalStatusChangePopoverProps> = ({
  approval,
  position,
  onViewHistory,
  onShowDetails,
  onClose,
  onPopoverMouseEnter,
  onPopoverMouseLeave,
}) => {
  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(date));
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const avatarBgForRole: Record<string, string> = {
    Finance: '#dbeafe',
    'Supply Chain': '#d1fae5',
    'Sales Ops': '#fef3c7',
    'Product Management': '#ede9fe',
  };
  const avatarTextForRole: Record<string, string> = {
    Finance: '#1e40af',
    'Supply Chain': '#065f46',
    'Sales Ops': '#92400e',
    'Product Management': '#5b21b6',
  };

  const approvers: ApproverState[] = approval.approvers ?? [];
  const approvedFromApprovers = approvers.filter(a => a.status === 'approved' || a.status === 'approvedWithCondition').length;
  const requestedCount = approvers.length > 0 ? approvers.length : (approval.status === 'notSubmitted' ? 0 : 1);
  const approvedCount = approvers.length > 0
    ? ((approval.status === 'approved' || approval.status === 'approvedWithCondition')
      ? requestedCount
      : approvedFromApprovers)
    : (approval.status === 'approved' || approval.status === 'approvedWithCondition' ? 1 : 0);
  const pendingApprovers = approvers.filter(a => a.status === 'pending');
  const rejectedApprovers = approvers.filter(a => a.status === 'rejected');
  const conditionApprovers = approvers.filter(a => a.status === 'approvedWithCondition');

  // Derive the "hero" person and context for each state
  let avatarInitials = '';
  let avatarBg = '#0250D9';
  let avatarColor = 'white';
  let heroName = '';
  let heroTimestamp = '';
  let changeText: React.ReactNode = null;
  let noteText: string | null = null;
  let statusPillClass = '';
  let statusPillLabel = '';

  if (approval.status === 'rejected') {
    // Show the most recent rejecting approver
    const latestReject = rejectedApprovers
      .filter(a => a.resolvedAt)
      .sort((a, b) => new Date(b.resolvedAt!).getTime() - new Date(a.resolvedAt!).getTime())[0]
      ?? rejectedApprovers[0];

    if (latestReject) {
      avatarInitials = latestReject.initials;
      avatarBg = avatarBgForRole[latestReject.role] ?? '#fee2e2';
      avatarColor = avatarTextForRole[latestReject.role] ?? '#991b1b';
      heroName = latestReject.name;
      heroTimestamp = latestReject.resolvedAt ? formatTimestamp(latestReject.resolvedAt) : formatTimestamp(approval.createdAt);
      changeText = <>Rejected <strong>{latestReject.role}</strong></>;
      noteText = latestReject.comment ?? null;
    } else {
      // Legacy single-approver rejection
      avatarInitials = getInitials(approval.approverName || approval.requesterName);
      heroName = approval.approverName || approval.requesterName;
      heroTimestamp = formatTimestamp(approval.resolvedAt ?? approval.createdAt);
      changeText = <>Changed status to <strong>Rejected</strong></>;
      noteText = approval.approverComment ?? null;
    }
    statusPillClass = 'ascp-pill--rejected';
    statusPillLabel = 'Rejected';

  } else if (approval.status === 'pending') {
    // Show submitter + counts
    avatarInitials = getInitials(approval.requesterName);
    heroName = approval.requesterName;
    heroTimestamp = formatTimestamp(approval.createdAt);

    if (approvers.length > 0) {
      const waitingNames = pendingApprovers.map(a => a.role).join(', ');
      changeText = (
        <>
          Submitted for approval —{' '}
          <strong>{approvedCount}/{approvers.length}</strong> approved
          {pendingApprovers.length > 0 && (
            <><br /><span className="ascp-waiting-label">Awaiting: {waitingNames}</span></>
          )}
        </>
      );
    } else {
      changeText = <>Submitted for <strong>approval</strong></>;
    }
    noteText = approval.requesterNote ?? null;
    statusPillClass = 'ascp-pill--pending';
    statusPillLabel = 'Pending';

  } else if (approval.status === 'approvedWithCondition') {
    // Show the most recent condition-approver
    const latestCondition = conditionApprovers
      .filter(a => a.resolvedAt)
      .sort((a, b) => new Date(b.resolvedAt!).getTime() - new Date(a.resolvedAt!).getTime())[0]
      ?? conditionApprovers[0];

    if (latestCondition) {
      avatarInitials = latestCondition.initials;
      avatarBg = avatarBgForRole[latestCondition.role] ?? '#fef3c7';
      avatarColor = avatarTextForRole[latestCondition.role] ?? '#92400e';
      heroName = latestCondition.name;
      heroTimestamp = latestCondition.resolvedAt ? formatTimestamp(latestCondition.resolvedAt) : formatTimestamp(approval.createdAt);
      changeText = <>Approved with condition — <strong>{latestCondition.role}</strong></>;
      noteText = latestCondition.comment ?? null;
    } else {
      avatarInitials = getInitials(approval.approverName || approval.requesterName);
      heroName = approval.approverName || approval.requesterName;
      heroTimestamp = formatTimestamp(approval.resolvedAt ?? approval.createdAt);
      changeText = <>Changed status to <strong>Approved with Condition</strong></>;
      noteText = approval.approverComment ?? null;
    }
    statusPillClass = 'ascp-pill--approvedWithCondition';
    statusPillLabel = 'Cond. Approved';

  } else {
    // Approved — show most recent approver
    const latestApproved = approvers
      .filter(a => (a.status === 'approved' || a.status === 'approvedWithCondition') && a.resolvedAt)
      .sort((a, b) => new Date(b.resolvedAt!).getTime() - new Date(a.resolvedAt!).getTime())[0];

    if (latestApproved) {
      avatarInitials = latestApproved.initials;
      avatarBg = avatarBgForRole[latestApproved.role] ?? '#d1fae5';
      avatarColor = avatarTextForRole[latestApproved.role] ?? '#065f46';
      heroName = latestApproved.name;
      heroTimestamp = formatTimestamp(latestApproved.resolvedAt!);
      changeText = (
        <>
          All <strong>{approvers.length}</strong> approver{approvers.length !== 1 ? 's' : ''} approved
        </>
      );
    } else {
      avatarInitials = getInitials(approval.approverName || approval.requesterName);
      heroName = approval.approverName || approval.requesterName;
      heroTimestamp = formatTimestamp(approval.resolvedAt ?? approval.createdAt);
      changeText = <>Changed status to <strong>Approved</strong></>;
    }
    statusPillClass = 'ascp-pill--approved';
    statusPillLabel = 'Approved';
  }

  return (
    <div
      className="cell-edit-info-popover"
      style={{ top: position.top, left: position.left }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={(e) => { e.stopPropagation(); onPopoverMouseEnter?.(); }}
      onMouseLeave={() => onPopoverMouseLeave?.()}
    >
      <div className="cell-edit-info-popover-nubbin"></div>

      {/* Header: avatar + name + timestamp + status pill */}
      <div className="cell-edit-info-header">
        <div
          className="cell-edit-info-avatar"
          style={{ background: avatarBg, color: avatarColor }}
        >
          {avatarInitials}
        </div>
        <div className="cell-edit-info-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="cell-edit-info-username">{heroName}</span>
            <span className={`ascp-pill ${statusPillClass}`}>{statusPillLabel}</span>
          </div>
          <span className="cell-edit-info-timestamp">{heroTimestamp}</span>
        </div>
      </div>

      {/* Change description */}
      <div className="cell-edit-info-change-text">{changeText}</div>

      {/* Quick summary */}
      <div className="ascp-summary-line">
        <strong>{approvedCount}/{requestedCount}</strong> approved
      </div>

      {/* Note / comment */}
      {noteText && noteText.trim() && (
        <div className="cell-edit-info-note">
          <span className="cell-edit-info-note-text">
            "{noteText.length > 100 ? noteText.slice(0, 100) + '…' : noteText}"
          </span>
        </div>
      )}

      {/* Separator + actions */}
      <div className="cell-edit-info-separator"></div>
      <div className="cell-edit-info-actions">
        <button
          className="cell-edit-info-mark-read-btn"
          onClick={onShowDetails ?? onViewHistory}
        >
          Mark as read
        </button>
        <div className="cell-edit-info-actions-separator"></div>
        <button className="cell-edit-info-history-btn" onClick={onViewHistory}>
          View approval history
        </button>
      </div>

      {/* Close button */}
      <button className="cell-edit-info-close" onClick={onClose} title="Close">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
        </svg>
      </button>
    </div>
  );
};

export default ApprovalStatusChangePopover;
