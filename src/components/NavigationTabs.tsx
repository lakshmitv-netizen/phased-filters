import React from 'react';
import '../styles/components/NavigationTabs.css';

const NavigationTabs: React.FC = () => {
  const tabs = [
    'Home',
    'Analytics',
    'Opportunities',
    'Leads',
    'Tasks',
    'Forecasting & Planning',
    'Accounts',
    'Contacts',
    'Dashboards',
    'More',
  ];

  return (
    <nav className="navigation-tabs">
      {tabs.map((tab, index) => (
        <button
          key={index}
          className={`nav-tab ${tab === 'Forecasting & Planning' ? 'active' : ''}`}
        >
          {tab}
          {tab === 'More' && (
            <svg className="more-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
      ))}
    </nav>
  );
};

export default NavigationTabs;





