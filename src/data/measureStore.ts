// Shared persistence for user-created measures.
//
// The CPM feature page ("Review Available Measures" modal) and the Plan
// Configuration builder ("Add Measures" modal) live on different routes with
// their own in-memory measure lists. To make measures created in the review
// modal show up in the plan-config builder, we persist the custom ones here and
// merge them into the builder's base list on load.

import type { Measure as PlanConfigMeasure } from './planConfigData';

export const CUSTOM_MEASURES_KEY = 'cpm_custom_measures';

// Full working copy of the CPM setup page's measure list (OOTB measures plus any
// edits and additions). Persisted so measure edits stay put when navigating away
// from and back to the setup page within a session; cleared on refresh by the
// session-reset bootstrap, restoring the OOTB measures.
export const SESSION_MEASURES_KEY = 'cpm_review_measures';

// Loose shape that covers both the ReviewMeasuresModal Measure and stored JSON.
export interface StoredMeasure {
  id?: number;
  name: string;
  description?: string;
  type?: string;
  sourceDmo?: string;
  sourceName?: string;
  code?: string;
  measureCode?: string;
  aggregation?: string;
  disaggregation?: string;
  category?: string;
  subsets?: string[];
  unit?: string;
  dataType?: string;
}

export function saveCustomMeasures(list: StoredMeasure[]): void {
  try {
    localStorage.setItem(CUSTOM_MEASURES_KEY, JSON.stringify(list));
  } catch {
    /* localStorage unavailable */
  }
}

export function loadCustomMeasures(): StoredMeasure[] {
  try {
    const raw = localStorage.getItem(CUSTOM_MEASURES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist the setup page's full measure list (OOTB + edits + additions). */
export function saveSessionMeasures(list: StoredMeasure[]): void {
  try {
    localStorage.setItem(SESSION_MEASURES_KEY, JSON.stringify(list));
  } catch {
    /* localStorage unavailable */
  }
}

/**
 * Load the persisted full measure list for the current session, or null when
 * nothing has been saved yet (e.g. right after a refresh) so callers fall back
 * to the OOTB seed.
 */
export function loadSessionMeasures(): StoredMeasure[] | null {
  try {
    const raw = localStorage.getItem(SESSION_MEASURES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

// Map stored (custom) measures into the PlanningGridConfig Measure shape and
// prepend them to the base list, skipping any whose name already exists.
export function mergeCustomMeasures(base: PlanConfigMeasure[]): PlanConfigMeasure[] {
  const custom = loadCustomMeasures();
  if (!custom.length) return base;
  const existing = new Set(base.map((m) => m.name.trim().toLowerCase()));
  const baseMaxId = base.reduce((max, m) => Math.max(max, m.id || 0), 0);
  const extras: PlanConfigMeasure[] = custom
    .filter((m) => m && m.name && !existing.has(String(m.name).trim().toLowerCase()))
    .map((m, i) => ({
      id: baseMaxId + 1 + i,
      name: m.name,
      description: m.description || m.name,
      type: m.type || 'Read',
      sourceDmo: m.sourceDmo || m.sourceName || 'Custom',
      code: m.code || m.measureCode || '',
      aggregation: m.aggregation || 'SUM',
      disaggregation: m.disaggregation || 'Proportional',
      category: m.category || 'Operations',
      subsets: Array.isArray(m.subsets) ? m.subsets : [],
      unit: m.unit || 'volume',
      dataType: m.dataType || 'Number',
      sourceName: m.sourceName || m.sourceDmo || 'Custom',
      selected: false,
    }));
  return [...extras, ...base];
}
