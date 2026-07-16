// Conditional Formatting Types

export type IndicatorMode = 'modifyCells' | 'createColumns';

export type VisualizationType = 
  | 'dataBar'
  | 'divergingBar'
  | 'bulletGraph'
  | 'iconSet'
  | 'colorScale'
  | 'background'
  | 'font'
  | 'border'
  | 'leftIcon';

export type ConditionType = 
  | 'formula'
  | 'topN'
  | 'bottomN'
  | 'aboveAverage'
  | 'belowAverage'
  | 'greaterThan'
  | 'lessThan'
  | 'between'
  | 'equals';

export interface RuleCondition {
  type: ConditionType;
  formula?: string;
  value?: number;
  value2?: number; // For 'between' condition
  n?: number; // For topN/bottomN
}

export interface RuleTarget {
  measureIds: string[];
  dimensionLevels: string[]; // 'account', 'category', 'product'
  timeKeys: string[]; // 'jan2026', 'feb2026', etc.
  // Exclusion lists (populated when operator is "is not any of")
  excludeMeasureIds?: string[];
  excludeDimensionLevels?: string[];
  excludeTimeKeys?: string[];
  // Manual cell selection — when set, bypasses measure/dimension/time checks
  cellKeys?: string[]; // 'rowId-timeKey' pairs, e.g. 'product-trn-a-measure-sa-qty-jan2026'
}

/** One band in a zone-based visualization. The last zone should have isCatchAll = true. */
export interface IndicatorZone {
  id: string;
  threshold?: number;    // undefined = catch-all (always matches)
  color: string;         // hex color for this zone
  label?: string;        // display label e.g. "Good", "Watch", "Critical"
  icon?: string;         // optional emoji/icon for custom icon-set style
  isCatchAll?: boolean;
}

/** What value to evaluate zones / conditions against */
export type EvalBasis = 'cellValue' | 'yoy' | 'mom' | 'targetAchievement' | 'variance' | 'pctOfColumnTotal' | 'pctRankByType' | 'costShare' | 'custom';

export interface VisualizationConfig {
  type: VisualizationType;

  /** Which derived value to evaluate zones/conditions against (default: 'cellValue') */
  evalBasis?: EvalBasis;
  /** Custom formula expression when evalBasis === 'custom' */
  evalBasisFormula?: string;

  // Zone-based (iconSet, dataBar, colorScale)
  zones?: IndicatorZone[];
  iconStyle?: 'arrows' | 'trafficLights' | 'stars' | 'flags' | 'custom';
  barMin?: number;
  barMax?: number;
  showValue?: boolean;
  barDirection?: 'leftToRight' | 'rightToLeft';

  // Simple cell formatting (background, font, border — modifyCells only)
  color?: string;
  fontWeight?: 'normal' | 'bold';
  borderStyle?: 'solid' | 'dashed' | 'dotted';

  // Calculation formula (createColumns mode)
  formulaExpression?: string; // e.g. "({Revenue} - {Revenue[-1Y]}) / {Revenue[-1Y]} * 100"
  resultUnit?: 'percent' | 'number' | 'ratio'; // controls threshold labeling & preview formatting

  // Legacy fields kept for backward compat
  barColor?: string;
  iconType?: 'arrows' | 'trafficLights' | 'stars' | 'flags' | 'custom';
  minColor?: string;
  midColor?: string;
  maxColor?: string;
}

export interface ConditionalFormattingRule {
  id: string;
  name: string;
  isActive: boolean;
  priority: number; // Lower number = higher priority
  mode: IndicatorMode;
  target: RuleTarget;
  adminTarget?: RuleTarget; // Admin-defined max scope; user's target must be a subset
  condition: RuleCondition;
  visualization: VisualizationConfig;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  isAdmin?: boolean; // Admin-created rules are read-only and cannot be edited/deleted
}

export interface ConditionalFormattingConfig {
  rules: ConditionalFormattingRule[];
  globalMode: IndicatorMode; // Default mode for new rules
}
