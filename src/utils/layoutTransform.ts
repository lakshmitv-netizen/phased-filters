import { MeasureData, GridRow } from '../types';

export interface TransformedRow {
  id: string;
  name: string;
  type: 'account' | 'category' | 'product' | 'year' | 'quarter' | 'month';
  level: number;
  parentId: string | null;
  children?: TransformedRow[];
  measureValues: Map<string, number>; // measureId -> value for current time period
  dimensionPath: string[]; // Path to identify dimension (e.g., ['Account', 'Category', 'Product'])
  timeKey?: keyof GridRow['values']; // For time rows (year, q1-q4, jan2026-dec2026)
}

// Removed unused timeKeys constant

const quarterMonths: { [key: string]: (keyof GridRow['values'])[] } = {
  q1: ['jan2026', 'feb2026', 'mar2026'],
  q2: ['apr2026', 'may2026', 'jun2026'],
  q3: ['jul2026', 'aug2026', 'sep2026'],
  q4: ['oct2026', 'nov2026', 'dec2026'],
};

/**
 * Extract unique dimension hierarchies from all measures
 * Uses the first measure's hierarchy as the template, then collects values from all measures
 */
function extractDimensionHierarchies(data: MeasureData[]): GridRow[] {
  if (!data || data.length === 0) {
    return [];
  }
  
  // Use the first measure's hierarchy structure as the template
  const firstMeasure = data[0];
  if (!firstMeasure.children || firstMeasure.children.length === 0) {
    return [];
  }
  
  // Deep clone the first measure's hierarchy structure
  return JSON.parse(JSON.stringify(firstMeasure.children));
}

/**
 * Extract fiscal year from month keys (e.g., jan2026 -> FY26)
 */
function extractFiscalYear(measureValues: Map<string, GridRow['values']>): string {
  // Try to find a month key to extract the year
  for (const timeValues of measureValues.values()) {
    if (timeValues) {
      // Check month keys
      const monthKeys = ['jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
                        'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026'];
      for (const monthKey of monthKeys) {
        if (monthKey in timeValues) {
          // Extract year from month key (e.g., jan2026 -> 2026 -> FY26)
          const match = monthKey.match(/(\d{4})/);
          if (match) {
            const year = match[1];
            return `FY${year.slice(2)}`; // Convert 2026 to FY26
          }
        }
      }
    }
  }
  // Default fallback
  return 'FY26';
}

/**
 * Create time period rows (Year, Quarters, Months) as children of a dimension row
 */
