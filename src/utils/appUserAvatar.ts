import { APPROVER_ROSTER } from '../types/approvalRequest';

/** Backgrounds match CellDetailsHistoryPanel "Submit to" inline styles per role */
const ROLE_SUBMIT_TO_BACKGROUND: Record<string, string> = {
  Finance: '#dbeafe',
  'Supply Chain': '#d1fae5',
  'Sales Ops': '#fef3c7',
  'Product Management': '#ede9fe',
};

/** Pastel for app users who are not on the approver roster (e.g. John Carter) */
const DEFAULT_APP_USER_BACKGROUND = '#e0e7ff';

export function getAppUserInitialsStyle(displayName: string): {
  initials: string;
  backgroundColor: string;
} {
  for (const [role, { name, initials }] of Object.entries(APPROVER_ROSTER)) {
    if (name === displayName) {
      return {
        initials,
        backgroundColor: ROLE_SUBMIT_TO_BACKGROUND[role] ?? DEFAULT_APP_USER_BACKGROUND,
      };
    }
  }

  const trimmed = displayName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : trimmed.slice(0, 2).toUpperCase();

  return { initials, backgroundColor: DEFAULT_APP_USER_BACKGROUND };
}
