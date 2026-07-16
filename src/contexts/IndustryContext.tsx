import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { getActiveConfigId } from '../data/planConfigStore';

// A plan-configuration grid uses a synthetic "cfg:<configId>" industry key so all
// the existing industry-driven plumbing (dimension scheme, filters, measures) works.
export type IndustryType =
  | 'manufacturing'
  | 'consumer-goods'
  | 'grid-264'
  | 'manufacturing-deep'
  | 'manufacturing-acme'
  | `cfg:${string}`;

/** Route for the main forecasting grid for the given industry (defaults to manufacturing). */
export function getGridPathForIndustry(industry: IndustryType | null): string {
  if (typeof industry === 'string' && industry.startsWith('cfg:')) return '/grid';
  if (industry === 'consumer-goods') return '/home/consumergoods';
  if (industry === 'grid-264') return '/home/grid-264';
  if (industry === 'manufacturing-deep') return '/home/manufacturing-deep';
  if (industry === 'manufacturing-acme') return '/home/manufacturing-acme';
  return '/home/manufacturing';
}

interface IndustryContextType {
  industry: IndustryType | null;
  setIndustry: (industry: IndustryType) => void;
}

const IndustryContext = createContext<IndustryContextType | undefined>(undefined);

// Helper function to get industry from URL path
const getIndustryFromPath = (path: string): IndustryType | null => {
  if (path === '/home/consumergoods') {
    return 'consumer-goods';
  }
  if (path === '/home/manufacturing') {
    return 'manufacturing';
  }
  if (path === '/home/grid-264') {
    return 'grid-264';
  }
  if (path === '/home/manufacturing-deep') {
    return 'manufacturing-deep';
  }
  if (path === '/home/manufacturing-acme') {
    return 'manufacturing-acme';
  }
  if (path === '/grid') {
    const activeConfigId = getActiveConfigId();
    if (activeConfigId) return `cfg:${activeConfigId}`;
  }
  return null;
};

export const IndustryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize industry from URL path if available (for direct navigation)
  const [industry, setIndustry] = useState<IndustryType | null>(() => {
    if (typeof window !== 'undefined') {
      return getIndustryFromPath(window.location.pathname);
    }
    return null;
  });

  // Sync with URL changes (for browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const industryFromPath = getIndustryFromPath(window.location.pathname);
      if (industryFromPath !== null) {
        setIndustry(industryFromPath);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <IndustryContext.Provider value={{ industry, setIndustry }}>
      {children}
    </IndustryContext.Provider>
  );
};

export const useIndustry = () => {
  const context = useContext(IndustryContext);
  if (context === undefined) {
    throw new Error('useIndustry must be used within an IndustryProvider');
  }
  return context;
};

/**
 * The grid-264 experience is no longer bifurcated from manufacturing: every industry
 * (manufacturing, consumer goods, and grid-264) now renders with the same manufacturing
 * (legacy) grid UX. Kept as a hook so call sites stay unchanged and the split can be
 * re-introduced later if needed.
 */
export function useIsGrid264UpdatedExperience(): boolean {
  return false;
}
