import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadHierarchyRows,
  saveHierarchyRows,
  levelNamesForRow,
  type HierarchyRow,
} from '../data/hierarchyStore';
import '../styles/components/ManageHierarchiesModal.css';

const imgCloseIcon =
  "data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M18 6L6 18M6 6l12 12' stroke='%23666' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E";
const imgDownIcon =
  "data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M7 9L3 5h8L7 9z' fill='%23747474'/%3E%3C/svg%3E";

const CREATE_PANEL_ANIMATION_MS = 260;
const DIMENSIONS: Array<'Account' | 'Product'> = ['Account', 'Product'];

type CreateLevel = { id: number; level: number; name: string; isEditable: boolean };

type Dimension = 'Account' | 'Product';

const makeDefaultLevels = (): CreateLevel[] =>
  Array.from({ length: 5 }, (_, i) => ({ id: i, level: i, name: '', isEditable: true }));

/** Nicely formatted date used when a hierarchy is created/cloned. */
const today = (): string =>
  new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const levelStructureOf = (row: HierarchyRow): string => {
  const names = levelNamesForRow(row);
  return `${names.length} Levels`;
};

export interface HierarchyChangeToast {
  message: string;
  description?: string;
}

interface ManageHierarchiesModalProps {
  isOpen: boolean;
  /** Called when the modal closes. When a change was made while open (create /
   *  clone / edit / delete), the last change summary is passed so the parent can
   *  show a success toast after the modal has closed. */
  onClose: (result?: HierarchyChangeToast) => void;
  onGoToSetup?: () => void;
}

