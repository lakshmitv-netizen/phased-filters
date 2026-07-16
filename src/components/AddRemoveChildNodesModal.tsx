import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/AddRemoveChildNodesModal.css';

interface ChildNode {
  id: string;
  name: string;
  isSelected: boolean; // Whether this node is currently a child of the parent
}

export interface QuickFilterCriteria {
  filterColumn: string | null; // The column being filtered (e.g., 'users', 'condition', 'status', 'dimension')
  selectedValues: string[]; // Selected values for that column (e.g., ['John Doe', 'Jane Smith']) or node IDs when filterColumn is 'dimension'
}

interface AddRemoveChildNodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddChildNode?: (nodeIds: string[]) => void;
  onRemoveChildNode?: (nodeIds: string[]) => void;
  onApplyQuickFilter?: (criteria: QuickFilterCriteria | null) => void; // Callback to apply quick filter
  nodeName?: string;
  nodeType?: 'account' | 'category' | 'product';
  childrenNodes?: ChildNode[]; // All available children nodes
  frozenColumns?: Array<{ id: string; name: string }>; // Visible frozen columns
  anchorElement?: HTMLElement | null; // Element to position popover relative to
  currentFilter?: QuickFilterCriteria | null; // Current active filter to show in UI
}

// Helper function to get target achievement percentage (same logic as GridRow)
const getTargetAchievementPct = (rowId: string, colKey: string): number => {
  // Deterministic pseudo-random from rowId + colKey + 'targetAchievement'
  let h = 5381;
  const seed = `${rowId}-${colKey}-targetAchievement`;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
  }
  const rand = h / 4294967296;
  if (rand < 0.18) {
    return Math.round(4 + rand * 170); // roughly 4% to low-30s
  }
  if (rand > 0.78) {
    return Math.round(100 + (rand - 0.78) / 0.22 * 35); // 100% to 135%
  }
  return Math.round(55 + ((rand - 0.18) / 0.60) * 45); // 55% to 100%
};

// Helper function to get frozen column value for a node (same logic as GridRow)
const getFrozenColumnValue = (colId: string, nodeId: string): string => {
  // Deterministic pseudo-random from nodeId + colId
  let h = 5381;
  const seed = `${nodeId}-${colId}`;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
  }
  const rand = h / 4294967296;
  
  switch (colId) {
    case 'users': {
      const userNames = [
        'John Doe', 'Jane Smith', 'Michael Johnson', 'Sarah Williams', 
        'David Brown', 'Emily Davis', 'Robert Miller', 'Lisa Wilson',
        'James Moore', 'Jennifer Taylor', 'William Anderson', 'Maria Martinez',
        'Richard Jackson', 'Patricia White', 'Joseph Harris', 'Linda Martin'
      ];
      return userNames[Math.floor(rand * userNames.length)];
    }
    case 'status': {
      const statuses = ['Active', 'Inactive'];
      return statuses[Math.floor(rand * statuses.length)];
    }
    case 'region':
      return ['North', 'South', 'East', 'West', 'Central', 'Northeast', 'Northwest'][Math.floor(rand * 7)];
    case 'team':
      return ['Team A', 'Team B', 'Team C', 'Team Alpha', 'Team Beta', 'Team Gamma'][Math.floor(rand * 6)];
    case 'condition': {
      // Determine condition based on target achievement percentage
      // Use first time key as reference for consistency
      const firstTimeKey = 'jan2026';
      const achievementPct = getTargetAchievementPct(nodeId, firstTimeKey);
      
      if (achievementPct >= 100) {
        return 'Excellent';
      } else if (achievementPct >= 80) {
        return 'Good';
      } else {
        return 'Needs Attention';
      }
    }
    case 'trend':
      return ['Up', 'Down', 'Stable'][Math.floor(rand * 3)];
    default:
      return '';
  }
};

