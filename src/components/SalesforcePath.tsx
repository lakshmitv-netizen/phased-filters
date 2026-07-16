import React from 'react';
import '../styles/components/SalesforcePath.css';

export type PlanPathStep = { id: string; label: string };

const DEFAULT_STEPS: PlanPathStep[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'approved_rejected', label: 'Approved / Rejected' },
  { id: 'active_expired', label: 'Active / Expired' },
];

export interface SalesforcePathProps {
  steps?: PlanPathStep[];
  /** Which step is active (matches `Plan Status` on the record). */
  currentStepId?: string;
  /** Step the user selected as the intended target (before confirming). */
  selectedStepId?: string | null;
  /** Called when the user clicks a path stage. */
  onStepClick?: (stepId: string) => void;
  showMarkComplete?: boolean;
  onMarkComplete?: () => void;
  /** Primary action label (e.g. after a stage is selected). */
  markCompleteLabel?: string;
}

function stepClipPath(isFirst: boolean, isLast: boolean): string | undefined {
  if (isFirst && isLast) return undefined;
  if (isFirst) {
    return 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)';
  }
  if (isLast) {
    return 'polygon(14px 0, 100% 0, 100% 100%, 14px 100%, 27px 50%)';
  }
  return 'polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 27px 50%)';
}

const SalesforcePath: React.FC<SalesforcePathProps> = ({
  steps = DEFAULT_STEPS,
  currentStepId = 'draft',
  selectedStepId = null,
  onStepClick,
  showMarkComplete = true,
  onMarkComplete,
  markCompleteLabel = 'Mark as Complete',
}) => {
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === currentStepId)
  );

  return (
    <div className="salesforce-path">
      <nav className="salesforce-path__nav" aria-label="Plan status">
        <ol className="salesforce-path__track">
          {steps.map((step, index) => {
            const isFirst = index === 0;
            const isLast = index === steps.length - 1;
            const solo = steps.length === 1;
            const isCurrent = index === currentIndex;
            const isComplete = index < currentIndex;
            const isTargetSelected = selectedStepId != null && step.id === selectedStepId;
            const clip = solo ? undefined : stepClipPath(isFirst, isLast);

            let stateClass = 'salesforce-path__segment--incomplete';
            if (isCurrent) stateClass = 'salesforce-path__segment--current';
            else if (isComplete) stateClass = 'salesforce-path__segment--complete';

            const targetClass = isTargetSelected ? ' salesforce-path__segment--target-selected' : '';

            return (
              <li
                key={step.id}
                className={`salesforce-path__segment ${stateClass}${solo ? ' salesforce-path__segment--solo' : ''}${targetClass}`}
                style={{
                  zIndex: index + 1,
                  clipPath: clip,
                }}
              >
                <button
                  type="button"
                  className="salesforce-path__segment-button"
                  onClick={() => onStepClick?.(step.id)}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-pressed={isTargetSelected}
                >
                  <span className="salesforce-path__label">{step.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      {showMarkComplete && (
        <button
          type="button"
          className="salesforce-path__mark-complete"
          onClick={onMarkComplete}
        >
          <svg
            className="salesforce-path__mark-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {markCompleteLabel}
        </button>
      )}
    </div>
  );
};

export default SalesforcePath;
