import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ApprovalRequest } from '../types';
import { useCurrentUser } from '../contexts/UserContext';
import '../styles/components/ApprovalActionPopover.css';

interface ApprovalActionPopoverProps {
  isOpen: boolean;
  cellElement: HTMLElement | null;
  approval: ApprovalRequest | null;
  onAction: (approvalId: string, action: 'submitForApproval' | 'approved' | 'approvedWithCondition' | 'rejected', comment: string, approverRole?: string) => void;
  onClose: () => void;
}

const ApprovalActionPopover: React.FC<ApprovalActionPopoverProps> = ({
  isOpen,
  cellElement,
  approval,
  onAction,
  onClose,
}) => {
  const { currentUser } = useCurrentUser();
  const [selectedAction, setSelectedAction] = useState<'submitForApproval' | 'approved' | 'approvedWithCondition' | 'rejected' | ''>('');
  const [comment, setComment] = useState<string>('');
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ 
    top: Math.max(100, window.innerHeight / 2 - 150), 
    left: Math.max(100, window.innerWidth / 2) 
  });
  const [nubbinSide, setNubbinSide] = useState<'left' | 'right'>('left'); // 'left' means nubbin on left side (popover on right), 'right' means nubbin on right side (popover on left)

  // Reset state when popover opens/closes
  useEffect(() => {
    if (isOpen && approval) {
      setSelectedAction('');
      setComment('');
      setShowDetails(false);
    }
  }, [isOpen, approval]);

  // Calculate position when popover opens or cell element changes
  useEffect(() => {
    if (!isOpen) return;
    
    const updatePosition = () => {
      if (cellElement) {
        const cellRect = cellElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Position popover to the right of the cell
        let left = cellRect.right + 10;
        let top = cellRect.top + window.scrollY;
        let isOnRight = true;

        // If not enough space on the right, position on the left
        if (left + 400 > viewportWidth) {
          left = cellRect.left - 410;
          isOnRight = false;
        }
        
        setNubbinSide(isOnRight ? 'left' : 'right');

        // Ensure popover stays in viewport
        if (left < 10) left = 10;
        if (top < 10) top = 10;
        if (top + 350 > viewportHeight) {
          top = viewportHeight - 360;
        }

        setPosition({ top, left });
      } else {
        // Fallback: center-right of screen
        setPosition({ 
          top: Math.max(100, window.innerHeight / 2 - 150), 
          left: Math.max(100, window.innerWidth / 2) 
        });
        setNubbinSide('left'); // Default to left side nubbin
      }
    };

    // Set initial position immediately
    updatePosition();
    
    // Update position after popover renders
    const timer1 = setTimeout(updatePosition, 10);
    const timer2 = setTimeout(updatePosition, 100);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isOpen, cellElement]);

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        cellElement &&
        !cellElement.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, cellElement, onClose]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !approval) return null;

  const deltaPct = approval.variancePct;
  const isCommentRequired = selectedAction === 'rejected' || selectedAction === 'approvedWithCondition';
  const canConfirm = selectedAction !== '' && (!isCommentRequired || comment.trim().length > 0);
  const showSubmitForApproval = approval.status === 'notSubmitted';

  const formatValue = (value: number): string => Math.round(value).toLocaleString('en-US');
  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - new Date(date).getTime()) / 86400000);
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  };

  const handleConfirm = () => {
    if (!canConfirm || !approval) return;
    const actingApproverRole = approval.approvers
      ?.find((a) => a.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())?.role;
    onAction(
      approval.id,
      selectedAction as 'submitForApproval' | 'approved' | 'approvedWithCondition' | 'rejected',
      comment.trim(),
      actingApproverRole
    );
    onClose();
  };

  return createPortal(
    <div
      ref={popoverRef}
      className="approval-popover"
      style={{ position: 'absolute', top: `${position.top}px`, left: `${position.left}px`, zIndex: 10002 }}
    >
      <div className={`approval-popover-nubbin approval-popover-nubbin--${nubbinSide}`}></div>
      <div className="approval-popover-content">
        {/* Change Status dropdown — always shown */}
        <div className="approval-popover-section">
          <label className="approval-popover-label">Change Status</label>
          <div className="approval-action-dropdown">
            <select value={selectedAction} onChange={(e) => setSelectedAction(e.target.value as any)} className="approval-action-select">
              <option value="">Select an action...</option>
              {showSubmitForApproval && <option value="submitForApproval">Submit for Approval</option>}
              <option value="approved">Approve</option>
              <option value="approvedWithCondition">Approve with Condition</option>
              <option value="rejected">Reject</option>
            </select>
          </div>
        </div>

        {/* Comment */}
        <div className="approval-popover-section">
          <label className="approval-popover-label">
            {selectedAction === 'approvedWithCondition' ? 'Condition' : 'Comment'}
            {isCommentRequired && <span className="approval-required"> (Required)</span>}
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={selectedAction === 'approvedWithCondition' ? 'e.g. Max 45,000 units (not 50,000 requested)' : 'Add a comment...'}
            className="approval-comment-textarea"
            rows={3}
          />
        </div>

        {/* Expandable details */}
        <div className="approval-popover-section">
          <button type="button" onClick={() => setShowDetails(!showDetails)} className="approval-details-toggle">
            <span>View details</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {showDetails && (
            <div className="approval-popover-details">
              {approval.oldValue !== approval.newValue && (
                <div className="approval-detail-row">
                  <span className="approval-detail-label">Change:</span>
                  <span className="approval-detail-value">
                    {formatValue(approval.oldValue)} → {formatValue(approval.newValue)} ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                  </span>
                </div>
              )}
              <div className="approval-detail-row">
                <span className="approval-detail-label">Requested by:</span>
                <span className="approval-detail-value">{approval.requesterName}, {formatRelativeTime(approval.createdAt)}</span>
              </div>
              {approval.requesterNote && (
                <div className="approval-detail-row">
                  <span className="approval-detail-label">Note:</span>
                  <span className="approval-detail-value">{approval.requesterNote}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="approval-popover-actions">
          <button type="button" onClick={onClose} className="approval-popover-cancel">Cancel</button>
          <button type="button" onClick={handleConfirm} disabled={!canConfirm} className="approval-popover-confirm">Confirm</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ApprovalActionPopover;
