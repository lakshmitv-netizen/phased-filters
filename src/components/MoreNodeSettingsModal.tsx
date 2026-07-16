import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/MoreNodeSettingsModal.css';
import { MeasureData } from '../types';
import { buildHierarchyPath } from '../utils/cellInfoUtils';
import { findRowById, getAllDescendants, flattenHierarchy } from '../utils/valuePropagation';

interface MoreNodeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReplaceNode?: () => void;
  onDeleteNode?: () => void;
  onReparentNode?: (parentNodeId: string | null) => void;
  nodeName?: string;
  nodeId?: string;
  nodeType?: 'account' | 'category' | 'product';
  data?: MeasureData[];
  anchorElement?: HTMLElement | null; // Element to position popover relative to
}

type SelectedAction = 'replace' | 'reparent' | 'delete' | null;

const MoreNodeSettingsModal: React.FC<MoreNodeSettingsModalProps> = ({
  isOpen,
  onClose,
  onReplaceNode,
  onDeleteNode,
  onReparentNode,
  nodeName = 'Node',
  nodeId,
  nodeType,
  data = [],
  anchorElement = null
}) => {
  const [selectedAction, setSelectedAction] = useState<SelectedAction>(null);
  const [selectedReplaceValue, setSelectedReplaceValue] = useState<string>('');
  const [replaceSearchTerm, setReplaceSearchTerm] = useState<string>('');
  const [isReplaceDropdownOpen, setIsReplaceDropdownOpen] = useState(false);
  const [replaceDropdownPosition, setReplaceDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [parentSearchTerm, setParentSearchTerm] = useState<string>('');
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false);
  const [parentDropdownPosition, setParentDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const replaceDropdownRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const parentDropdownRef = useRef<HTMLDivElement>(null);
  const parentInputRef = useRef<HTMLInputElement>(null);

  // Get available replacement nodes based on node type (same level, not in grid)
  const getAvailableReplaceNodes = (): string[] => {
    if (nodeType === 'account') {
      // Other accounts not currently in the grid
      return [
        'MagnaDrive - Europe',
        'MagnaDrive - Asia Pacific',
        'MagnaDrive - South America',
        'TechCorp Industries',
        'Global Manufacturing Co.',
        'Advanced Systems Inc.',
        'Precision Components Ltd.'
      ];
    } else if (nodeType === 'category') {
      // Other categories at the same level
      return [
        'Engine Components',
        'Electrical Systems',
        'Cooling Systems',
        'Brake Systems',
        'Suspension Components',
        'Body Parts',
        'Interior Components'
      ];
    } else if (nodeType === 'product') {
      // Other products at the same level
      return [
        'TRN-003',
        'TRN-004',
        'TRN-005',
        'CC-003',
        'CC-004',
        'CC-005',
        'ENG-001',
        'ENG-002',
        'ELC-001',
        'ELC-002'
      ];
    }
    // Default fallback
    return [
      'Option 1',
      'Option 2',
      'Option 3'
    ];
  };

  const availableReplaceNodes = getAvailableReplaceNodes();

  // Filter nodes based on search term
  const filteredReplaceNodes = replaceSearchTerm.trim()
    ? availableReplaceNodes.filter(node =>
        node.toLowerCase().includes(replaceSearchTerm.toLowerCase())
      )
    : availableReplaceNodes;

  // Get hierarchical path for current node
  const hierarchicalPath = useMemo((): string[] => {
    if (!nodeId || !data || data.length === 0) return [];
    try {
      return buildHierarchyPath(nodeId, data);
    } catch (error) {
      console.error('Error building hierarchical path:', error);
      return [];
    }
  }, [nodeId, data]);

  // Get available parent nodes (excluding current node and its descendants)
  const availableParentNodes = useMemo((): Array<{ id: string; name: string; path: string[] }> => {
    if (!nodeId || !data || data.length === 0) return [];
    
    try {
      const currentRow = findRowById(nodeId, data);
      if (!currentRow) return [];

      // Get all descendants to exclude them
      const descendants = getAllDescendants(nodeId, data);
      const descendantIds = new Set([nodeId, ...descendants.map(d => d.id)]);
      
      // Flatten all rows from all measures
      const allRows = flattenHierarchy(data);
      
      // Filter: exclude current node, its descendants, and nodes that are the same type or lower level
      const availableParents = allRows
        .filter(row => {
          // Exclude current node and descendants
          if (descendantIds.has(row.id)) return false;
          
          // Only include nodes that can be parents (accounts can parent categories/products, categories can parent products)
          if (nodeType === 'account') {
            // Accounts can only be reparented under other accounts (but not themselves)
            return row.type === 'account' && row.id !== nodeId;
          } else if (nodeType === 'category') {
            // Categories can be reparented under accounts
            return row.type === 'account';
          } else if (nodeType === 'product') {
            // Products can be reparented under categories or accounts
            return row.type === 'category' || row.type === 'account';
          }
          
          return false;
        })
        .map(row => {
          try {
            return {
              id: row.id,
              name: row.name,
              path: buildHierarchyPath(row.id, data)
            };
          } catch (error) {
            console.error('Error building path for node:', row.id, error);
            return {
              id: row.id,
              name: row.name,
              path: []
            };
          }
        });

      return availableParents;
    } catch (error) {
      console.error('Error getting available parent nodes:', error);
      return [];
    }
  }, [nodeId, data, nodeType]);

  // Filter parent nodes based on search term
  const filteredParentNodes = parentSearchTerm.trim()
    ? availableParentNodes.filter(node =>
        node.name.toLowerCase().includes(parentSearchTerm.toLowerCase()) ||
        node.path.some(p => p.toLowerCase().includes(parentSearchTerm.toLowerCase()))
      )
    : availableParentNodes;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedAction('replace'); // Default to first tab
      setSelectedReplaceValue('');
      setReplaceSearchTerm('');
      setIsReplaceDropdownOpen(false);
      setSelectedParentId(null);
      setParentSearchTerm('');
      setIsParentDropdownOpen(false);
    }
  }, [isOpen]);

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (isReplaceDropdownOpen && replaceInputRef.current) {
      const rect = replaceInputRef.current.getBoundingClientRect();
      setReplaceDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    } else {
      setReplaceDropdownPosition(null);
    }
  }, [isReplaceDropdownOpen]);

  // Calculate parent dropdown position when it opens
  useEffect(() => {
    if (isParentDropdownOpen && parentInputRef.current) {
      const rect = parentInputRef.current.getBoundingClientRect();
      setParentDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    } else {
      setParentDropdownPosition(null);
    }
  }, [isParentDropdownOpen]);

  // Close replace dropdown when clicking outside
  useEffect(() => {
    if (!isOpen || !isReplaceDropdownOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (replaceDropdownRef.current && !replaceDropdownRef.current.contains(e.target as Node) &&
          replaceInputRef.current && !replaceInputRef.current.contains(e.target as Node)) {
        setIsReplaceDropdownOpen(false);
        setReplaceSearchTerm('');
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isReplaceDropdownOpen]);

  // Close parent dropdown when clicking outside
  useEffect(() => {
    if (!isOpen || !isParentDropdownOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (parentDropdownRef.current && !parentDropdownRef.current.contains(e.target as Node) &&
          parentInputRef.current && !parentInputRef.current.contains(e.target as Node)) {
        setIsParentDropdownOpen(false);
        setParentSearchTerm('');
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isParentDropdownOpen]);

  // Calculate popover position
  const getPopoverPosition = () => {
    if (!anchorElement) return { top: 0, left: 0 };
    
    const rect = anchorElement.getBoundingClientRect();
    const popoverWidth = 320;
    const popoverHeight = 250;
    
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

  const handleTabSelect = (action: SelectedAction) => {
    setSelectedAction(action);
  };

  const handleReplaceSelect = (value: string) => {
    setSelectedReplaceValue(value);
    setIsReplaceDropdownOpen(false);
    setReplaceSearchTerm('');
  };

  const handleParentSelect = (parentId: string) => {
    setSelectedParentId(parentId);
    setIsParentDropdownOpen(false);
    setParentSearchTerm('');
  };

  const getSelectedParentName = (): string => {
    if (!selectedParentId) return '';
    const parent = availableParentNodes.find(p => p.id === selectedParentId);
    if (!parent) return '';
    return parent.path.length > 0 ? `${parent.path.join(' > ')} > ${parent.name}` : parent.name;
  };

  const handleConfirm = () => {
    switch (selectedAction) {
      case 'replace':
        if (onReplaceNode && selectedReplaceValue) {
          onReplaceNode();
        }
        break;
      case 'reparent':
        if (onReparentNode) {
          onReparentNode(selectedParentId);
        }
        break;
      case 'delete':
        if (onDeleteNode) {
          onDeleteNode();
        }
        break;
    }
    setSelectedAction('replace');
    setSelectedReplaceValue('');
    setSelectedParentId(null);
    onClose();
  };

  const handleCancel = () => {
    setSelectedAction('replace');
    onClose();
  };


  return createPortal(
    <>
      {/* Backdrop overlay */}
      <div className="more-node-settings-popover-backdrop" onClick={onClose} />
      
      {/* Popover */}
      <div
        ref={popoverRef}
        className="more-node-settings-popover"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nubbin */}
        {anchorElement && (
          <div className="more-node-settings-popover-nubbin" />
        )}
        
        {/* Tabs */}
        <div className="more-node-settings-popover-tabs">
          <button
            type="button"
            onClick={() => handleTabSelect('replace')}
            className={`more-node-settings-tab ${selectedAction === 'replace' ? 'more-node-settings-tab-active' : ''}`}
          >
            Replace Node
          </button>
          <button
            type="button"
            onClick={() => handleTabSelect('reparent')}
            className={`more-node-settings-tab ${selectedAction === 'reparent' ? 'more-node-settings-tab-active' : ''}`}
          >
            Reparent Node
          </button>
          <button
            type="button"
            onClick={() => handleTabSelect('delete')}
            className={`more-node-settings-tab ${selectedAction === 'delete' ? 'more-node-settings-tab-active' : ''}`}
          >
            Delete Node
          </button>
        </div>

        {/* Tab Content */}
        <div className="more-node-settings-popover-body">
          {selectedAction === 'replace' && (
            <div className="more-node-settings-tab-content">
              <p className="more-node-settings-tab-content-description">
                The current node will be replaced along with all its children.
              </p>
              <div className="more-node-settings-replace-dropdown-wrapper">
                <div className="more-node-settings-replace-dropdown-container">
                  <input
                    ref={replaceInputRef}
                    type="text"
                    className="more-node-settings-replace-dropdown-input"
                    value={isReplaceDropdownOpen ? replaceSearchTerm : selectedReplaceValue}
                    onChange={(e) => setReplaceSearchTerm(e.target.value)}
                    onFocus={() => setIsReplaceDropdownOpen(true)}
                    placeholder="Search and select a node..."
                    onClick={(e) => e.stopPropagation()}
                  />
                  {!isReplaceDropdownOpen && (
                    <svg
                      className="more-node-settings-replace-dropdown-icon"
                      width="12"
                      height="8"
                      viewBox="0 0 12 8"
                      fill="none"
                      onClick={() => replaceInputRef.current?.focus()}
                    >
                      <path d="M1 1.5L6 6.5L11 1.5" stroke="#5C5C5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>
              {/* Dropdown menu rendered via portal */}
              {isReplaceDropdownOpen && replaceDropdownPosition && createPortal(
                <div
                  ref={replaceDropdownRef}
                  className="more-node-settings-replace-dropdown-menu"
                  style={{
                    position: 'fixed',
                    top: `${replaceDropdownPosition.top}px`,
                    left: `${replaceDropdownPosition.left}px`,
                    width: `${replaceDropdownPosition.width}px`
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {filteredReplaceNodes.length > 0 ? (
                    filteredReplaceNodes.map((node, index) => (
                      <div
                        key={index}
                        className={`more-node-settings-replace-dropdown-option ${selectedReplaceValue === node ? 'selected' : ''}`}
                        onClick={() => handleReplaceSelect(node)}
                      >
                        {node}
                      </div>
                    ))
                  ) : (
                    <div className="more-node-settings-replace-dropdown-no-results">No results found</div>
                  )}
                </div>,
                document.body
              )}
            </div>
          )}
          {selectedAction === 'reparent' && (
            <div className="more-node-settings-tab-content">
              <p className="more-node-settings-tab-content-description">
                Move this node under a different parent.
              </p>
              
              {/* Current hierarchical path */}
              {hierarchicalPath.length > 0 && (
                <div className="more-node-settings-reparent-path">
                  <div className="more-node-settings-reparent-path-label">Current path:</div>
                  <div className="more-node-settings-reparent-path-value">
                    {hierarchicalPath.length > 0 ? hierarchicalPath.join(' > ') + ' > ' : ''}<strong>{nodeName}</strong>
                  </div>
                </div>
              )}

              {/* Parent selector dropdown */}
              <div className="more-node-settings-replace-dropdown-wrapper">
                <div className="more-node-settings-replace-dropdown-container">
                  <input
                    ref={parentInputRef}
                    type="text"
                    className="more-node-settings-replace-dropdown-input"
                    value={isParentDropdownOpen ? parentSearchTerm : getSelectedParentName()}
                    onChange={(e) => setParentSearchTerm(e.target.value)}
                    onFocus={() => setIsParentDropdownOpen(true)}
                    placeholder="Search and select a parent node..."
                    onClick={(e) => e.stopPropagation()}
                  />
                  {!isParentDropdownOpen && (
                    <svg
                      className="more-node-settings-replace-dropdown-icon"
                      width="12"
                      height="8"
                      viewBox="0 0 12 8"
                      fill="none"
                      onClick={() => parentInputRef.current?.focus()}
                    >
                      <path d="M1 1.5L6 6.5L11 1.5" stroke="#5C5C5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>
              {/* Parent dropdown menu rendered via portal */}
              {isParentDropdownOpen && parentDropdownPosition && createPortal(
                <div
                  ref={parentDropdownRef}
                  className="more-node-settings-replace-dropdown-menu"
                  style={{
                    position: 'fixed',
                    top: `${parentDropdownPosition.top}px`,
                    left: `${parentDropdownPosition.left}px`,
                    width: `${parentDropdownPosition.width}px`,
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {filteredParentNodes.length > 0 ? (
                    filteredParentNodes.map((node) => {
                      const displayText = node.path.length > 0 
                        ? `${node.path.join(' > ')} > ${node.name}`
                        : node.name;
                      return (
                        <div
                          key={node.id}
                          className={`more-node-settings-replace-dropdown-option ${selectedParentId === node.id ? 'selected' : ''}`}
                          onClick={() => handleParentSelect(node.id)}
                        >
                          {displayText}
                        </div>
                      );
                    })
                  ) : (
                    <div className="more-node-settings-replace-dropdown-no-results">No results found</div>
                  )}
                </div>,
                document.body
              )}
            </div>
          )}
          {selectedAction === 'delete' && (
            <div className="more-node-settings-tab-content">
              <p className="more-node-settings-tab-content-text">Permanently delete this node and all its children.</p>
            </div>
          )}
        </div>
        <div className="more-node-settings-popover-footer">
          <button
            type="button"
            onClick={handleCancel}
            className="more-node-settings-button-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={(selectedAction === 'replace' && !selectedReplaceValue) || (selectedAction === 'reparent' && !selectedParentId)}
            className="more-node-settings-button-confirm"
          >
            Confirm
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};

export default MoreNodeSettingsModal;