function createTimeRows(
  parentId: string,
  level: number,
  dimensionPath: string[],
  measureValues: Map<string, GridRow['values']>
): TransformedRow[] {
  const timeRows: TransformedRow[] = [];
  
  // Extract fiscal year from the data
  const fiscalYear = extractFiscalYear(measureValues);
  
  // Year row
  const yearId = `${parentId}-year`;
  const yearMeasureValues = new Map<string, number>();
  measureValues.forEach((timeValues, measureId) => {
    const yearValue = timeValues?.year ?? 0;
    yearMeasureValues.set(measureId, yearValue);
  });
  
  timeRows.push({
    id: yearId,
    name: fiscalYear,
    type: 'year',
    level,
    parentId,
    dimensionPath: [...dimensionPath],
    timeKey: 'year',
    measureValues: yearMeasureValues,
    children: [
      // Q1
      {
        id: `${yearId}-q1`,
        name: 'Q1',
        type: 'quarter',
        level: level + 1,
        parentId: yearId,
        dimensionPath: [...dimensionPath],
        timeKey: 'q1',
        measureValues: new Map(),
        children: quarterMonths.q1.map(monthKey => ({
          id: `${yearId}-q1-${monthKey}`,
          name: getMonthName(monthKey),
          type: 'month',
          level: level + 2,
          parentId: `${yearId}-q1`,
          dimensionPath: [...dimensionPath],
          timeKey: monthKey,
          measureValues: new Map(),
        })),
      },
      // Q2
      {
        id: `${yearId}-q2`,
        name: 'Q2',
        type: 'quarter',
        level: level + 1,
        parentId: yearId,
        dimensionPath: [...dimensionPath],
        timeKey: 'q2',
        measureValues: new Map(),
        children: quarterMonths.q2.map(monthKey => ({
          id: `${yearId}-q2-${monthKey}`,
          name: getMonthName(monthKey),
          type: 'month',
          level: level + 2,
          parentId: `${yearId}-q2`,
          dimensionPath: [...dimensionPath],
          timeKey: monthKey,
          measureValues: new Map(),
        })),
      },
      // Q3
      {
        id: `${yearId}-q3`,
        name: 'Q3',
        type: 'quarter',
        level: level + 1,
        parentId: yearId,
        dimensionPath: [...dimensionPath],
        timeKey: 'q3',
        measureValues: new Map(),
        children: quarterMonths.q3.map(monthKey => ({
          id: `${yearId}-q3-${monthKey}`,
          name: getMonthName(monthKey),
          type: 'month',
          level: level + 2,
          parentId: `${yearId}-q3`,
          dimensionPath: [...dimensionPath],
          timeKey: monthKey,
          measureValues: new Map(),
        })),
      },
      // Q4
      {
        id: `${yearId}-q4`,
        name: 'Q4',
        type: 'quarter',
        level: level + 1,
        parentId: yearId,
        dimensionPath: [...dimensionPath],
        timeKey: 'q4',
        measureValues: new Map(),
        children: quarterMonths.q4.map(monthKey => ({
          id: `${yearId}-q4-${monthKey}`,
          name: getMonthName(monthKey),
          type: 'month',
          level: level + 2,
          parentId: `${yearId}-q4`,
          dimensionPath: [...dimensionPath],
          timeKey: monthKey,
          measureValues: new Map(),
        })),
      },
    ],
  });
  
  // Populate quarter and month values
  timeRows[0].children?.forEach(quarter => {
    if (quarter.timeKey) {
      const quarterMeasureValues = new Map<string, number>();
      measureValues.forEach((timeValues, measureId) => {
        const quarterValue = timeValues?.[quarter.timeKey!] ?? 0;
        quarterMeasureValues.set(measureId, quarterValue);
      });
      quarter.measureValues = quarterMeasureValues;
      
      if (quarter.children) {
        quarter.children.forEach(month => {
          if (month.timeKey) {
            const monthMeasureValues = new Map<string, number>();
            measureValues.forEach((timeValues, measureId) => {
              const monthValue = timeValues?.[month.timeKey!] ?? 0;
              monthMeasureValues.set(measureId, monthValue);
            });
            month.measureValues = monthMeasureValues;
          }
        });
      }
    }
  });
  
  return timeRows;
}

function getMonthName(monthKey: keyof GridRow['values']): string {
  const monthNames: { [key: string]: string } = {
    jan2026: 'Jan',
    feb2026: 'Feb',
    mar2026: 'Mar',
    apr2026: 'Apr',
    may2026: 'May',
    jun2026: 'Jun',
    jul2026: 'Jul',
    aug2026: 'Aug',
    sep2026: 'Sep',
    oct2026: 'Oct',
    nov2026: 'Nov',
    dec2026: 'Dec',
  };
  return monthNames[monthKey] || monthKey.toString();
}

/**
 * Transform dimension row and recursively process children
 */
function transformDimensionRow(
  dimensionRow: GridRow,
  level: number,
  parentId: string | null,
  data: MeasureData[],
  dimensionPath: string[]
): TransformedRow {
  const rowId = `dimension-${dimensionRow.id}`;
  const newPath = [...dimensionPath, dimensionRow.name];
  
  // Collect measure values for this dimension across all measures
  const measureValues = new Map<string, GridRow['values']>();
  
  for (const measure of data) {
    const dimensionInMeasure = findDimensionInMeasure(measure, newPath);
    if (dimensionInMeasure && dimensionInMeasure.values) {
      measureValues.set(measure.id, dimensionInMeasure.values);
    }
  }
  
  
  // Process children (categories or products)
  const children: TransformedRow[] = [];
  if (dimensionRow.children && dimensionRow.children.length > 0) {
    for (const child of dimensionRow.children) {
      children.push(transformDimensionRow(child, level + 1, rowId, data, newPath));
    }
  } else {
    // This is a product (leaf node), add time rows as children
    const timeRows = createTimeRows(rowId, level + 1, newPath, measureValues);
    children.push(...timeRows);
  }
  
  // Calculate aggregated measure values for this dimension (sum of children or time periods)
  const aggregatedMeasureValues = new Map<string, number>();
  measureValues.forEach((timeValues, measureId) => {
    // For dimension rows, use year value as aggregate
    const yearValue = timeValues?.year ?? 0;
    aggregatedMeasureValues.set(measureId, yearValue);
  });
  
  return {
    id: rowId,
    name: dimensionRow.name,
    type: dimensionRow.type as 'account' | 'category' | 'product',
    level,
    parentId,
    children,
    measureValues: aggregatedMeasureValues,
    dimensionPath: newPath,
  };
}

