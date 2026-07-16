import React, { useState, useRef, useEffect, useCallback } from 'react';
import '../styles/components/Grid.css';

interface GridToolbarProps {
  onSettingsClick?: () => void;
  onFilterClick?: () => void;
  onNotesClick?: () => void;
  onSortClick?: () => void;
  onChartClick?: () => void;
  onAlertClick?: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  isSettingsActive?: boolean;
  isFilterActive?: boolean;
  isNotesActive?: boolean;
  isSortActive?: boolean;
  isChartActive?: boolean;
  isAlertActive?: boolean;
  activeFilterCount?: number;
  activeSortCount?: number;
  globalSortConfig?: { criteria: Array<{ direction: 'asc' | 'desc' }> };
}

const GridToolbar: React.FC<GridToolbarProps> = ({ 
  onSettingsClick,
  onFilterClick,
  onNotesClick,
  onSortClick,
  onChartClick,
  onAlertClick,
  searchValue = '',
  onSearchChange,
  isSettingsActive = false,
  isFilterActive = false,
  isNotesActive = false,
  isSortActive = false,
  isChartActive = false,
  isAlertActive = false,
  activeFilterCount = 0,
  activeSortCount = 0,
  globalSortConfig,
}) => {
  const [gridSearchInput, setGridSearchInput] = useState<string>(searchValue);
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with external searchValue prop
  useEffect(() => {
    if (searchValue !== gridSearchInput) {
      setGridSearchInput(searchValue);
    }
  }, [searchValue]);

  // Debounced search update
  const handleSearchInputChange = useCallback((value: string) => {
    setGridSearchInput(value);
    
    // Clear existing timer
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }
    
    // Set new timer for debounced update
    searchDebounceTimerRef.current = setTimeout(() => {
      if (onSearchChange) {
        onSearchChange(value);
      }
    }, 300);
  }, [onSearchChange]);

  // Immediate search on Enter
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
      if (onSearchChange) {
        onSearchChange(gridSearchInput);
      }
    } else if (e.key === 'Escape') {
      setGridSearchInput('');
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
      if (onSearchChange) {
        onSearchChange('');
      }
    }
  }, [gridSearchInput, onSearchChange]);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setGridSearchInput('');
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }
    if (onSearchChange) {
      onSearchChange('');
    }
  }, [onSearchChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="grid-toolbar">
      <div className="grid-search">
        <svg className="grid-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="grid-search-input"
          placeholder="Search: measure, dimension, time period (comma-separated).."
          value={gridSearchInput}
          onChange={(e) => handleSearchInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {gridSearchInput && (
          <button
            className="grid-search-clear"
            onClick={handleClearSearch}
            type="button"
            title="Clear search"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      {/* Group 1: Filter + Sort */}
      <div className="grid-button-group">
        <button className={`grid-button-group-item ${isFilterActive ? 'active' : ''}`} title="Filter" onClick={onFilterClick} style={{ position: 'relative' }}>
          <svg fill="currentColor" viewBox="0 0 24 24" width="16" height="16">
            <path d="M4.25 5.61C6.27 8.2 10 13 10 13v6c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-6s3.72-4.8 5.74-7.39c.51-.66.04-1.61-.79-1.61H5.04c-.83 0-1.3.95-.79 1.61z"/>
          </svg>
          {activeFilterCount > 0 && (
            <span className="filter-badge">{activeFilterCount}</span>
          )}
        </button>
        <button
          className={`grid-button-group-item ${isSortActive ? 'active' : ''}`}
          title="Sort"
          onClick={onSortClick}
          style={{ position: 'relative' }}
        >
          {(() => {
            const sortDirection = globalSortConfig?.criteria?.[0]?.direction;
            const sortIconPath = "M16.923 9.84655C17.2922 9.47731 17.2922 8.92343 16.923 8.55419L9.9076 1.47695C9.53837 1.1077 8.98452 1.1077 8.61529 1.47695L1.5384 8.55419C1.16917 8.92343 1.16917 9.47731 1.5384 9.84655L2.8307 11.1389C3.19993 11.5082 3.75377 11.5082 4.123 11.1389L6.33838 8.92344C6.70761 8.55419 7.38453 8.80035 7.38453 9.35422V22.401C7.38453 22.8933 7.8153 23.3241 8.3076 23.3241H10.1537C10.6461 23.3241 11.0768 22.8318 11.0768 22.401V9.35422C11.0768 8.80035 11.7537 8.55419 12.123 8.92344L14.3383 11.1389C14.7076 11.5082 15.2614 11.5082 15.6307 11.1389L16.923 9.84655V9.84655ZM30.4617 22.1535L29.1694 20.9226C28.8001 20.5534 28.2463 20.5534 27.8771 20.9226L25.6617 23.1381C25.2924 23.5074 24.6155 23.2612 24.6155 22.7073V9.53752C24.6155 9.04519 24.1848 8.61441 23.6925 8.61441H21.8463C21.354 8.61441 20.9232 9.10674 20.9232 9.53752V22.5843C20.9232 23.1381 20.2463 23.3843 19.8771 23.015L17.6617 20.7996C17.2925 20.4303 16.7386 20.4303 16.3694 20.7996L15.0771 22.1535C14.7079 22.5227 14.7079 23.0766 15.0771 23.4458L22.154 30.5231C22.5232 30.8923 23.0771 30.8923 23.4463 30.5231L30.5232 23.4458C30.8309 23.0766 30.8309 22.4612 30.4617 22.1535V22.1535Z";
            if (sortDirection === 'asc') {
              return <svg className="sort-icon" width="14" height="14" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}><path fillRule="evenodd" clipRule="evenodd" d={sortIconPath} fill="currentColor"/></svg>;
            } else if (sortDirection === 'desc') {
              return <svg className="sort-icon" width="14" height="14" viewBox="0 0 32 32" fill="none" style={{ transform: 'rotate(180deg)', flexShrink: 0 }}><path fillRule="evenodd" clipRule="evenodd" d={sortIconPath} fill="currentColor"/></svg>;
            } else {
              return <svg className="sort-icon" width="14" height="14" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}><path fillRule="evenodd" clipRule="evenodd" d={sortIconPath} fill="currentColor"/></svg>;
            }
          })()}
          {activeSortCount > 0 && (
            <span className="filter-badge">{activeSortCount}</span>
          )}
        </button>
        <button
          className={`grid-button-group-item ${isChartActive ? 'active' : ''}`}
          title="Chart"
          onClick={onChartClick}
          style={{ position: 'relative' }}
        >
          <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M28.002 14.4174L15.3985 21.3803C14.5378 21.8117 13.5541 21.1955 13.5541 20.2712V5.17447C13.5541 4.55828 12.9393 4.06533 12.386 4.25019C6.23792 5.97552 1.81133 11.9526 2.5491 18.7923C3.22538 25.0159 8.20529 30.0686 14.4763 30.7464C22.6532 31.6091 29.539 25.2623 29.539 17.2518C29.539 16.5124 29.4775 15.773 29.3546 15.0335C29.2316 14.4174 28.5553 14.1093 28.002 14.4174V14.4174ZM17.0581 17.2516L29.1698 10.7816C29.9075 10.4119 30.1535 9.42596 29.6616 8.74815C26.895 4.92776 22.5914 2.15489 17.673 1.35384C16.8122 1.16899 16.013 1.8468 16.013 2.70947V16.6354C16.013 17.19 16.5663 17.4981 17.0581 17.2516V17.2516Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>

      {/* Group 2: Edit Info + Alert Bell */}
      <div className="grid-button-group">
        <button className={`grid-button-group-item ${isNotesActive ? 'active' : ''}`} title="Actions" onClick={onNotesClick}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M12.7383 12.216L12.4614 12.4929C12.1537 12.8006 11.7537 12.9544 11.3229 12.9544H10.5229C9.78444 12.9544 8.98444 12.3698 8.98444 11.3544V10.5852C8.98444 9.96983 9.26137 9.6006 9.41521 9.38522L12.7383 6.0006C12.8306 5.90829 12.9229 5.69291 12.9229 5.56983V3.01599C12.9229 2.21599 12.246 1.53906 11.446 1.53906H3.56907C2.76908 1.53906 2.09215 2.27752 2.09215 3.01599H1.59985C1.046 3.01599 0.615234 3.47752 0.615234 4.03137C0.615234 4.58522 1.046 5.01599 1.59985 5.01599H2.09215V7.01599H1.59985C1.046 7.01599 0.615234 7.44676 0.615234 8.0006C0.615234 8.55445 1.046 8.98522 1.59985 8.98522H2.09215V10.9852H1.59985C1.046 10.9852 0.615234 11.4468 0.615234 11.9698C0.615234 12.5237 1.046 12.9544 1.59985 12.9544H2.09215C2.09215 13.9391 2.76908 14.4314 3.56907 14.4314H11.446C12.246 14.4314 12.9229 13.7544 12.9229 12.9544V12.3083C12.9229 12.1544 12.8614 12.1237 12.7383 12.216V12.216ZM10.2153 5.262C10.2153 5.53892 9.99987 5.75431 9.72295 5.75431H4.79988C4.52296 5.75431 4.30758 5.53892 4.30758 5.262V4.76969C4.30758 4.49277 4.52296 4.27738 4.79988 4.27738H9.72295C9.99987 4.27738 10.2153 4.49277 10.2153 4.76969V5.262ZM7.99988 11.2317C7.99988 11.5086 7.78449 11.724 7.50757 11.724H4.79988C4.52296 11.724 4.30758 11.5086 4.30758 11.2317V10.7394C4.30758 10.4624 4.52296 10.2471 4.79988 10.2471H7.50757C7.78449 10.2471 7.99988 10.4624 7.99988 10.7394V11.2317ZM8.73834 8.24728C8.73834 8.5242 8.52295 8.73959 8.24603 8.73959H4.79988C4.52296 8.73959 4.30758 8.5242 4.30758 8.24728V7.75497C4.30758 7.47805 4.52296 7.26267 4.79988 7.26267H8.24603C8.52295 7.26267 8.73834 7.47805 8.73834 7.75497V8.24728ZM15.2306 6.89245L14.9229 6.58476C14.7383 6.40014 14.4306 6.40014 14.246 6.58476L10.4922 10.4617C10.4614 10.4617 10.4614 10.5232 10.4614 10.5232V11.354C10.4614 11.4155 10.4614 11.4771 10.523 11.4771H11.323C11.3537 11.4771 11.3845 11.4463 11.4153 11.4463L15.1999 7.63091C15.446 7.41553 15.446 7.10784 15.2306 6.89245V6.89245Z" fill="currentColor"/>
          </svg>
        </button>
        <button className={`grid-button-group-item ${isAlertActive ? 'active' : ''}`} title="Alerts" onClick={onAlertClick}>
          <svg fill="currentColor" viewBox="0 0 24 24" width="16" height="16">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
          </svg>
        </button>
      </div>

      {/* Settings — standalone, last */}
      <div className="grid-button-group">
        <button className={`grid-button-group-item ${isSettingsActive ? 'active' : ''}`} title="Settings" onClick={onSettingsClick}>
          <svg fill="currentColor" viewBox="0 0 24 24" width="16" height="16">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default GridToolbar;

