import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useIndustry } from '../contexts/IndustryContext';

/**
 * Component that syncs the URL path with the industry context.
 * Must be placed inside Router but can be anywhere in the component tree.
 */
const IndustryUrlSync: React.FC = () => {
  const location = useLocation();
  const { setIndustry } = useIndustry();

  useEffect(() => {
    const path = location.pathname;
    if (path === '/home/consumergoods') {
      setIndustry('consumer-goods');
    } else if (path === '/home/manufacturing') {
      setIndustry('manufacturing');
    } else if (path === '/home/grid-264') {
      setIndustry('grid-264');
    } else if (path === '/home/manufacturing-deep') {
      setIndustry('manufacturing-deep');
    } else if (path === '/home/manufacturing-acme') {
      setIndustry('manufacturing-acme');
    } else if (path === '/home') {
      // Reset to null when on selection page so user can choose
      // Note: We can't directly set null, so we'll leave it as is
      // The selection page will set it when user clicks
    }
    // For /grid and other routes, don't change industry (keep current)
  }, [location.pathname, setIndustry]);

  return null; // This component doesn't render anything
};

export default IndustryUrlSync;