/**
 * Find a dimension row within a measure's hierarchy by matching the dimension path
 */
function findDimensionInMeasure(measure: MeasureData, dimensionPath: string[]): GridRow | null {
  if (!measure.children || dimensionPath.length === 0) {
    return null;
  }
  
  // Find account by name (first element in path)
  const account = measure.children.find(acc => acc.name === dimensionPath[0]);
  if (!account) {
    return null;
  }
  
  if (dimensionPath.length === 1) {
    return account;
  }
  
  // Find category by name (second element in path)
  if (!account.children) {
    return null;
  }
  const category = account.children.find(cat => cat.name === dimensionPath[1]);
  if (!category) {
    return null;
  }
  
  if (dimensionPath.length === 2) {
    return category;
  }
  
  // Find product by name (third element in path)
  if (!category.children) {
    return null;
  }
  const product = category.children.find(prod => prod.name === dimensionPath[2]);
  return product || null;
}

/**
 * Transform data from Measures/Dimensions x Time to Dimensions/Time x Measures layout
 */
export function transformToDimensionsTimeLayout(data: MeasureData[]): TransformedRow[] {
  if (!data || data.length === 0) {
    return [];
  }
  
  try {
    const dimensionHierarchies = extractDimensionHierarchies(data);
    const transformedRows: TransformedRow[] = [];
    
    for (const account of dimensionHierarchies) {
      transformedRows.push(transformDimensionRow(account, 0, null, data, []));
    }
    
    return transformedRows;
  } catch (error) {
    console.error('[layoutTransform] Error transforming layout:', error);
    return [];
  }
}

/**
 * Transform dimension row for Time/Dimensions layout (nested under time periods)
 */
function transformDimensionRowForTimeLayout(
  dimensionRow: GridRow,
  level: number,
  parentId: string | null,
  data: MeasureData[],
  dimensionPath: string[],
  timeKey: keyof GridRow['values']
): TransformedRow {
  const rowId = `dimension-${dimensionRow.id}-${timeKey}`;
  const newPath = [...dimensionPath, dimensionRow.name];
  
  // Collect measure values for this dimension at this specific time period
  const measureValues = new Map<string, number>();
  
  for (const measure of data) {
    const dimensionInMeasure = findDimensionInMeasure(measure, newPath);
    if (dimensionInMeasure && dimensionInMeasure.values) {
      const timeValue = dimensionInMeasure.values[timeKey] || 0;
      measureValues.set(measure.id, timeValue);
    }
  }
  
  // Process children (categories or products)
  const children: TransformedRow[] = [];
  if (dimensionRow.children && dimensionRow.children.length > 0) {
    for (const child of dimensionRow.children) {
      children.push(transformDimensionRowForTimeLayout(child, level + 1, rowId, data, newPath, timeKey));
    }
  }
  
  // Calculate aggregated measure values for this dimension (sum of children)
  const aggregatedMeasureValues = new Map<string, number>();
  if (children.length > 0) {
    // Sum children's values
    children.forEach(child => {
      child.measureValues.forEach((value, measureId) => {
        const current = aggregatedMeasureValues.get(measureId) || 0;
        aggregatedMeasureValues.set(measureId, current + value);
      });
    });
  } else {
    // Leaf node, use direct values
    measureValues.forEach((value, measureId) => {
      aggregatedMeasureValues.set(measureId, value);
    });
  }
  
  return {
    id: rowId,
    name: dimensionRow.name,
    type: dimensionRow.type as 'account' | 'category' | 'product',
    level,
    parentId,
    children,
    measureValues: aggregatedMeasureValues,
    dimensionPath: newPath,
  };
}

/**
 * Create time rows with dimensions nested underneath
 */
