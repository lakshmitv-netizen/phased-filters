// Persistence for the FULL plan-configuration shape (levels, measures, subsets),
// so a saved config can later be turned into a plan grid. This is separate from
// `cpm_saved_configs` (which only carries list-view metadata: name/description/dates).

export interface PlanConfigLevel {
  /** Display name of the hierarchy level (e.g. "Region", "SKU"). */
  name: string;
  /** Which hierarchy this level belongs to (e.g. "Account Hierarchy"). */
  hierarchy: string;
}

export interface PlanConfigMeasureLite {
  name: string;
  category: string;
  code?: string;
  unit?: string;
}

export interface PlanConfigSubset {
  name: string;
  /** Measure names that belong to this subset (a.k.a. measure category on the grid). */
  measures: string[];
}

export interface PlanConfigDetail {
  id: string;
  name: string;
  description?: string;
  /** Ordered enabled levels across hierarchies (account levels first, then product). */
  levels: PlanConfigLevel[];
  measures: PlanConfigMeasureLite[];
  subsets: PlanConfigSubset[];
  createdOn?: string;
  /**
   * Values selected for the top (first) level when creating a plan — e.g. the
   * chosen Account Groups. When present, the grid renders exactly these as the
   * first-level rows so the "Create Plan" dropdown and the grid stay in sync.
   */
  topLevelValues?: string[];
  /** Plan duration picked in the Create Plan modal: 'yearly' | 'half-yearly' | 'quarterly'. */
  duration?: string;
  /** Plan planning period, e.g. 'H2 FY 2025', 'Q1 FY 2026', 'FY 2025'. Scopes the grid's time columns. */
  planningPeriod?: string;
}

const DETAILS_KEY = 'cpm_plan_config_details';
const ACTIVE_KEY = 'cpm_active_config_id';

export function loadPlanConfigDetails(): PlanConfigDetail[] {
  try {
    const raw = localStorage.getItem(DETAILS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Upsert a config detail by id. */
export function savePlanConfigDetail(detail: PlanConfigDetail): void {
  try {
    const list = loadPlanConfigDetails().filter((d) => d.id !== detail.id);
    list.push(detail);
    localStorage.setItem(DETAILS_KEY, JSON.stringify(list));
  } catch {
    /* localStorage unavailable */
  }
}

export function getPlanConfigDetail(id: string): PlanConfigDetail | undefined {
  return loadPlanConfigDetails().find((d) => d.id === id);
}

/** The config currently being rendered as a grid (survives reloads of /grid). */
export function setActiveConfigId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

export function getActiveConfigId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
