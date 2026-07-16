// Per-grid dimension "scheme": the ordered list of dimension levels a grid exposes,
// grouped by hierarchy (Account vs Product). Existing grids keep the original 3-level
// scheme (account -> category -> product); the deep grid adds 5 account + 5 product
// levels. Row `type` values equal the level `id`, and the generic row-visibility
// engine (HierarchicalGrid.filterRowsByType) already keys off `type`, so this scheme
// only needs to describe labels, grouping, and icons.

import type { IndustryType } from '../contexts/IndustryContext';
import {
  isConfigIndustry,
  isConfigLevel,
  getConfigDimensionScheme,
  getConfigGlyph,
  isPristineOotbAccountPlanning,
} from './planConfigGridData';

export interface DimensionLevelDef {
  id: string;
  name: string;
  hierarchy: string;
}

const BASE = import.meta.env.BASE_URL;

/** Default scheme — matches the existing manufacturing / consumer-goods / grid-264 grids. */
export const DEFAULT_DIMENSION_LEVELS: DimensionLevelDef[] = [
  { id: 'account', name: 'Account', hierarchy: 'Account Hierarchy' },
  { id: 'category', name: 'Category', hierarchy: 'Product Hierarchy' },
  { id: 'product', name: 'Product', hierarchy: 'Product Hierarchy' },
];

/** Deep scheme — 5 account levels + 5 product levels for the deep-hierarchy grid. */
export const DEEP_DIMENSION_LEVELS: DimensionLevelDef[] = [
  { id: 'acct-global', name: 'Global Account Group', hierarchy: 'Account Hierarchy' },
  { id: 'acct-strategic', name: 'Strategic Account Group', hierarchy: 'Account Hierarchy' },
  { id: 'acct-segment', name: 'Segment', hierarchy: 'Account Hierarchy' },
  { id: 'acct-soldto', name: 'Sold-to', hierarchy: 'Account Hierarchy' },
  { id: 'acct-shipto', name: 'Ship-to', hierarchy: 'Account Hierarchy' },
  { id: 'prod-company', name: 'Company', hierarchy: 'Product Hierarchy' },
  { id: 'prod-bu', name: 'Business Unit', hierarchy: 'Product Hierarchy' },
  { id: 'prod-family', name: 'Product Family', hierarchy: 'Product Hierarchy' },
  { id: 'prod-commodity', name: 'Commodity', hierarchy: 'Product Hierarchy' },
  { id: 'prod-part', name: 'Part', hierarchy: 'Product Hierarchy' },
];

/** Acme Partners story scheme — 4 account levels + 2 product levels, matching the CPM_Story demo. */
export const ACME_DIMENSION_LEVELS: DimensionLevelDef[] = [
  { id: 'acme-global', name: 'Global Account', hierarchy: 'Account Hierarchy' },
  { id: 'acme-region', name: 'Region', hierarchy: 'Account Hierarchy' },
  { id: 'acme-division', name: 'Division', hierarchy: 'Account Hierarchy' },
  { id: 'acme-plant', name: 'Plant', hierarchy: 'Account Hierarchy' },
  { id: 'acme-program', name: 'Program', hierarchy: 'Product Hierarchy' },
  { id: 'acme-sku', name: 'SKU', hierarchy: 'Product Hierarchy' },
];

/** Ordered dimension levels for a grid, chosen by its industry key. */
export function getDimensionScheme(industry: IndustryType | null): DimensionLevelDef[] {
  if (isConfigIndustry(industry)) {
    // Untouched OOTB Account Planning reuses the deep scheme (identical levels);
    // customized configs render their own generated scheme.
    if (isPristineOotbAccountPlanning(industry)) return DEEP_DIMENSION_LEVELS;
    return getConfigDimensionScheme(industry as string);
  }
  if (industry === 'manufacturing-deep') return DEEP_DIMENSION_LEVELS;
  if (industry === 'manufacturing-acme') return ACME_DIMENSION_LEVELS;
  return DEFAULT_DIMENSION_LEVELS;
}

