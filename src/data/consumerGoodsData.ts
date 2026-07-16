import { MeasureData, GridRow } from '../types';

const monthlyValue = (base: number) => {
  const monthFactors = {
    jan2026: 0.96,
    feb2026: 1.01,
    mar2026: 1.03,
    apr2026: 0.98,
    may2026: 1.00,
    jun2026: 1.02,
    jul2026: 0.99,
    aug2026: 1.04,
    sep2026: 0.97,
    oct2026: 1.01,
    nov2026: 1.00,
    dec2026: 0.99,
  } as const;
  const months = {
    jan2026: Math.round(base * monthFactors.jan2026),
    feb2026: Math.round(base * monthFactors.feb2026),
    mar2026: Math.round(base * monthFactors.mar2026),
    apr2026: Math.round(base * monthFactors.apr2026),
    may2026: Math.round(base * monthFactors.may2026),
    jun2026: Math.round(base * monthFactors.jun2026),
    jul2026: Math.round(base * monthFactors.jul2026),
    aug2026: Math.round(base * monthFactors.aug2026),
    sep2026: Math.round(base * monthFactors.sep2026),
    oct2026: Math.round(base * monthFactors.oct2026),
    nov2026: Math.round(base * monthFactors.nov2026),
    dec2026: Math.round(base * monthFactors.dec2026),
  };
  
  // Calculate quarters
  const q1 = months.jan2026 + months.feb2026 + months.mar2026;
  const q2 = months.apr2026 + months.may2026 + months.jun2026;
  const q3 = months.jul2026 + months.aug2026 + months.sep2026;
  const q4 = months.oct2026 + months.nov2026 + months.dec2026;
  
  // Calculate year (sum of all months)
  const year = q1 + q2 + q3 + q4;
  
  return {
    year,
    h1: q1 + q2,
    h2: q3 + q4,
    q1,
    q2,
    q3,
    q4,
    ...months,
  };
};

// Extreme account-level seasonality for high-contrast heat-map demos.
const seededRandom = (seed: string): number => {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
  }
  return h / 4294967296;
};

const accountMonthlyValue = (base: number, seed: string) => {
  const baseFactors = [0.60, 0.78, 0.98, 1.18, 1.32, 1.55, 1.08, 1.68, 0.72, 1.42, 0.76, 1.24];
  const monthKeys = [
    'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
    'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
  ] as const;
  const months = monthKeys.reduce((acc, monthKey, idx) => {
    const jitter = (seededRandom(`${seed}-${monthKey}`) - 0.5) * 0.34; // +/- 17%
    const factor = Math.max(0.42, Math.min(1.92, baseFactors[idx] + jitter));
    acc[monthKey] = Math.round(base * factor);
    return acc;
  }, {} as Record<typeof monthKeys[number], number>);
  const q1 = months.jan2026 + months.feb2026 + months.mar2026;
  const q2 = months.apr2026 + months.may2026 + months.jun2026;
  const q3 = months.jul2026 + months.aug2026 + months.sep2026;
  const q4 = months.oct2026 + months.nov2026 + months.dec2026;
  const year = q1 + q2 + q3 + q4;
  return { year, h1: q1 + q2, h2: q3 + q4, q1, q2, q3, q4, ...months };
};

// Helper function to create Consumer Goods hierarchy structure
const createConsumerGoodsHierarchy = (
  measureId: string,
  accountBase: number,
  categoryBase: number,
  productBase: number
): GridRow[] => {
  return [
    {
      id: `account-${measureId}`,
      name: 'SnackCo - Midwest Distribution',
      parentId: measureId,
      level: 1,
      type: 'account',
      values: accountMonthlyValue(accountBase, measureId),
      children: [
        {
          id: `category-chips-${measureId}`,
          name: 'Chips & Crisps',
          parentId: `account-${measureId}`,
          level: 2,
          type: 'category',
          values: monthlyValue(categoryBase),
          children: [
            {
              id: `product-chips-1-${measureId}`,
              name: 'Classic Potato Chips',
              parentId: `category-chips-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase),
            },
            {
              id: `product-chips-2-${measureId}`,
              name: 'Tortilla Chips',
              parentId: `category-chips-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase),
            },
            {
              id: `product-chips-3-${measureId}`,
              name: 'Kettle Cooked Chips',
              parentId: `category-chips-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase),
            },
            {
              id: `product-chips-4-${measureId}`,
              name: 'Veggie Crisps',
              parentId: `category-chips-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase),
            },
            {
              id: `product-chips-5-${measureId}`,
              name: 'Pita Chips',
              parentId: `category-chips-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase),
            },
          ],
        },
        {
          id: `category-candy-${measureId}`,
          name: 'Candy & Sweets',
          parentId: `account-${measureId}`,
          level: 2,
          type: 'category',
          values: monthlyValue(categoryBase),
          children: [
            {
              id: `product-candy-1-${measureId}`,
              name: 'Chocolate Bars',
              parentId: `category-candy-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase * 2.5),
            },
            {
              id: `product-candy-2-${measureId}`,
              name: 'Gummy Bears',
              parentId: `category-candy-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase * 2.5),
            },
          ],
        },
      ],
    },
  ];
};

// Consumer Goods Measures based on screenshot
export const consumerGoodsData: MeasureData[] = [
  // Planned Volume
  {
    id: 'measure-planned-volume',
    name: 'Planned Volume',
    values: monthlyValue(950),
    children: createConsumerGoodsHierarchy('measure-planned-volume', 950, 475, 95),
  },
  // PY Volume (Previous Year Volume)
  {
    id: 'measure-py-volume',
    name: 'Previous Year Volume',
    values: monthlyValue(800),
    children: createConsumerGoodsHierarchy('measure-py-volume', 800, 400, 80),
  },
  // Forecasted Volume
  {
    id: 'measure-forecasted-volume',
    name: 'Forecasted Volume',
    values: monthlyValue(1000),
    children: createConsumerGoodsHierarchy('measure-forecasted-volume', 1000, 500, 100),
  },
  // Target Volume
  {
    id: 'measure-target-volume',
    name: 'Target Volume',
    values: monthlyValue(1100),
    children: createConsumerGoodsHierarchy('measure-target-volume', 1100, 550, 110),
  },
  // Revenue
  {
    id: 'measure-revenue',
    name: 'Revenue',
    values: monthlyValue(100000),
    children: createConsumerGoodsHierarchy('measure-revenue', 100000, 50000, 10000),
  },
  // Promo Spend%
  {
    id: 'measure-promo-spend',
    name: 'Promo Spend%',
    values: monthlyValue(12.5), // Percentage values
    children: createConsumerGoodsHierarchy('measure-promo-spend', 12.5, 11.0, 10.5),
  },
  // Market Share%
  {
    id: 'measure-market-share',
    name: 'Market Share%',
    values: monthlyValue(18.5), // Percentage values
    children: createConsumerGoodsHierarchy('measure-market-share', 18.5, 17.0, 16.5),
  },
  // Days of Inventory
  {
    id: 'measure-days-inventory',
    name: 'Days of Inventory',
    values: monthlyValue(45),
    children: createConsumerGoodsHierarchy('measure-days-inventory', 45, 42, 40),
  },
  // Trade Spend ROI
  {
    id: 'measure-trade-spend-roi',
    name: 'Trade Spend ROI',
    values: monthlyValue(3.2), // ROI multiplier
    children: createConsumerGoodsHierarchy('measure-trade-spend-roi', 3.2, 3.0, 2.8),
  },
];
