import { MeasureData, GridRow } from '../types';
import { findRowById, findParentRow } from './valuePropagation';

export interface CellInfo {
  measureName: string;
  dimensionPath: string[]; // [Account, Category, Product]
  timePeriod: string; // e.g., "Jan 2026", "Q1", "Year"
  rowId: string;
  monthKey?: string;
  measureId?: string;
}

/**
 * Get the measure name from a rowId
 */
export const getMeasureName = (rowId: string, data: MeasureData[]): string => {
  const measure = data.find(m => m.id === rowId);
  if (measure) return measure.name;
  
  const row = findRowById(rowId, data);
  if (!row || !row.parentId) return '';
  
  const parentMeasure = data.find(m => m.id === row.parentId);
  if (parentMeasure) return parentMeasure.name;
  
  // Traverse up to find measure
  let current: GridRow | null = row;
  while (current && current.parentId) {
    const measure = data.find(m => m.id === current!.parentId);
    if (measure) return measure.name;
    current = findParentRow(current.id, data);
  }
  
  return '';
};

/**
 * Build hierarchy path from a rowId (Account > Category > Product)
 */
export const buildHierarchyPath = (rowId: string, data: MeasureData[]): string[] => {
  const path: string[] = [];
  let current = findRowById(rowId, data);
  
  if (!current) return path;
  
  // If it's a measure row, return empty path
  const isMeasure = data.some(m => m.id === rowId);
  if (isMeasure) return path;
  
  // Traverse up to build path
  while (current) {
    // Skip measure level
    if (current.type !== 'measure') {
      path.unshift(current.name);
    }
    
    // Stop if parent is a measure
    if (current.parentId) {
      const parentIsMeasure = data.some(m => m.id === current!.parentId);
      if (parentIsMeasure) break;
    }
    
    current = findParentRow(current.id, data);
    if (!current) break;
  }
  
  return path;
};

/**
 * Format time period key to display string
 */
export const formatTimePeriod = (monthKey: string): string => {
  const timeMap: Record<string, string> = {
    'year': 'Year',
    'q1': 'Q1',
    'q2': 'Q2',
    'q3': 'Q3',
    'q4': 'Q4',
    'jan2026': 'Jan 2026',
    'feb2026': 'Feb 2026',
    'mar2026': 'Mar 2026',
    'apr2026': 'Apr 2026',
    'may2026': 'May 2026',
    'jun2026': 'Jun 2026',
    'jul2026': 'Jul 2026',
    'aug2026': 'Aug 2026',
    'sep2026': 'Sep 2026',
    'oct2026': 'Oct 2026',
    'nov2026': 'Nov 2026',
    'dec2026': 'Dec 2026',
  };
  
  return timeMap[monthKey] || monthKey;
};

/**
 * Extract dimension path from transformed rowId (for Dimensions/Time x Measures layout)
 * The rowId contains the dimension path encoded, e.g., "dimension-account-{id}-category-{id}-product-{id}-year-q1-jan2026"
 */
