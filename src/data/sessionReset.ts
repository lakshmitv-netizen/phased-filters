// Session-scoped persistence bootstrap.
//
// The setup flow persists working data (hierarchies, edited/created measures,
// created plan configurations) to localStorage so that the React pages, the
// same-origin iframes (e.g. the Plan Configuration list), and the grid all stay
// connected within a single session. We only want that working data to live for
// the current session: every full page load — including a hard refresh — should
// start clean from the out-of-the-box (OOTB) defaults, which are defined in code
// and in the static HTML snapshots, not in localStorage.
//
// Module side-effects run once per full document load (initial load and every
// refresh) but NOT on client-side React Router navigation. Importing this module
// first in main.tsx therefore wipes the working keys before any store or iframe
// reads them; in-session edits then persist normally until the next refresh.
//
// Everything the app writes is namespaced under `cpm_`, so clearing that prefix
// resets hierarchies, measures, plan configurations, dimensions, deletions and
// the active-config pointer in one shot — while leaving anything unrelated (or
// future non-session keys) untouched.

const WORKING_KEY_PREFIX = 'cpm_';

try {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(WORKING_KEY_PREFIX)) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
} catch {
  /* localStorage unavailable — nothing to reset */
}

export {};