const AddRemoveChildNodesModal: React.FC<AddRemoveChildNodesModalProps> = ({
  isOpen,
  onClose,
  onAddChildNode,
  onRemoveChildNode,
  onApplyQuickFilter,
  nodeName = 'Node',
  nodeType,
  childrenNodes = [],
  frozenColumns = [],
  anchorElement = null,
  currentFilter = null
}) => {
  
  const popoverRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [initialSelectedNodes, setInitialSelectedNodes] = useState<Set<string>>(new Set());
  const [selectedFilterColumn, setSelectedFilterColumn] = useState<string | null>(null);
  const [selectedFilterValue, setSelectedFilterValue] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Always include child dimension as first option, then add visible frozen columns
  const filterColumns = useMemo(() => {
    // Map parent type to child type
    let dimensionName = 'Dimension';
    if (nodeType === 'account') {
      dimensionName = 'Category';
    } else if (nodeType === 'category') {
      dimensionName = 'Product';
    } else if (nodeType === 'product') {
      dimensionName = 'Product'; // Products don't have children, so keep as Product
    }
    
    return [
      { id: 'dimension', name: dimensionName },
      ...frozenColumns
    ];
  }, [frozenColumns, nodeType]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      // Only initialize once when modal first opens
      if (!isInitializedRef.current) {
        setSearchTerm('');
        
        // Initialize filter column from currentFilter or default to first column
        if (currentFilter && currentFilter.filterColumn) {
          setSelectedFilterColumn(currentFilter.filterColumn);
          // Select nodes that match the current filter values
          const nodesToSelect = new Set<string>();
          if (currentFilter.filterColumn === 'dimension') {
            // For dimension filters, selectedValues contains node IDs directly
            currentFilter.selectedValues.forEach(nodeId => {
              if (childrenNodes.some(node => node.id === nodeId)) {
                nodesToSelect.add(nodeId);
              }
            });
          } else {
            // For frozen column filters, selectedValues contains column values
            childrenNodes.forEach(node => {
              const nodeValue = getFrozenColumnValue(currentFilter.filterColumn!, node.id);
              if (currentFilter.selectedValues.includes(nodeValue)) {
                nodesToSelect.add(node.id);
              }
            });
          }
          setSelectedNodes(nodesToSelect);
          setInitialSelectedNodes(nodesToSelect);
        } else {
          // If no frozen columns, always use 'dimension' filter
          const initialColumn = (!frozenColumns || frozenColumns.length === 0) ? 'dimension' : (filterColumns.length > 0 ? filterColumns[0].id : null);
          setSelectedFilterColumn(prev => prev || initialColumn);
          // Initialize selected nodes with currently selected children
          const currentlySelected = new Set(
            childrenNodes.filter(node => node.isSelected).map(node => node.id)
          );
          setSelectedNodes(new Set(currentlySelected));
          setInitialSelectedNodes(new Set(currentlySelected));
        }
        
        setSelectedFilterValue(null);
        setIsDropdownOpen(false);
        isInitializedRef.current = true;
      }
    } else {
      // Reset when modal closes
      // If no frozen columns, keep it as 'dimension', otherwise reset to null
      if (!frozenColumns || frozenColumns.length === 0) {
        setSelectedFilterColumn('dimension');
      } else {
        setSelectedFilterColumn(null);
      }
      isInitializedRef.current = false;
    }
  }, [isOpen, filterColumns, currentFilter]);

  // Get unique values for the selected frozen column
  const getUniqueColumnValues = (columnId: string): string[] => {
    if (!columnId || columnId === 'dimension') {
      // For dimension, return all children (no filtering)
      return [];
    }
    const values = new Set<string>();
    childrenNodes.forEach(node => {
      const value = getFrozenColumnValue(columnId, node.id);
      if (value) {
        values.add(value);
      }
    });
    return Array.from(values).sort();
  };

  const uniqueColumnValues = selectedFilterColumn ? getUniqueColumnValues(selectedFilterColumn) : [];

  // Group child nodes by frozen column value
  const getGroupedByColumnValue = (): Array<{ value: string; nodeIds: string[] }> => {
    if (!selectedFilterColumn || selectedFilterColumn === 'dimension') {
      return [];
    }
    
    const grouped = new Map<string, string[]>();
    childrenNodes.forEach(node => {
      const columnValue = getFrozenColumnValue(selectedFilterColumn, node.id);
      if (columnValue) {
        if (!grouped.has(columnValue)) {
          grouped.set(columnValue, []);
        }
        grouped.get(columnValue)!.push(node.id);
      }
    });
    
    return Array.from(grouped.entries())
      .map(([value, nodeIds]) => ({ value, nodeIds }))
      .sort((a, b) => a.value.localeCompare(b.value));
  };

  const groupedByColumnValue = getGroupedByColumnValue();

  // Filter nodes based on selected frozen column value
  const getFilteredChildrenNodes = (): ChildNode[] => {
    if (!selectedFilterColumn || selectedFilterColumn === 'dimension' || !selectedFilterValue) {
      // No filter or dimension selected - show all children
      return childrenNodes;
    }
    
    // Filter by frozen column value
    return childrenNodes.filter(node => {
      const nodeValue = getFrozenColumnValue(selectedFilterColumn, node.id);
      return nodeValue === selectedFilterValue;
    });
  };

  const filteredByColumnNodes = getFilteredChildrenNodes();

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen || !isDropdownOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isDropdownOpen]);

  // Filter nodes based on search term (applied to already filtered-by-column nodes)
  const filteredNodes = searchTerm.trim()
    ? filteredByColumnNodes.filter(node =>
        node.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : filteredByColumnNodes;

  // Filter frozen column value groups by search term when a frozen column is selected
  const filteredGroupedByColumnValue = selectedFilterColumn && selectedFilterColumn !== 'dimension' && searchTerm.trim()
    ? groupedByColumnValue.filter(group =>
        group.value.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : groupedByColumnValue;

  // Sort nodes: selected first, then alphabetically
  const sortedNodes = [...filteredNodes].sort((a, b) => {
    const aSelected = selectedNodes.has(a.id);
    const bSelected = selectedNodes.has(b.id);
    if (aSelected !== bSelected) {
      return aSelected ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const handleToggleNode = (nodeId: string) => {
    setSelectedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  // Handle toggling a frozen column value (toggles all nodes with that value)
  const handleToggleColumnValue = (columnValue: string) => {
    const group = groupedByColumnValue.find(g => g.value === columnValue);
    if (!group) return;
    
    setSelectedNodes(prev => {
      const newSet = new Set(prev);
      const allSelected = group.nodeIds.every(id => newSet.has(id));
      
      if (allSelected) {
        // Deselect all nodes in this group
        group.nodeIds.forEach(id => newSet.delete(id));
      } else {
        // Select all nodes in this group
        group.nodeIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  // Check if a frozen column value group is fully selected
  const isColumnValueGroupSelected = (columnValue: string): boolean => {
    const group = groupedByColumnValue.find(g => g.value === columnValue);
    if (!group || group.nodeIds.length === 0) return false;
    return group.nodeIds.every(id => selectedNodes.has(id));
  };

  // Check if a frozen column value group is partially selected
  const isColumnValueGroupIndeterminate = (columnValue: string): boolean => {
    const group = groupedByColumnValue.find(g => g.value === columnValue);
    if (!group || group.nodeIds.length === 0) return false;
    const selectedCount = group.nodeIds.filter(id => selectedNodes.has(id)).length;
    return selectedCount > 0 && selectedCount < group.nodeIds.length;
  };

  const handleToggleAll = () => {
    if (selectedFilterColumn && selectedFilterColumn !== 'dimension' && filteredGroupedByColumnValue.length > 0) {
      // Toggle all frozen column value groups (respecting search filter)
      const allSelected = filteredGroupedByColumnValue.every(group => isColumnValueGroupSelected(group.value));
      setSelectedNodes(prev => {
        const newSet = new Set(prev);
        if (allSelected) {
          // Deselect all filtered groups
          filteredGroupedByColumnValue.forEach(group => {
            group.nodeIds.forEach(id => newSet.delete(id));
          });
        } else {
          // Select all filtered groups
          filteredGroupedByColumnValue.forEach(group => {
            group.nodeIds.forEach(id => newSet.add(id));
          });
        }
        return newSet;
      });
    } else {
      // Toggle all child nodes
      const allSelected = filteredNodes.every(node => selectedNodes.has(node.id));
      if (allSelected) {
        // Deselect all filtered nodes
        setSelectedNodes(prev => {
          const newSet = new Set(prev);
          filteredNodes.forEach(node => newSet.delete(node.id));
          return newSet;
        });
      } else {
        // Select all filtered nodes
        setSelectedNodes(prev => {
          const newSet = new Set(prev);
          filteredNodes.forEach(node => newSet.add(node.id));
          return newSet;
        });
      }
    }
  };

  // Calculate "All" checkbox state
  const allFilteredSelected = selectedFilterColumn && selectedFilterColumn !== 'dimension' && filteredGroupedByColumnValue.length > 0
    ? filteredGroupedByColumnValue.length > 0 && filteredGroupedByColumnValue.every(group => isColumnValueGroupSelected(group.value))
    : filteredNodes.length > 0 && filteredNodes.every(node => selectedNodes.has(node.id));
  
  const someFilteredSelected = selectedFilterColumn && selectedFilterColumn !== 'dimension' && filteredGroupedByColumnValue.length > 0
    ? filteredGroupedByColumnValue.some(group => isColumnValueGroupSelected(group.value) || isColumnValueGroupIndeterminate(group.value))
    : filteredNodes.some(node => selectedNodes.has(node.id));

  // Calculate popover position
  const getPopoverPosition = () => {
    if (!anchorElement) return { top: 0, left: 0 };
    
    const rect = anchorElement.getBoundingClientRect();
    const popoverWidth = 350;
    const popoverHeight = 400;
    
    // Position popover to the right of the 3-dot button
    let left = rect.right + 8;
    let top = rect.top;
    
    // If not enough space on the right, position on the left
    if (left + popoverWidth > window.innerWidth) {
      left = rect.left - popoverWidth - 8;
    }
    
    // Ensure popover stays in viewport
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (top + popoverHeight > window.innerHeight) {
      top = window.innerHeight - popoverHeight - 8;
    }
    
    return { top, left };
  };

  const position = getPopoverPosition();

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          anchorElement && !anchorElement.contains(e.target as Node)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, anchorElement, onClose]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    
    // Determine which nodes were added and which were removed
    const addedNodes: string[] = [];
    const removedNodes: string[] = [];

    // Check all nodes (not just filtered) to see what changed
    childrenNodes.forEach(node => {
      const wasSelected = initialSelectedNodes.has(node.id);
      const isNowSelected = selectedNodes.has(node.id);

      if (!wasSelected && isNowSelected) {
        addedNodes.push(node.id);
      } else if (wasSelected && !isNowSelected) {
        removedNodes.push(node.id);
      }
    });

    // Call appropriate callbacks
    if (addedNodes.length > 0 && onAddChildNode) {
      onAddChildNode(addedNodes);
    }
    if (removedNodes.length > 0 && onRemoveChildNode) {
      onRemoveChildNode(removedNodes);
    }

    // Apply quick filter
    if (onApplyQuickFilter) {
      if (selectedFilterColumn === 'dimension') {
        // Filter by selected node IDs
        const selectedNodeIds = Array.from(selectedNodes);
        if (selectedNodeIds.length === 0 || selectedNodeIds.length === childrenNodes.length) {
          // No nodes selected or all nodes selected - clear filter
          onApplyQuickFilter(null);
        } else {
          // Filter by selected node IDs
          onApplyQuickFilter({
            filterColumn: 'dimension',
            selectedValues: selectedNodeIds
          });
        }
      } else if (selectedFilterColumn && groupedByColumnValue.length > 0) {
        // Get selected values for the current filter column
        // Include a value if ANY node with that value is selected
        const selectedValues: string[] = [];
        groupedByColumnValue.forEach(group => {
          // Check if any node in this group is selected
          if (group.nodeIds.some(id => selectedNodes.has(id))) {
            selectedValues.push(group.value);
          }
        });

        // If all values are selected (meaning all groups have at least one selected node), clear the filter (no filter needed)
        const allValues = groupedByColumnValue.map(g => g.value);
        const allSelected = allValues.length > 0 && selectedValues.length === allValues.length;
        
        if (allSelected) {
          onApplyQuickFilter(null);
        } else if (selectedValues.length > 0) {
          onApplyQuickFilter({
            filterColumn: selectedFilterColumn,
            selectedValues: selectedValues
          });
        } else {
          // No values selected, clear filter
          onApplyQuickFilter(null);
        }
      } else {
        // No filter column selected - clear filter
        onApplyQuickFilter(null);
      }
    }

    onClose();
  };

  const handleCancel = () => {
    setSearchTerm('');
    setSelectedNodes(new Set(initialSelectedNodes));
    onClose();
  };

  return createPortal(
    <>
      {/* Backdrop overlay */}
      <div className="add-remove-child-nodes-popover-backdrop" onClick={onClose} />
      
      {/* Popover */}
      <div
        ref={popoverRef}
        className="add-remove-child-nodes-popover"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nubbin */}
        {anchorElement && (
          <div className="add-remove-child-nodes-popover-nubbin" />
        )}
        
        <div className="add-remove-child-nodes-popover-body">
          {/* Filter Column Dropdown */}
          {frozenColumns && frozenColumns.length > 0 && (
            <div className="add-remove-child-nodes-filter-group">
              <label className="add-remove-child-nodes-filter-label">Filter</label>
              <div className="add-remove-child-nodes-filter-dropdown-wrapper" ref={dropdownRef}>
                <button
                  type="button"
                  className="add-remove-child-nodes-filter-dropdown-trigger"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <span className="add-remove-child-nodes-filter-dropdown-value">
                    {filterColumns.find(col => col.id === selectedFilterColumn)?.name || 'Select filter...'}
                  </span>
                  <svg
                    className="add-remove-child-nodes-filter-dropdown-icon"
                    width="12"
                    height="8"
                    viewBox="0 0 12 8"
                    fill="none"
                    style={{ 
                      transform: isDropdownOpen ? 'rotate(180deg)' : 'none', 
                      transition: 'transform 0.15s'
                    }}
                  >
                    <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {isDropdownOpen && (
                  <div 
                    className="add-remove-child-nodes-filter-dropdown-menu"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    {filterColumns.map((column) => (
                      <button
                        key={column.id}
                        type="button"
                        className={`add-remove-child-nodes-filter-dropdown-item ${selectedFilterColumn === column.id ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFilterColumn(column.id);
                          setSelectedFilterValue(null); // Reset filter value when changing column
                          setIsDropdownOpen(false);
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        {column.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search Input */}
          <div className="add-remove-child-nodes-search-section">
            <input
              type="text"
              className="add-remove-child-nodes-search-input"
              placeholder="Search children nodes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Checkbox List */}
          <div className="add-remove-child-nodes-checkbox-list">
            {/* "All" Checkbox */}
            {((selectedFilterColumn && selectedFilterColumn !== 'dimension' && filteredGroupedByColumnValue.length > 0) || filteredNodes.length > 0) && (
              <label className="add-remove-child-nodes-checkbox-item add-remove-child-nodes-checkbox-all">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={handleToggleAll}
                  ref={(input) => {
                    if (input) input.indeterminate = someFilteredSelected && !allFilteredSelected;
                  }}
                  className="add-remove-child-nodes-checkbox"
                />
                <span className="add-remove-child-nodes-checkbox-label">All</span>
              </label>
            )}

            {/* Empty State */}
            {(() => {
              const showEmptyForGrouped = selectedFilterColumn && selectedFilterColumn !== 'dimension' && filteredGroupedByColumnValue.length === 0;
              const showEmptyForNodes = !selectedFilterColumn || selectedFilterColumn === 'dimension' || filteredGroupedByColumnValue.length === 0;
              const shouldShowEmpty = showEmptyForGrouped || (showEmptyForNodes && sortedNodes.length === 0);
              return shouldShowEmpty ? (
                <div className="add-remove-child-nodes-empty-state">
                  {searchTerm.trim() ? 'No nodes found' : 'No children nodes available'}
                </div>
              ) : null;
            })()}

            {/* Node Checkboxes - Show frozen column values when a frozen column is selected */}
            {selectedFilterColumn && selectedFilterColumn !== 'dimension' && filteredGroupedByColumnValue.length > 0 ? (
              // Show checkboxes for frozen column values
              filteredGroupedByColumnValue.map((group) => {
                const isSelected = isColumnValueGroupSelected(group.value);
                const isIndeterminate = isColumnValueGroupIndeterminate(group.value);
                return (
                  <label
                    key={group.value}
                    className="add-remove-child-nodes-checkbox-item"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      ref={(input) => {
                        if (input) input.indeterminate = isIndeterminate;
                      }}
                      onChange={() => handleToggleColumnValue(group.value)}
                      className="add-remove-child-nodes-checkbox"
                    />
                    <span className="add-remove-child-nodes-checkbox-label">{group.value}</span>
                  </label>
                );
              })
            ) : (
              // Show checkboxes for child nodes (dimension mode)
              sortedNodes.map((node) => (
                <label
                  key={node.id}
                  className="add-remove-child-nodes-checkbox-item"
                  onClick={() => handleToggleNode(node.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedNodes.has(node.id)}
                    onChange={() => handleToggleNode(node.id)}
                    className="add-remove-child-nodes-checkbox"
                  />
                  <span className="add-remove-child-nodes-checkbox-label">{node.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
        <div className="add-remove-child-nodes-popover-footer">
          <button
            type="button"
            onClick={handleCancel}
            className="add-remove-child-nodes-button-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={false}
            className="add-remove-child-nodes-button-confirm"
          >
            Confirm
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};

export default AddRemoveChildNodesModal;