// Placeholder icons per level id (reusing existing public SVGs for now — easy to swap
// for bespoke artwork later). Unknown ids fall back to the category glyph.
const ICON_BY_LEVEL_ID: Record<string, string> = {
  account: `${BASE}new_account.svg`,
  category: `${BASE}category.svg`,
  product: `${BASE}product.svg`,
  // Deep account levels
  'acct-global': `${BASE}new_account.svg`,
  'acct-strategic': `${BASE}account-filtered-descendants.svg`,
  'acct-segment': `${BASE}category.svg`,
  'acct-soldto': `${BASE}sort.svg`,
  'acct-shipto': `${BASE}approval-stamp.svg`,
  // Deep product levels
  'prod-company': `${BASE}product.svg`,
  'prod-bu': `${BASE}category-filtered-descendants.svg`,
  'prod-family': `${BASE}category.svg`,
  'prod-commodity': `${BASE}measure-row.svg`,
  'prod-part': `${BASE}measure-row-filtered-descendants.svg`,
  // Acme story levels
  'acme-global': `${BASE}new_account.svg`,
  'acme-region': `${BASE}account-filtered-descendants.svg`,
  'acme-division': `${BASE}category.svg`,
  'acme-plant': `${BASE}sort.svg`,
  'acme-program': `${BASE}product.svg`,
  'acme-sku': `${BASE}measure-row-filtered-descendants.svg`,
};

/** Icon URL for a dimension level / row type (placeholder-friendly). */
export function getDimensionIcon(levelId: string): string {
  return ICON_BY_LEVEL_ID[levelId] ?? `${BASE}category.svg`;
}

// Level id -> display name across every built-in scheme, so features keyed off a row's
// `type` (e.g. the "Annotated Level" row-information column) can label rows in any grid,
// not just the default account/category/product scheme.
const LEVEL_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  [...DEFAULT_DIMENSION_LEVELS, ...DEEP_DIMENSION_LEVELS, ...ACME_DIMENSION_LEVELS].map(
    (l) => [l.id, l.name],
  ),
);

/** Display name for a dimension level / row type across the built-in schemes (undefined if unknown). */
export function getDimensionLevelName(levelId: string): string | undefined {
  return LEVEL_NAME_BY_ID[levelId];
}

// Colored 2-letter acronym glyphs for the deep-hierarchy levels. Account levels use a
// cool palette and product levels use a warm palette so the two hierarchies read as
// distinct groups. All glyphs use white text.
export interface DimensionGlyph {
  letters: string;
  bg: string;
}

const GLYPH_BY_LEVEL_ID: Record<string, DimensionGlyph> = {
  // Account hierarchy (cool)
  'acct-global': { letters: 'GA', bg: '#1B5E9B' },
  'acct-strategic': { letters: 'SA', bg: '#2E7D9A' },
  'acct-segment': { letters: 'SG', bg: '#0F9D8C' },
  'acct-soldto': { letters: 'SO', bg: '#3B7A57' },
  'acct-shipto': { letters: 'SH', bg: '#6A8D2F' },
  // Product hierarchy (warm)
  'prod-company': { letters: 'CO', bg: '#6A3FB5' },
  'prod-bu': { letters: 'BU', bg: '#8E44AD' },
  'prod-family': { letters: 'PF', bg: '#B03A78' },
  'prod-commodity': { letters: 'CM', bg: '#C0562B' },
  'prod-part': { letters: 'PT', bg: '#B8860B' },
  // Acme story — account levels cool, product levels warm.
  'acme-global': { letters: 'GA', bg: '#1B5E9B' },
  'acme-region': { letters: 'RG', bg: '#2E7D9A' },
  'acme-division': { letters: 'DV', bg: '#0F9D8C' },
  'acme-plant': { letters: 'PL', bg: '#3B7A57' },
  'acme-program': { letters: 'PR', bg: '#8E44AD' },
  'acme-sku': { letters: 'SK', bg: '#B8860B' },
};

/** Colored acronym glyph for a scheme dimension level, or null for the legacy account/category/product levels. */
export function getDimensionGlyph(levelId: string): DimensionGlyph | null {
  if (isConfigLevel(levelId)) return getConfigGlyph(levelId);
  return GLYPH_BY_LEVEL_ID[levelId] ?? null;
}

/**
 * True when a row type is one of the multi-level scheme dimension levels (deep or Acme) —
 * i.e. a level rendered with a colored acronym glyph rather than the legacy
 * account/category/product icons. Keyed off glyph presence so new schemes are covered
 * automatically.
 */
export function isDeepDimensionType(type: string): boolean {
  return GLYPH_BY_LEVEL_ID[type] != null || isConfigLevel(type);
}