function createTimeRowWithDimensions(
  timeKey: keyof GridRow['values'],
  timeName: string,
  level: number,
  parentId: string | null,
  data: MeasureData[]
): TransformedRow {
  const timeId = parentId ? `${parentId}-${timeKey}` : `time-${timeKey}`;
  
  // Get all dimension hierarchies
  const dimensionHierarchies = extractDimensionHierarchies(data);
  
  // Transform dimensions for this time period
  const dimensionChildren: TransformedRow[] = [];
  for (const account of dimensionHierarchies) {
    dimensionChildren.push(transformDimensionRowForTimeLayout(account, level + 1, timeId, data, [], timeKey));
  }
  
  // Aggregate measure values from all dimensions
  const aggregatedMeasureValues = new Map<string, number>();
  dimensionChildren.forEach(dim => {
    dim.measureValues.forEach((value, measureId) => {
      const current = aggregatedMeasureValues.get(measureId) || 0;
      aggregatedMeasureValues.set(measureId, current + value);
    });
  });
  
  return {
    id: timeId,
    name: timeName,
    type: timeKey === 'year' ? 'year' : (timeKey.startsWith('q') ? 'quarter' : 'month'),
    level,
    parentId,
    children: dimensionChildren,
    measureValues: aggregatedMeasureValues,
    timeKey,
    dimensionPath: [],
  };
}

/**
 * Transform data from Measures/Dimensions x Time to Time/Dimensions x Measures layout
 */
export function transformToTimeDimensionsLayout(data: MeasureData[]): TransformedRow[] {
  if (!data || data.length === 0) {
    return [];
  }
  
  try {
    const timeRows: TransformedRow[] = [];
    
    // Create Year row - extract fiscal year from first measure's first product
    let fiscalYear = 'FY26'; // Default fallback
    if (data.length > 0 && data[0].children && data[0].children.length > 0) {
      const firstAccount = data[0].children[0];
      if (firstAccount.children && firstAccount.children.length > 0) {
        const firstCategory = firstAccount.children[0];
        if (firstCategory.children && firstCategory.children.length > 0) {
          const firstProduct = firstCategory.children[0];
          if (firstProduct.values) {
            // Try to find a month key to extract the year
            const monthKeys = ['jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
                              'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026'];
            for (const monthKey of monthKeys) {
              if (monthKey in firstProduct.values) {
                const match = monthKey.match(/(\d{4})/);
                if (match) {
                  const year = match[1];
                  fiscalYear = `FY${year.slice(2)}`;
                  break;
                }
              }
            }
          }
        }
      }
    }
    
    const yearRow = createTimeRowWithDimensions('year', fiscalYear, 0, null, data);
    timeRows.push(yearRow);
    
    // Create Quarter rows
    const quarters: { key: keyof GridRow['values']; name: string }[] = [
      { key: 'q1', name: 'Q1' },
      { key: 'q2', name: 'Q2' },
      { key: 'q3', name: 'Q3' },
      { key: 'q4', name: 'Q4' },
    ];
    
    const quarterRows: TransformedRow[] = [];
    quarters.forEach(quarter => {
      const quarterRow = createTimeRowWithDimensions(quarter.key, quarter.name, 1, yearRow.id, data);
      quarterRows.push(quarterRow);
    });
    yearRow.children = quarterRows;
    
    // Create Month rows under each quarter
    const monthNames: { [key: string]: string } = {
      jan2026: 'Jan',
      feb2026: 'Feb',
      mar2026: 'Mar',
      apr2026: 'Apr',
      may2026: 'May',
      jun2026: 'Jun',
      jul2026: 'Jul',
      aug2026: 'Aug',
      sep2026: 'Sep',
      oct2026: 'Oct',
      nov2026: 'Nov',
      dec2026: 'Dec',
    };
    
    quarterRows.forEach(quarterRow => {
      const quarterKey = quarterRow.timeKey as string;
      const months = quarterMonths[quarterKey] || [];
      const monthRows: TransformedRow[] = [];
      
      months.forEach(monthKey => {
        const monthName = monthNames[monthKey] || monthKey.toString();
        const monthRow = createTimeRowWithDimensions(monthKey, monthName, 2, quarterRow.id, data);
        monthRows.push(monthRow);
      });
      
      quarterRow.children = monthRows;
    });
    
    return timeRows;
  } catch (error) {
    console.error('[layoutTransform] Error transforming to Time/Dimensions layout:', error);
    return [];
  }
}