const extractDimensionPathFromTransformedRowId = (rowId: string, data: MeasureData[]): string[] => {
  // rowId format examples:
  // "dimension-account-{id}" -> Account only
  // "dimension-account-{id}-category-{id}" -> Account > Category
  // "dimension-account-{id}-category-{id}-product-{id}" -> Account > Category > Product
  // "dimension-account-{id}-category-{id}-product-{id}-year-q1-jan2026" -> Account > Category > Product (with time)
  
  const parts = rowId.split('-');
  if (parts[0] !== 'dimension') return [];
  
  const path: string[] = [];
  let i = 1; // Skip "dimension"
  
  // Extract dimension hierarchy: account, category, product
  while (i < parts.length) {
    if (parts[i] === 'account' || parts[i] === 'category' || parts[i] === 'product') {
      const type = parts[i];
      i++; // Skip type
      
      // Find the corresponding row in data to get the name
      // The ID after the type is the dimension ID
      if (i < parts.length) {
        const dimensionId = parts[i];
        
        // Find the row in the original data structure
        for (const measure of data) {
          const findRowById = (id: string, rows: GridRow[]): GridRow | null => {
            for (const row of rows) {
              if (row.id === id || row.id.includes(dimensionId) || dimensionId.includes(row.id.split('-').pop() || '')) {
                return row;
              }
              if (row.children) {
                const found = findRowById(id, row.children);
                if (found) return found;
              }
            }
            return null;
          };
          
          // Try to find account
          if (type === 'account') {
            const account = measure.children?.find(acc => 
              acc.id.includes(dimensionId) || dimensionId.includes(acc.id.split('-').pop() || '')
            );
            if (account) {
              path.push(account.name);
              break;
            }
          }
          // Try to find category
          else if (type === 'category') {
            for (const account of measure.children || []) {
              const category = account.children?.find(cat => 
                cat.id.includes(dimensionId) || dimensionId.includes(cat.id.split('-').pop() || '')
              );
              if (category) {
                path.push(account.name);
                path.push(category.name);
                break;
              }
            }
          }
          // Try to find product
          else if (type === 'product') {
            for (const account of measure.children || []) {
              for (const category of account.children || []) {
                const product = category.children?.find(prod => 
                  prod.id.includes(dimensionId) || dimensionId.includes(prod.id.split('-').pop() || '')
                );
                if (product) {
                  path.push(account.name);
                  path.push(category.name);
                  path.push(product.name);
                  break;
                }
              }
            }
          }
        }
      }
      i++;
    } else if (parts[i] === 'year' || parts[i] === 'q1' || parts[i] === 'q2' || parts[i] === 'q3' || parts[i] === 'q4' ||
               parts[i].match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{4}$/)) {
      // Reached time part, stop
      break;
    } else {
      i++;
    }
  }
  
  return path;
};

/**
 * Extract time period from transformed rowId (for Dimensions/Time x Measures layout)
 */
const extractTimeFromTransformedRowId = (rowId: string): string => {
  const parts = rowId.split('-');
  
  // Find time-related parts
  const timeIndex = parts.findIndex(p => p === 'year');
  if (timeIndex === -1) return 'N/A';
  
  // Check for quarter
  const quarterIndex = parts.findIndex(p => ['q1', 'q2', 'q3', 'q4'].includes(p));
  if (quarterIndex !== -1) {
    const quarter = parts[quarterIndex].toUpperCase();
    // Check for month
    const monthMatch = parts.find(p => p.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{4}$/));
    if (monthMatch) {
      return formatTimePeriod(monthMatch);
    }
    return quarter;
  }
  
  return 'Year';
};

/**
 * Extract cell information from focused cell
 */
export const extractCellInfo = (
  focusedCell: { rowId: string; monthKey?: string; measureId?: string } | null,
  data: MeasureData[],
  layout: string
): CellInfo | null => {
  if (!focusedCell) return null;
  
  let measureName = '';
  let dimensionPath: string[] = [];
  let timePeriod = '';
  
  if (layout === 'Dimensions / Time x Measures' || layout === 'Time / Dimensions x Measures') {
    // For these layouts, measureId is directly available
    measureName = focusedCell.measureId 
      ? data.find(m => m.id === focusedCell.measureId)?.name || ''
      : '';
    
    // Extract dimension path from rowId
    dimensionPath = extractDimensionPathFromTransformedRowId(focusedCell.rowId, data);
    
    // Extract time period from rowId
    timePeriod = extractTimeFromTransformedRowId(focusedCell.rowId);
  } else {
    // HierarchicalGrid layout
    measureName = getMeasureName(focusedCell.rowId, data);
    dimensionPath = buildHierarchyPath(focusedCell.rowId, data);
    timePeriod = focusedCell.monthKey ? formatTimePeriod(focusedCell.monthKey) : 'N/A';
  }
  
  return {
    measureName,
    dimensionPath,
    timePeriod,
    rowId: focusedCell.rowId,
    monthKey: focusedCell.monthKey,
    measureId: focusedCell.measureId,
  };
};