const ManageHierarchiesModal: React.FC<ManageHierarchiesModalProps> = ({
  isOpen,
  onClose,
  onGoToSetup,
}) => {
  const [hierarchies, setHierarchies] = useState<HierarchyRow[]>(() => loadHierarchyRows());
  const [selectedDimension, setSelectedDimension] = useState<Dimension>('Account');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // Summary of the last change made while the modal is open. Passed to onClose so
  // the parent can show a success toast once the modal has closed.
  const [changeSummary, setChangeSummary] = useState<HierarchyChangeToast | null>(null);

  const handleCloseModal = () => {
    onClose(changeSummary ?? undefined);
    setChangeSummary(null);
  };

  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [isCreatePanelClosing, setIsCreatePanelClosing] = useState(false);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [isEditPanelClosing, setIsEditPanelClosing] = useState(false);
  const [selectedHierarchy, setSelectedHierarchy] = useState<HierarchyRow | null>(null);
  const [editLevelNames, setEditLevelNames] = useState<string[]>([]);

  const [createHierarchyName, setCreateHierarchyName] = useState('');
  const [createDimension, setCreateDimension] = useState<Dimension>('Account');
  const [createNumLevels, setCreateNumLevels] = useState(5);
  const [createLevelMenuIndex, setCreateLevelMenuIndex] = useState<number | null>(null);
  const [createLevels, setCreateLevels] = useState<CreateLevel[]>(makeDefaultLevels);
  // When set, the create panel is being used to clone an existing hierarchy.
  const [cloneSourceName, setCloneSourceName] = useState<string | null>(null);

  const createCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredHierarchies = useMemo(
    () => hierarchies.filter((h) => h.dim === selectedDimension),
    [hierarchies, selectedDimension],
  );

  // Persist every change so the Plan Configuration builder reads it back.
  useEffect(() => {
    saveHierarchyRows(hierarchies);
  }, [hierarchies]);

  // Close any open dropdown when clicking outside of it.
  useEffect(() => {
    if (openMenuId === null && createLevelMenuIndex === null) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.mh2-dropdown-wrapper') && !target.closest('.mh2-clone-level-dropdown-wrapper')) {
        setOpenMenuId(null);
        setCreateLevelMenuIndex(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenuId, createLevelMenuIndex]);

  useEffect(() => {
    return () => {
      if (createCloseTimeoutRef.current) clearTimeout(createCloseTimeoutRef.current);
      if (editCloseTimeoutRef.current) clearTimeout(editCloseTimeoutRef.current);
    };
  }, []);

  const resetCreateForm = () => {
    setCreateHierarchyName('');
    setCreateDimension(selectedDimension);
    setCreateNumLevels(5);
    setCreateLevelMenuIndex(null);
    setCreateLevels(makeDefaultLevels());
    setCloneSourceName(null);
  };

  const openCreatePanel = () => {
    if (createCloseTimeoutRef.current) {
      clearTimeout(createCloseTimeoutRef.current);
      createCloseTimeoutRef.current = null;
    }
    if (editCloseTimeoutRef.current) {
      clearTimeout(editCloseTimeoutRef.current);
      editCloseTimeoutRef.current = null;
    }
    setEditPanelOpen(false);
    setIsEditPanelClosing(false);
    setSelectedHierarchy(null);
    setIsCreatePanelClosing(false);
    setCreatePanelOpen(true);
    resetCreateForm();
  };

  // Open the create panel prefilled from an existing hierarchy (clone).
  // Reuses the create panel so the user can add/delete levels and rename freely.
  const openClonePanel = (hierarchy: HierarchyRow) => {
    if (createCloseTimeoutRef.current) {
      clearTimeout(createCloseTimeoutRef.current);
      createCloseTimeoutRef.current = null;
    }
    if (editCloseTimeoutRef.current) {
      clearTimeout(editCloseTimeoutRef.current);
      editCloseTimeoutRef.current = null;
    }
    setEditPanelOpen(false);
    setIsEditPanelClosing(false);
    setSelectedHierarchy(null);
    setIsCreatePanelClosing(false);
    setCreatePanelOpen(true);

    const names = levelNamesForRow(hierarchy);
    const source = names.length > 0 ? names : ['', '', '', '', ''];
    const levels: CreateLevel[] = source.map((name, i) => ({ id: i, level: i, name, isEditable: true }));
    setCreateDimension(hierarchy.dim);
    setSelectedDimension(hierarchy.dim);
    setCreateHierarchyName(`Clone of ${hierarchy.name}`);
    setCreateLevels(levels);
    setCreateNumLevels(levels.length);
    setCreateLevelMenuIndex(null);
    setCloneSourceName(hierarchy.name);
  };

  const closeCreatePanel = () => {
    setIsCreatePanelClosing(true);
    createCloseTimeoutRef.current = setTimeout(() => {
      setCreatePanelOpen(false);
      setIsCreatePanelClosing(false);
      resetCreateForm();
      createCloseTimeoutRef.current = null;
    }, CREATE_PANEL_ANIMATION_MS);
  };

  const openEditPanel = (hierarchy: HierarchyRow) => {
    if (createCloseTimeoutRef.current) {
      clearTimeout(createCloseTimeoutRef.current);
      createCloseTimeoutRef.current = null;
    }
    if (editCloseTimeoutRef.current) {
      clearTimeout(editCloseTimeoutRef.current);
      editCloseTimeoutRef.current = null;
    }
    setCreatePanelOpen(false);
    setIsCreatePanelClosing(false);
    setEditPanelOpen(true);
    setIsEditPanelClosing(false);
    setSelectedHierarchy(hierarchy);
    const names = levelNamesForRow(hierarchy);
    setEditLevelNames(names.length > 0 ? names : ['Enter Name', 'Enter Name', 'Enter Name', 'Enter Name', 'Enter Name']);
  };

  const closeEditPanel = () => {
    setIsEditPanelClosing(true);
    editCloseTimeoutRef.current = setTimeout(() => {
      setEditPanelOpen(false);
      setIsEditPanelClosing(false);
      setSelectedHierarchy(null);
      setEditLevelNames([]);
      editCloseTimeoutRef.current = null;
    }, CREATE_PANEL_ANIMATION_MS);
  };

  const toggleCreateLevelMenu = (index: number) => {
    setCreateLevelMenuIndex(createLevelMenuIndex === index ? null : index);
  };

  const handleCreateLevelNameChange = (index: number, value: string) => {
    setCreateLevels((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name: value };
      return updated;
    });
  };

  const handleAddCreateLevel = (index: number) => {
    const newLevels = [...createLevels];
    const maxId = Math.max(...newLevels.map((level) => level.id));
    newLevels.splice(index + 1, 0, { id: maxId + 1, level: newLevels[index].level + 1, name: '', isEditable: true });
    for (let i = index + 2; i < newLevels.length; i += 1) newLevels[i].level = i;
    setCreateLevels(newLevels);
    setCreateNumLevels(newLevels.length);
    setCreateLevelMenuIndex(null);
  };

  const handleDeleteCreateLevel = (index: number) => {
    if (createLevels.length > 1) {
      const newLevels = createLevels
        .filter((_, levelIndex) => levelIndex !== index)
        .map((level, levelIndex) => ({ ...level, level: levelIndex }));
      setCreateLevels(newLevels);
      setCreateNumLevels(newLevels.length);
    }
    setCreateLevelMenuIndex(null);
  };

  const handleSaveCreateHierarchy = () => {
    const trimmedName = createHierarchyName.trim();
    if (!trimmedName) return;
    const levelNames = createLevels.map((level) => level.name.trim() || 'Enter Name');
    const created: HierarchyRow = {
      id: `new-${Date.now()}`,
      name: trimmedName,
      active: false,
      dim: createDimension,
      levels: levelNames.length,
      levelNames,
      status: 'requested',
      dataStatus: 'Not Synced',
      sync: '—',
      createdOn: today(),
    };
    setHierarchies((prev) => [created, ...prev]);
    setSelectedDimension(createDimension);
    const wasClone = Boolean(cloneSourceName);
    closeCreatePanel();
    setChangeSummary({
      message: wasClone ? 'Hierarchy cloned successfully' : 'Hierarchy created successfully',
      description: `"${trimmedName}" is now available.`,
    });
  };

  const toggleMenu = (hierarchyId: string) => {
    setOpenMenuId(openMenuId === hierarchyId ? null : hierarchyId);
  };

  const handleMenuAction = (action: 'edit' | 'duplicate' | 'delete', hierarchy: HierarchyRow) => {
    setOpenMenuId(null);
    if (action === 'edit') {
      openEditPanel(hierarchy);
      return;
    }
    if (action === 'duplicate') {
      openClonePanel(hierarchy);
      return;
    }
    if (action === 'delete') {
      setHierarchies((prev) => prev.filter((item) => item.id !== hierarchy.id));
      setChangeSummary({
        message: 'Hierarchy deleted successfully',
        description: `"${hierarchy.name}" has been removed.`,
      });
    }
  };

  const handleEditLevelNameChange = (index: number, value: string) => {
    setEditLevelNames((prev) => prev.map((name, i) => (i === index ? value : name)));
  };

  const handleSaveEditedHierarchy = () => {
    if (!selectedHierarchy) return;
    const normalized = editLevelNames.map((name) => name.trim() || 'Enter Name');
    setHierarchies((prev) =>
      prev.map((h) =>
        h.id === selectedHierarchy.id ? { ...h, levelNames: normalized, levels: normalized.length } : h,
      ),
    );
    const editedName = selectedHierarchy.name;
    closeEditPanel();
    setChangeSummary({
      message: 'Hierarchy updated successfully',
      description: `Changes to "${editedName}" have been saved.`,
    });
  };

  const handleGoToSetup = () => {
    handleCloseModal();
    onGoToSetup?.();
  };

  if (!isOpen) return null;

  return (
    <div className="mh2-modal-overlay" onClick={handleCloseModal}>
      <div className="mh2-modal-container mh2-modal-hierarchies-2" onClick={(e) => e.stopPropagation()}>
        <div className="mh2-modal-header mh2-modal-header-simple">
          <h2 className="mh2-modal-title">Manage Hierarchies</h2>
          <button className="mh2-modal-close-button" onClick={handleCloseModal}>
            <img src={imgCloseIcon} alt="Close" />
          </button>
        </div>

        <div
          className={`mh2-modal-body-simple mh2-manage-hierarchies-2-body ${
            createPanelOpen || editPanelOpen ? 'mh2-panel-fullwidth' : ''
          }`}
        >
          {!(createPanelOpen || editPanelOpen) && (
            <div className="mh2-manage-hierarchies-2-panel mh2-manage-hierarchies-2-panel-left">
              <p className="mh2-manage-hierarchies-2-panel-title">Dimensions</p>
              <div className="mh2-manage-hierarchies-2-dimension-list">
                {DIMENSIONS.map((dimension) => (
                  <button
                    key={dimension}
                    type="button"
                    className={`mh2-manage-hierarchies-2-dimension-item ${
                      selectedDimension === dimension ? 'mh2-active' : ''
                    }`}
                    onClick={() => setSelectedDimension(dimension)}
                  >
                    {dimension}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mh2-manage-hierarchies-2-panel mh2-manage-hierarchies-2-panel-right">
            <div className="mh2-manage-hierarchies-2-panel-header">
              {createPanelOpen ? (
                <>
                  <div className="mh2-manage-hierarchies-2-create-header-left">
                    <button type="button" className="mh2-manage-hierarchies-2-back-button" onClick={closeCreatePanel}>
                      <span className="mh2-back-arrow" aria-hidden="true">←</span>
                      Back to list
                    </button>
                    <p className="mh2-manage-hierarchies-2-panel-title">
                      {cloneSourceName ? `Clone of ${cloneSourceName}` : `New ${createDimension} Hierarchy`}
                    </p>
                  </div>
                  <div className="mh2-edit-panel-header-actions">
                    <button
                      type="button"
                      className="mh2-edit-panel-text-button mh2-edit-panel-text-button-cancel"
                      onClick={closeCreatePanel}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="mh2-edit-panel-text-button mh2-edit-panel-text-button-save"
                      onClick={handleSaveCreateHierarchy}
                    >
                      Save
                    </button>
                  </div>
                </>
              ) : editPanelOpen ? (
                <>
                  <div className="mh2-manage-hierarchies-2-create-header-left">
                    <button type="button" className="mh2-manage-hierarchies-2-back-button" onClick={closeEditPanel}>
                      <span className="mh2-back-arrow" aria-hidden="true">←</span>
                      Back to list
                    </button>
                    <p className="mh2-manage-hierarchies-2-panel-title">Edit Hierarchy</p>
                  </div>
                  <div className="mh2-edit-panel-header-actions">
                    <button
                      type="button"
                      className="mh2-edit-panel-text-button mh2-edit-panel-text-button-cancel"
                      onClick={closeEditPanel}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="mh2-edit-panel-text-button mh2-edit-panel-text-button-save"
                      onClick={handleSaveEditedHierarchy}
                    >
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mh2-manage-hierarchies-2-panel-title">
                    Available Hierarchies ({filteredHierarchies.length})
                  </p>
                  <button type="button" className="mh2-hierarchies-create-button" onClick={openCreatePanel}>
                    Create New
                  </button>
                </>
              )}
            </div>

            {!(createPanelOpen || editPanelOpen) && (
              <div className="mh2-measures-info-bar" style={{ margin: '0 0 8px' }}>
                <span className="mh2-measures-info-bar-text">Need more context on these hierarchies?</span>
                <button className="mh2-measures-info-bar-link" onClick={handleGoToSetup}>
                  Go to Setup for more details
                </button>
              </div>
            )}

            <div className="mh2-manage-hierarchies-2-content-stage">
              <div className="mh2-manage-hierarchies-2-table-container">
                <table className="mh2-manage-hierarchies-2-table">
                  <thead>
                    <tr>
                      <th>Hierarchy Name</th>
                      <th>No. of Levels</th>
                      <th className="mh2-table-cell-actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHierarchies.length === 0 && (
                      <tr>
                        <td colSpan={3} className="mh2-empty-state">
                          <p className="mh2-empty-state-title">No hierarchies created</p>
                          <p className="mh2-empty-state-subtitle">Click on Create New to create the hierarchy</p>
                        </td>
                      </tr>
                    )}
                    {filteredHierarchies.map((hierarchy) => (
                      <tr key={hierarchy.id}>
                        <td>
                          <button
                            type="button"
                            className="mh2-manage-hierarchies-2-link mh2-manage-hierarchies-2-link-button"
                            onClick={() => openEditPanel(hierarchy)}
                          >
                            {hierarchy.name}
                          </button>
                        </td>
                        <td>{levelStructureOf(hierarchy)}</td>
                        <td className="mh2-table-cell-actions">
                          <div className="mh2-dropdown-wrapper">
                            <button
                              type="button"
                              className="mh2-table-row-dropdown"
                              onClick={() => toggleMenu(hierarchy.id)}
                            >
                              <img src={imgDownIcon} alt="Actions" />
                            </button>
                            {openMenuId === hierarchy.id && (
                              <div className="mh2-dropdown-menu">
                                <button
                                  type="button"
                                  className="mh2-dropdown-menu-item"
                                  onClick={() => handleMenuAction('edit', hierarchy)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="mh2-dropdown-menu-item"
                                  onClick={() => handleMenuAction('duplicate', hierarchy)}
                                >
                                  Clone
                                </button>
                                <div className="mh2-dropdown-menu-divider"></div>
                                <button
                                  type="button"
                                  className="mh2-dropdown-menu-item mh2-dropdown-menu-item-danger"
                                  onClick={() => handleMenuAction('delete', hierarchy)}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {createPanelOpen && (
                <div
                  className={`mh2-edit-panel-body mh2-manage-hierarchies-2-create-body ${
                    isCreatePanelClosing ? 'mh2-slide-out' : 'mh2-slide-in'
                  }`}
                >
                  <div className="mh2-form-card">
                  <div className="mh2-clone-form-section">
                    <label className="mh2-clone-form-label">
                      <span className="mh2-required-asterisk">*</span> New Hierarchy Name
                    </label>
                    <input
                      type="text"
                      className="mh2-clone-form-input"
                      value={createHierarchyName}
                      onChange={(e) => setCreateHierarchyName(e.target.value)}
                      placeholder="Enter Hierarchy Name"
                    />
                  </div>

                  <div className="mh2-clone-form-section">
                    <div className="mh2-clone-form-label-row">
                      <label className="mh2-clone-form-label">Enter Number of Levels for your hierarchy</label>
                      <button type="button" className="mh2-clone-info-icon">
                        ⓘ
                      </button>
                    </div>
                    <div className="mh2-clone-level-control">
                      <button
                        type="button"
                        className="mh2-clone-level-button"
                        onClick={() => {
                          if (createLevels.length > 1) {
                            const newLevels = createLevels.slice(0, -1);
                            setCreateLevels(newLevels);
                            setCreateNumLevels(newLevels.length);
                          }
                        }}
                      >
                        −
                      </button>
                      <span className="mh2-clone-level-value">{createNumLevels}</span>
                      <button
                        type="button"
                        className="mh2-clone-level-button"
                        onClick={() => {
                          const newLevels = [...createLevels];
                          const maxId = Math.max(...newLevels.map((level) => level.id));
                          newLevels.push({ id: maxId + 1, level: newLevels.length, name: '', isEditable: true });
                          setCreateLevels(newLevels);
                          setCreateNumLevels(newLevels.length);
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="mh2-clone-hierarchy-table">
                    <div className="mh2-clone-table-header">
                      <div className="mh2-clone-table-header-cell">Hierarchy Level</div>
                      <div className="mh2-clone-table-header-cell">Name</div>
                      <div className="mh2-clone-table-header-cell mh2-clone-table-header-actions"></div>
                    </div>
                    <div className="mh2-clone-table-body">
                      {createLevels.map((levelData, index) => {
                        const isLastLevel = index === createLevels.length - 1;
                        const indentClass = levelData.level > 0 ? `mh2-clone-table-row-indent-${levelData.level}` : '';
                        return (
                          <div key={levelData.id} className={`mh2-clone-table-row ${indentClass}`}>
                            <div className="mh2-clone-table-cell">
                              {isLastLevel ? (
                                <button type="button" className="mh2-clone-chevron-empty"></button>
                              ) : (
                                <button type="button" className="mh2-clone-chevron">
                                  ›
                                </button>
                              )}
                              <span className="mh2-clone-level-text">
                                {createDimension} L{levelData.level}
                              </span>
                            </div>
                            <div className="mh2-clone-table-cell">
                              <input
                                type="text"
                                className="mh2-clone-name-input"
                                placeholder="Enter Name"
                                value={levelData.name}
                                onChange={(e) => handleCreateLevelNameChange(index, e.target.value)}
                              />
                            </div>
                            <div className="mh2-clone-table-cell mh2-clone-table-cell-actions">
                              <div className="mh2-clone-level-dropdown-wrapper">
                                <button
                                  type="button"
                                  className="mh2-clone-level-dropdown-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCreateLevelMenu(index);
                                  }}
                                >
                                  <img src={imgDownIcon} alt="Actions" />
                                </button>
                                {createLevelMenuIndex === index && (
                                  <div className="mh2-clone-level-dropdown-menu">
                                    <button
                                      type="button"
                                      className="mh2-clone-level-dropdown-item"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddCreateLevel(index);
                                      }}
                                    >
                                      Add Level
                                    </button>
                                    <button
                                      type="button"
                                      className="mh2-clone-level-dropdown-item"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteCreateLevel(index);
                                      }}
                                    >
                                      Delete Level
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  </div>
                </div>
              )}

              {editPanelOpen && (
                <div
                  className={`mh2-edit-panel-body mh2-manage-hierarchies-2-edit-body ${
                    isEditPanelClosing ? 'mh2-slide-out' : 'mh2-slide-in'
                  }`}
                >
                  <div className="mh2-form-card">
                  <div className="mh2-edit-panel-section-title">
                    <p>{selectedHierarchy?.name || 'Hierarchy'}</p>
                  </div>

                  <div className="mh2-edit-panel-notification">
                    <div className="mh2-notification-icon">ⓘ</div>
                    <p className="mh2-notification-text">
                      You can only edit the level names but not no.of levels. If you want to
                      change the no.of levels,{' '}
                      <button
                        type="button"
                        className="mh2-notification-clone-link"
                        onClick={() => selectedHierarchy && openClonePanel(selectedHierarchy)}
                      >
                        Clone this hierarchy
                      </button>.
                    </p>
                  </div>

                  <div className="mh2-edit-panel-tree">
                    <div className="mh2-tree-header">
                      <div className="mh2-tree-header-cell">Hierarchy Level</div>
                      <div className="mh2-tree-header-cell">Name</div>
                    </div>

                    {editLevelNames.map((levelName, index) => {
                      const rowClass = index > 0 ? `mh2-tree-row mh2-tree-row-level-${index}` : 'mh2-tree-row';
                      const isLastLevel = index === editLevelNames.length - 1;
                      return (
                        <div key={`${selectedHierarchy?.id || 'hierarchy'}-level-${index}`} className={rowClass}>
                          <div className="mh2-tree-cell">
                            <button type="button" className={`mh2-tree-chevron ${isLastLevel ? 'mh2-tree-chevron-empty' : ''}`}>
                              ›
                            </button>
                            <span className="mh2-tree-node-link">
                              {selectedHierarchy?.dim || 'Account'} L{index}
                            </span>
                          </div>
                          <div className="mh2-tree-cell">
                            <input
                              type="text"
                              className="mh2-tree-input"
                              value={levelName}
                              onChange={(e) => handleEditLevelNameChange(index, e.target.value)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mh2-modal-footer">
          <button
            className="mh2-modal-cancel-button"
            onClick={handleCloseModal}
            disabled={createPanelOpen || editPanelOpen}
          >
            Cancel
          </button>
          <button
            className="mh2-modal-save-button"
            onClick={handleCloseModal}
            disabled={createPanelOpen || editPanelOpen}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManageHierarchiesModal;
