import React, { useState, useRef, useEffect } from 'react';
import MeasureToast from './MeasureToast';
import '../styles/pages/ReviewMeasuresModal.css';

export interface Measure {
  id: number;
  name: string;
  description?: string;
  type: string;
  sourceDmo?: string;
  code?: string;
  aggregation: string;
  disaggregation?: string;
  category?: string;
  subsets: string[];
  unit: string;
  dataType: string;
  sourceName?: string;
  dataSource?: string;
  measureCode?: string;
  precision?: string;
  formula?: string;
  selected?: boolean;
  /** User-created (or cloned) measure — its Data Source is fixed and not editable. */
  isCustom?: boolean;
}

interface ReviewMeasuresModalProps {
  isOpen: boolean;
  onClose: () => void;
  measures: Measure[];
  setMeasures: React.Dispatch<React.SetStateAction<Measure[]>>;
}

interface AiMessage {
  role: 'ai' | 'user';
  content: string;
  measureData?: GeneratedMeasure | null;
}

interface GeneratedMeasure {
  name: string;
  type: string;
  description: string;
  valueType: string;
  roundingPrecision: string;
  aggregationRule: string;
  formula: string;
  measureCode: string;
  sourceDMO: string;
  subsets: string[];
}

const imgCloseIcon = "data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M18 6L6 18M6 6l12 12' stroke='%23666' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E";
const imgSearchIcon = "data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='6.5' cy='6.5' r='4.5' stroke='%23666' stroke-width='1.5'/%3E%3Cpath d='M10 10l3.5 3.5' stroke='%23666' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E";
const imgDownIcon = "data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M7 9L3 5h8L7 9z' fill='%23747474'/%3E%3C/svg%3E";
const imgSparkleIcon = "data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20.2695 15.4912L16.0808 17.5755C14.8224 18.2027 13.8045 19.2172 13.1753 20.4715L11.084 24.6463C10.7879 25.2427 9.93041 25.2427 9.6343 24.6463L7.54304 20.4715C6.91381 19.2172 5.89594 18.2027 4.63748 17.5755L0.448789 15.4912C-0.149596 15.196 -0.149596 14.3414 0.448789 14.0463L4.63748 11.9619C5.89594 11.3348 6.91381 10.3203 7.54304 9.06597L9.6343 4.89114C9.93041 4.29473 10.7879 4.29473 11.084 4.89114L13.1753 9.06597C13.8045 10.3203 14.8224 11.3348 16.0808 11.9619L20.2695 14.0463C20.8679 14.3414 20.8679 15.196 20.2695 15.4912ZM29.4057 24.7754L27.6105 23.8777C27.0677 23.6133 26.6358 23.1706 26.3644 22.6357L25.4637 20.8465C25.3404 20.5883 24.9702 20.5883 24.8407 20.8465L23.94 22.6357C23.6748 23.1768 23.2306 23.6072 22.6939 23.8777L20.8987 24.7754C20.6397 24.8984 20.6397 25.2673 20.8987 25.3964L22.6939 26.2941C23.2368 26.5585 23.6686 27.0012 23.94 27.5361L24.8407 29.3253C24.9641 29.5835 25.3342 29.5835 25.4637 29.3253L26.3644 27.5361C26.6297 26.995 27.0738 26.5646 27.6105 26.2941L29.4057 25.3964C29.6648 25.2734 29.6648 24.9045 29.4057 24.7754ZM29.4057 4.12257L27.6105 3.22489C27.0677 2.96051 26.6358 2.51781 26.3644 1.98289L25.4637 0.193678C25.3404 -0.0645593 24.9702 -0.0645593 24.8407 0.193678L23.94 1.98289C23.6748 2.52396 23.2306 2.95436 22.6939 3.22489L20.8987 4.12257C20.6397 4.24554 20.6397 4.61445 20.8987 4.74357L22.6939 5.64125C23.2368 5.90564 23.6686 6.34833 23.94 6.88325L24.8407 8.67247C24.9641 8.93071 25.3342 8.93071 25.4637 8.67247L26.3644 6.88325C26.6297 6.34218 27.0738 5.91179 27.6105 5.64125L29.4057 4.74357C29.6648 4.6206 29.6648 4.25169 29.4057 4.12257Z' fill='%230250D9'/%3E%3C/svg%3E";
const imgSendIcon = "data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 10L18 2L10 18L8 11L2 10Z' fill='%230176d3' stroke='%230176d3' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";
const imgChevronDown = "data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";
const imgPencilIcon = "data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='%23747474' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'/%3E%3C/svg%3E";

interface EditableCellProps {
  value?: string;
  type?: 'text' | 'select';
  options?: string[];
  placeholder?: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
}

function EditableCell({ value, type = 'text', options = [], placeholder = 'Select...', onCommit, disabled = false }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      if (type === 'select') {
        // Pop the dropdown open immediately when the pencil is clicked.
        try {
          (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
        } catch {
          /* showPicker unsupported or outside user gesture — focus is enough */
        }
      } else if (typeof (el as HTMLInputElement).select === 'function') {
        (el as HTMLInputElement).select();
      }
    }
  }, [editing, type]);

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  const startEdit = () => {
    setDraft(value ?? '');
    setEditing(true);
  };
  const commitText = () => {
    setEditing(false);
    if (draft !== (value ?? '')) onCommit(draft);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(value ?? '');
  };

  if (disabled) {
    const isEmpty = value === '' || value == null;
    return (
      <div className="editable-cell editable-cell-disabled">
        <span className={`editable-cell-value${isEmpty ? ' editable-cell-placeholder' : ''}`}>
          {isEmpty ? placeholder : value}
        </span>
      </div>
    );
  }

  if (editing) {
    if (type === 'select') {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          className="cell-select"
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            setEditing(false);
            if (v !== (value ?? '')) onCommit(v);
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel();
          }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt === '' ? placeholder : opt}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        className="cell-input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitText();
          if (e.key === 'Escape') cancel();
        }}
      />
    );
  }

  const isEmpty = value === '' || value == null;
  return (
    <div className="editable-cell">
      <span className={`editable-cell-value${isEmpty ? ' editable-cell-placeholder' : ''}`}>
        {isEmpty ? placeholder : value}
      </span>
      <button
        type="button"
        className="editable-cell-edit-btn"
        onClick={startEdit}
        aria-label="Edit cell"
      >
        <img src={imgPencilIcon} alt="" />
      </button>
    </div>
  );
}

const ReviewMeasuresModal: React.FC<ReviewMeasuresModalProps> = ({ isOpen, onClose, measures: propMeasures, setMeasures: propSetMeasures }) => {
  const measures = propMeasures || [];
  const setMeasures = propSetMeasures;

  const [mainTab, setMainTab] = useState<'existing' | 'new'>('existing');
  const [newMeasureNameError, setNewMeasureNameError] = useState(false);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [measureDetailTab, setMeasureDetailTab] = useState<'edit' | 'clone'>('edit');
  const [deletePanelOpen, setDeletePanelOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit' | 'clone'>('create');
  const [editingMeasureId, setEditingMeasureId] = useState<number | null>(null);
  const [selectedMeasure, setSelectedMeasure] = useState<Measure | null>(null);
  const [hoveredSubsetIndex, setHoveredSubsetIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'subsets'>('details');
  const [selectedSubsets, setSelectedSubsets] = useState<string[]>([]);
  const [subsetSearchTerm, setSubsetSearchTerm] = useState('');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<AiMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [generatedMeasure, setGeneratedMeasure] = useState<GeneratedMeasure | null>(null);
  const [showFormFromChat, setShowFormFromChat] = useState(false);
  const [assignSubsetPanelOpen, setAssignSubsetPanelOpen] = useState(false);
  const [selectedSubsetsForAssignment, setSelectedSubsetsForAssignment] = useState<string[]>([]);
  const [isNewSubsetDropdownOpen, setIsNewSubsetDropdownOpen] = useState(false);
  const newSubsetDropdownRef = useRef<HTMLDivElement | null>(null);
  const [tableDirty, setTableDirty] = useState(false);
  const [measuresSnapshot, setMeasuresSnapshot] = useState<Measure[] | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (newSubsetDropdownRef.current && !newSubsetDropdownRef.current.contains(event.target as Node)) {
        setIsNewSubsetDropdownOpen(false);
      }
    };
    if (isNewSubsetDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNewSubsetDropdownOpen]);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastDescription, setToastDescription] = useState('');
  const [selectedAggregation, setSelectedAggregation] = useState('All');
  const [selectedMeasureType, setSelectedMeasureType] = useState('All');
  const [measureSearchTerm, setMeasureSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All Categories');
  const [selectedDataTypeFilter, setSelectedDataTypeFilter] = useState('All Types');
  const [newMeasureForm, setNewMeasureForm] = useState({
    name: '',
    sourceName: '',
    unit: '',
    dataType: '',
    aggregation: '',
    type: 'Read',
    subsets: [] as string[],
    description: '',
    measureCode: '',
    precision: '2',
    formula: '',
  });

  const [editMeasureName, setEditMeasureName] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [editMeasureType, setEditMeasureType] = useState('Calculated');
  const [editDescription, setEditDescription] = useState('');
  const [editValueType, setEditValueType] = useState('Volume');
  const [editRoundingPrecision, setEditRoundingPrecision] = useState('2');
  const [editAggregationRule, setEditAggregationRule] = useState('Sum');

  if (!isOpen) return null;

  const normalizeUnit = (unit?: string) => {
    if (!unit) return 'Volume';
    if (unit === '%') return 'Percent';
    return unit.charAt(0).toUpperCase() + unit.slice(1).toLowerCase();
  };

  const normalizeAggregation = (agg?: string) => {
    if (!agg) return 'Sum';
    return agg.charAt(0).toUpperCase() + agg.slice(1).toLowerCase();
  };

  // Category options for the filter are derived from the categories actually
  // present on the measures, so the dropdown always reflects real data.
  const categoryFilterOptions = Array.from(
    new Set(measures.flatMap((m) => m.subsets || [])),
  ).sort((a, b) => a.localeCompare(b));

  const filteredMeasures = measures
    .map((measure, index) => ({ measure, index }))
    .filter(({ measure }) => {
      const query = measureSearchTerm.trim().toLowerCase();
      const matchesSearch =
        !query ||
        measure.name.toLowerCase().includes(query) ||
        (measure.measureCode || '').toLowerCase().includes(query);
      const matchesCategory =
        selectedCategoryFilter === 'All Categories' ||
        (measure.subsets || []).includes(selectedCategoryFilter);
      const matchesDataType =
        selectedDataTypeFilter === 'All Types' ||
        measure.dataType === selectedDataTypeFilter;
      const matchesAggregation =
        selectedAggregation === 'All' ||
        normalizeAggregation(measure.aggregation) === normalizeAggregation(selectedAggregation);
      const matchesType =
        selectedMeasureType === 'All' || measure.type === selectedMeasureType;
      return matchesSearch && matchesCategory && matchesDataType && matchesAggregation && matchesType;
    });

  const showSuccessToast = (message: string, description = '') => {
    setToastMessage(message);
    setToastDescription(description);
    setShowToast(true);
  };

  const closeToast = () => setShowToast(false);

  const availableSubsets = [
    'SalesAgreement', 'Baseline', 'Promotions', 'Trade', 'Revenue', 'Budget', 'Fund',
    'Deductions', 'Forecast', 'Pipeline', 'Quota', 'Performance', 'Marketing', 'Campaigns',
    'ROI', 'Analytics', 'Sales', 'Net Value', 'Finance', 'Planning', 'Allocation',
    'Adjustments', 'Future', 'Opportunities', 'Weighted', 'Goals', 'Targets', 'Attainment',
    'Win Rate', 'Success', 'Metrics', 'KPI',
  ];

  const toggleSubset = (subset: string) => {
    setSelectedSubsets((prev) =>
      prev.includes(subset) ? prev.filter((s) => s !== subset) : [...prev, subset],
    );
  };

  const updateMeasureField = (index: number, field: keyof Measure, value: string) => {
    if (!tableDirty) {
      setMeasuresSnapshot(measures);
    }
    const next = measures.map((m, i) => (i === index ? { ...m, [field]: value } : m));
    setMeasures(next);
    setTableDirty(true);
  };

  const filteredSubsets = availableSubsets.filter((subset) => {
    const matchesSearch = subset.toLowerCase().includes(subsetSearchTerm.toLowerCase());
    const matchesToggle = !showSelectedOnly || selectedSubsets.includes(subset);
    return matchesSearch && matchesToggle;
  });

  const toggleMenu = (index: number) => {
    setOpenMenuIndex(openMenuIndex === index ? null : index);
  };

  const openMeasureForm = (measure: Measure, mode: 'edit' | 'clone') => {
    const subsets = Array.isArray(measure.subsets) ? measure.subsets : [];
    setSelectedMeasure(measure);
    setPanelMode(mode);
    setEditingMeasureId(mode === 'edit' ? (measure.id ?? null) : null);
    setNewMeasureForm({
      name: mode === 'clone' ? `${measure.name} (Copy)` : (measure.name || ''),
      sourceName: measure.sourceName || measure.sourceDmo || '',
      unit: measure.unit || '',
      dataType: measure.dataType || '',
      aggregation: normalizeAggregation(measure.aggregation),
      type: measure.type || 'Read',
      subsets,
      description: measure.description || '',
      measureCode: measure.code || measure.measureCode || '',
      precision: measure.precision || '2',
      formula: measure.formula || '',
    });
    setSelectedSubsets(subsets);
    setGeneratedMeasure(null);
    setShowFormFromChat(false);
    setNewMeasureNameError(false);
    setActiveTab('details');
    setMainTab('new');
    setCreatePanelOpen(true);
    setEditPanelOpen(false);
    setDeletePanelOpen(false);
    setAiChatOpen(false);
  };

  const handleMenuAction = (action: string, measure: Measure) => {
    setOpenMenuIndex(null);
    if (action === 'edit') {
      openMeasureForm(measure, 'edit');
    } else if (action === 'clone') {
      openMeasureForm(measure, 'clone');
    } else if (action === 'delete') {
      setSelectedMeasure(measure);
      setDeletePanelOpen(true);
      setEditPanelOpen(false);
    }
  };

  const closeEditPanel = () => {
    setEditPanelOpen(false);
    setMeasureDetailTab('edit');
    setSelectedMeasure(null);
  };

  const closeCreatePanel = () => {
    setCreatePanelOpen(false);
    setPanelMode('create');
    setEditingMeasureId(null);
    setSelectedMeasure(null);
    setMainTab('existing');
    setNewMeasureNameError(false);
    setShowFormFromChat(false);
    setNewMeasureForm({ name: '', sourceName: '', unit: '', dataType: '', aggregation: '', type: 'Read', subsets: [], description: '', measureCode: '', precision: '2', formula: '' });
  };

  const handleSaveNewMeasure = () => {
    if (!newMeasureForm.name.trim()) {
      return;
    }

    if (panelMode === 'edit' && editingMeasureId != null) {
      setMeasures((prev) =>
        prev.map((m) =>
          m.id === editingMeasureId
            ? {
                ...m,
                name: newMeasureForm.name.trim(),
                description: newMeasureForm.description || m.description,
                type: newMeasureForm.type || m.type,
                aggregation: newMeasureForm.aggregation || m.aggregation,
                category: newMeasureForm.unit === 'currency' ? 'Financials' : newMeasureForm.unit === 'volume' ? 'Volume' : m.category,
                unit: newMeasureForm.unit || m.unit,
                dataType: newMeasureForm.dataType || m.dataType,
                measureCode: newMeasureForm.measureCode || m.measureCode,
                code: newMeasureForm.measureCode || m.code,
                precision: newMeasureForm.precision || m.precision,
                formula: newMeasureForm.formula || m.formula,
                subsets: selectedSubsets.length > 0 ? selectedSubsets : m.subsets,
              }
            : m,
        ),
      );
      closeCreatePanel();
      showSuccessToast('Measure updated successfully');
      return;
    }

    const maxId = measures.reduce((max, m) => Math.max(max, m.id || 0), 0);
    const newId = maxId + 1;
    const codeNumber = measures.length + 1;
    const code = newMeasureForm.measureCode.trim() || `BASL${codeNumber}`;

    const newMeasure: Measure = {
      id: newId,
      name: newMeasureForm.name.trim(),
      description: newMeasureForm.description || newMeasureForm.name.trim(),
      type: newMeasureForm.type || 'Read',
      sourceDmo: newMeasureForm.sourceName || (panelMode === 'clone' ? selectedMeasure?.sourceDmo : undefined) || 'Custom',
      code,
      measureCode: code,
      aggregation: newMeasureForm.aggregation || 'SUM',
      disaggregation: 'Proportional',
      category: newMeasureForm.unit === 'currency' ? 'Financials' : newMeasureForm.unit === 'volume' ? 'Volume' : 'Operations',
      sourceName: newMeasureForm.sourceName || 'Custom',
      unit: newMeasureForm.unit || 'volume',
      dataType: newMeasureForm.dataType || 'Number',
      precision: newMeasureForm.precision || '2',
      formula: newMeasureForm.formula || undefined,
      subsets: selectedSubsets.length > 0 ? selectedSubsets : ['Custom'],
      selected: false,
      isCustom: true,
    };
    setMeasures((prev) => [newMeasure, ...prev]);
    closeCreatePanel();
    showSuccessToast(panelMode === 'clone' ? 'Measure cloned successfully' : 'Measure created successfully');
  };

  const handleCloneMeasure = () => {
    if (!selectedMeasure) return;
    const name = cloneName.trim() || `${selectedMeasure.name} (Copy)`;
    const maxId = measures.reduce((max, m) => Math.max(max, m.id || 0), 0);
    const codeNumber = measures.length + 1;
    const cloned: Measure = {
      ...selectedMeasure,
      id: maxId + 1,
      name,
      code: `BASL${codeNumber}`,
      isCustom: true,
    };
    setMeasures((prev) => [cloned, ...prev]);
    closeEditPanel();
    showSuccessToast('Measure cloned successfully');
  };

  const closeDeletePanel = () => {
    setDeletePanelOpen(false);
    setSelectedMeasure(null);
  };

  const handleDeleteMeasure = () => {
    if (selectedMeasure) {
      setMeasures((prev) => prev.filter((m) => m.id !== selectedMeasure.id));
    }
    closeDeletePanel();
    showSuccessToast('Measure deleted successfully');
  };

  const openCreatePanel = () => {
    setCreatePanelOpen(true);
    setPanelMode('create');
    setEditingMeasureId(null);
    setSelectedMeasure(null);
    setMainTab('new');
    setActiveTab('details');
    setNewMeasureNameError(false);
    setEditPanelOpen(false);
    setDeletePanelOpen(false);
    setSelectedSubsets([]);
    setGeneratedMeasure(null);
    setNewMeasureForm({ name: '', sourceName: '', unit: '', dataType: '', aggregation: '', type: 'Read', subsets: [], description: '', measureCode: '', precision: '2', formula: '' });
  };

  const openAssignSubsetPanel = () => {
    setAssignSubsetPanelOpen(true);
    setEditPanelOpen(false);
    setDeletePanelOpen(false);
    setCreatePanelOpen(false);
    setAiChatOpen(false);
    setSelectedSubsetsForAssignment([]);
    setSubsetSearchTerm('');
    setShowSelectedOnly(false);
  };

  const closeAssignSubsetPanel = () => {
    setAssignSubsetPanelOpen(false);
    setSelectedSubsetsForAssignment([]);
    setSubsetSearchTerm('');
    setShowSelectedOnly(false);
  };

  const toggleSubsetForAssignment = (subsetName: string) => {
    setSelectedSubsetsForAssignment((prev) =>
      prev.includes(subsetName) ? prev.filter((s) => s !== subsetName) : [...prev, subsetName],
    );
  };

  const handleAssignToSubsets = () => {
    closeAssignSubsetPanel();
    showSuccessToast('Measures assigned to subsets successfully');
  };

  const openAiChat = () => {
    setAiChatOpen(true);
    setEditPanelOpen(false);
    setDeletePanelOpen(false);
    setCreatePanelOpen(false);
    setShowFormFromChat(false);
    if (chatMessages.length === 0) {
      setChatMessages([
        {
          role: 'ai',
          content: "Hi! I'm here to help you create measures. Tell me what you want to monitor, and I'll help set up the measure with the right formula and configuration.",
        },
      ]);
    }
  };

  const closeAiChat = () => {
    setAiChatOpen(false);
    setShowFormFromChat(false);
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const userMessage = chatInput;
    setChatMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setChatInput('');
    setIsAiTyping(true);
    setTimeout(() => {
      processAiResponse(userMessage);
    }, 1000);
  };

  const processAiResponse = (userInput: string) => {
    const lowerInput = userInput.toLowerCase();
    let response = '';
    let measureData: GeneratedMeasure | null = null;

    if ((lowerInput.includes('assign') && lowerInput.includes('source')) || (lowerInput.includes('help') && lowerInput.includes('dmo'))) {
      response = `I can help match Source DMOs to your measures!

Analysis criteria:
• Measure names (Revenue/Sales → OpportunityLineItem)
• Formula fields (OpportunityQuantity → Opportunity)
• Subsets (Budget → Account Budget)

Would you like me to review your measures and suggest the right Source DMOs?`;
    } else if (lowerInput.includes('revenue') || lowerInput.includes('sales') || lowerInput.includes('nsv')) {
      response = `Created: Net Sales Value (NSV)

Source DMO: OpportunityLineItem

Why this source:
The formula uses OpportunityQuantity and UnitPrice, which are fields on OpportunityLineItem.

Configuration:
• Format: Currency
• Aggregation: Sum
• Purpose: Financial reporting

Click "View Measure" below to review and customize.`;
      measureData = {
        name: 'Net Sales Value (NSV)', type: 'Calculated', description: 'Track total revenue from sales agreements',
        valueType: 'Currency', roundingPrecision: '2', aggregationRule: 'Sum',
        formula: 'OpportunityQuantity * UnitPrice * 0.8', measureCode: 'NSV_001', sourceDMO: 'OpportunityLineItem',
        subsets: ['Revenue', 'Sales', 'Net Value'],
      };
    } else if (lowerInput.includes('roi') || lowerInput.includes('return')) {
      response = `Created: Trade ROI

Source DMO: Trade Promotion

Why this source:
ROI needs both revenue and cost data, which are tracked in Trade Promotion.

Configuration:
• Format: Percent
• Aggregation: Average
• Purpose: Campaign profitability

Click "View Measure" below to review and customize.`;
      measureData = {
        name: 'Trade ROI', type: 'Calculated', description: 'Measure return on investment for trade promotions',
        valueType: 'Percent', roundingPrecision: '2', aggregationRule: 'Average',
        formula: '(Revenue - Cost) / Cost * 100', measureCode: 'ROI_001', sourceDMO: 'Trade Promotion',
        subsets: ['Trade', 'ROI', 'Performance'],
      };
    } else if (lowerInput.includes('quota') || lowerInput.includes('attainment')) {
      response = `Created: Quota Attainment %

Source DMO: Territory

Why this source:
The formula uses QuotaTarget, which is a field on Territory objects.

Configuration:
• Format: Percent
• Aggregation: Average
• Purpose: Team performance tracking

Click "View Measure" below to review and customize.`;
      measureData = {
        name: 'Quota Attainment %', type: 'Calculated', description: 'Track quota attainment for sales teams',
        valueType: 'Percent', roundingPrecision: '2', aggregationRule: 'Average',
        formula: '(ActualSales / QuotaTarget) * 100', measureCode: 'QUOTA_001', sourceDMO: 'Territory',
        subsets: ['Quota', 'Goals', 'Targets', 'Attainment'],
      };
    } else if (lowerInput.includes('volume') || lowerInput.includes('quantity')) {
      response = `Created: Sales Volume

Source DMO: SalesAgreement

Why this source:
The formula combines SalesAgreementQuantity and OpportunityQuantity. SalesAgreement is the primary source for committed volumes.

Configuration:
• Format: Volume
• Aggregation: Sum
• Purpose: Total quantity reporting

Click "View Measure" below to review and customize.`;
      measureData = {
        name: 'Sales Volume', type: 'Calculated', description: 'Track total sales volume across products',
        valueType: 'Volume', roundingPrecision: '0', aggregationRule: 'Sum',
        formula: 'SalesAgreementQuantity + OpportunityQuantity', measureCode: 'VOL_001', sourceDMO: 'SalesAgreement',
        subsets: ['Volume', 'Sales', 'Quantity'],
      };
    } else {
      response = `Welcome! I can help you create custom measures.

What metric would you like to track?
• Revenue or sales performance
• ROI or profitability
• Quota attainment
• Volume or quantity

I'll intelligently assign the appropriate Source DMO based on your needs.`;
    }

    setTimeout(() => {
      setIsAiTyping(false);
      setChatMessages((prev) => [...prev, { role: 'ai', content: response, measureData }]);
      if (measureData) {
        setGeneratedMeasure(measureData);
      }
    }, 1500);
  };

  const handleStarterPrompt = (prompt: string) => {
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    setIsAiTyping(true);
    setTimeout(() => processAiResponse(prompt), 1000);
  };

  const handleViewMeasure = (measureData: GeneratedMeasure) => {
    setGeneratedMeasure(measureData);
    setShowFormFromChat(true);
    setCreatePanelOpen(true);
    setPanelMode('create');
    setEditingMeasureId(null);
    setMainTab('new');
    setNewMeasureNameError(false);
    setAiChatOpen(false);
    setActiveTab('details');
    setSelectedSubsets(measureData.subsets || []);
    setNewMeasureForm((prev) => ({
      ...prev,
      name: measureData.name || '',
      type: measureData.type || 'Read',
      description: measureData.description || '',
      dataType: measureData.valueType || '',
      unit: (measureData.valueType || '').toLowerCase(),
      aggregation: measureData.aggregationRule || '',
      precision: measureData.roundingPrecision || '2',
      measureCode: measureData.measureCode || '',
      formula: measureData.formula || '',
      subsets: measureData.subsets || [],
    }));
  };

  const handleBackToChat = () => {
    setShowFormFromChat(false);
    setCreatePanelOpen(false);
    setMainTab('existing');
    setAiChatOpen(true);
  };

  const handleFooterSave = () => {
    if (mainTab === 'new') {
      if (!newMeasureForm.name.trim()) {
        setNewMeasureNameError(true);
        setActiveTab('details');
        showSuccessToast('Measure name is required', 'Enter a measure name before saving.');
        return;
      }
      handleSaveNewMeasure();
    } else {
      if (tableDirty) {
        setTableDirty(false);
        setMeasuresSnapshot(null);
        showSuccessToast('Measures updated successfully');
      }
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-container modal-measures ${(editPanelOpen || deletePanelOpen || assignSubsetPanelOpen || aiChatOpen) ? 'with-panel' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header modal-header-simple">
          <h2 className="modal-title">Review Available Measures</h2>
          <button className="modal-close-button" onClick={onClose}>
            <img src={imgCloseIcon} alt="Close" />
          </button>
        </div>

        <div className="modal-body-simple">
          <div className="planning-grid-measure-info-banner">
            <span>Need more context on these measures?</span>
            <button type="button" className="planning-grid-info-banner-link">Go to Setup for more details</button>
          </div>

          {mainTab === 'existing' && (
            <div className="measures-filters">
              <div className="filter-field">
                <label className="filter-label">Search</label>
                <div className="filter-search">
                  <img src={imgSearchIcon} alt="Search" />
                  <input
                    type="text"
                    placeholder=""
                    value={measureSearchTerm}
                    onChange={(e) => setMeasureSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="filter-field">
                <label className="filter-label">Category</label>
                <select
                  className="filter-select"
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                >
                  <option>All Categories</option>
                  {categoryFilterOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label className="filter-label">Data Type</label>
                <select
                  className="filter-select"
                  value={selectedDataTypeFilter}
                  onChange={(e) => setSelectedDataTypeFilter(e.target.value)}
                >
                  <option>All Types</option>
                  <option>Currency</option>
                  <option>Percent</option>
                  <option>Number</option>
                </select>
              </div>
              <div className="filter-field">
                <label className="filter-label">Aggregation</label>
                <select className="filter-select" value={selectedAggregation} onChange={(e) => setSelectedAggregation(e.target.value)}>
                  <option>All</option>
                  <option>Sum</option>
                  <option>Average</option>
                  <option>Count</option>
                  <option>Min</option>
                  <option>Max</option>
                </select>
              </div>
              <div className="filter-field">
                <label className="filter-label">Type</label>
                <select className="filter-select" value={selectedMeasureType} onChange={(e) => setSelectedMeasureType(e.target.value)}>
                  <option>All</option>
                  <option>Read</option>
                  <option>Write</option>
                  <option>Calculated</option>
                </select>
              </div>
            </div>
          )}

          <div className="measures-content-wrapper">
          {mainTab === 'existing' && (
          <div className="measures-main-content">
            {(() => {
              const dmoCompleted = measures.filter((m) => !!(m.sourceDmo && m.sourceDmo.trim())).length;
              const dmoMissing = measures.length - dmoCompleted;
              return (
                <div className="measures-dmo-status">
                  <span className="measures-dmo-status-label">DMO Status:</span>
                  <span className="measures-dmo-status-missing">{dmoMissing} missing</span>
                  <span className="measures-dmo-status-sep">•</span>
                  <span className="measures-dmo-status-completed">{dmoCompleted} completed</span>
                  <button type="button" className="measures-new-measure-btn" onClick={openCreatePanel}>
                    New Measure
                  </button>
                </div>
              );
            })()}
            <div className="measures-table-container">
              <table className="measures-table">
                <thead>
                  <tr>
                    <th>Measure Name</th>
                    <th>Measure Categories</th>
                    <th>Unit</th>
                    <th>Data Type</th>
                    <th>Aggregation</th>
                    <th>Type</th>
                    <th>Data Source</th>
                    <th>Measure Code</th>
                    <th className="table-cell-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMeasures.map(({ measure, index }) => (
                    <tr
                      key={index}
                      className={(editPanelOpen || deletePanelOpen || createPanelOpen) && selectedMeasure?.name === measure.name ? 'row-selected' : ''}
                    >
                      <td style={{ cursor: 'pointer', color: '#0176d3' }} onClick={() => handleMenuAction('edit', measure)}>{measure.name}</td>
                      <td
                        className="subsets-cell"
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleMenuAction('edit', measure)}
                        onMouseEnter={() => setHoveredSubsetIndex(index)}
                        onMouseLeave={() => setHoveredSubsetIndex(null)}
                      >
                        <div className="subsets-display">
                          {measure.subsets[0]}
                          {measure.subsets.length > 1 && (
                            <span className="subsets-more">+{measure.subsets.length - 1} more</span>
                          )}
                        </div>
                        {hoveredSubsetIndex === index && measure.subsets.length > 1 && (
                          <div className="subsets-popover">
                            <div className="subsets-popover-nubbin"></div>
                            {measure.subsets.map((subset, idx) => (
                              <div key={idx} className="subsets-popover-item">{subset}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <EditableCell type="select" options={['volume', 'currency', '%']} value={measure.unit} onCommit={(v) => updateMeasureField(index, 'unit', v)} />
                      </td>
                      <td>
                        <EditableCell type="select" options={['Number', 'Currency', 'Percent']} value={measure.dataType} onCommit={(v) => updateMeasureField(index, 'dataType', v)} />
                      </td>
                      <td>
                        <EditableCell type="select" options={['SUM', 'Average', 'Count', 'Min', 'Max']} value={measure.aggregation} onCommit={(v) => updateMeasureField(index, 'aggregation', v)} />
                      </td>
                      <td>
                        <EditableCell type="select" options={['Read', 'Write', 'Calculated']} value={measure.type} onCommit={(v) => updateMeasureField(index, 'type', v)} />
                      </td>
                      <td>
                        <EditableCell type="select" options={['', 'Planning Weekly Read Measure', 'Monthly Read Measure']} placeholder="Select..." value={measure.dataSource} onCommit={(v) => updateMeasureField(index, 'dataSource', v)} />
                      </td>
                      <td>
                        <EditableCell value={measure.measureCode} placeholder="Enter code" onCommit={(v) => updateMeasureField(index, 'measureCode', v)} />
                      </td>
                      <td className="table-cell-actions">
                        <div className="dropdown-wrapper">
                          <button className="table-row-dropdown" onClick={() => toggleMenu(index)}>
                            <img src={imgDownIcon} alt="Actions" />
                          </button>
                          {openMenuIndex === index && (
                            <div className="dropdown-menu">
                              <button className="dropdown-menu-item" onClick={() => handleMenuAction('edit', measure)}>Edit</button>
                              <button className="dropdown-menu-item" onClick={() => handleMenuAction('clone', measure)}>Clone</button>
                              <div className="dropdown-menu-divider"></div>
                              <button className="dropdown-menu-item dropdown-menu-item-danger" onClick={() => handleMenuAction('delete', measure)}>Delete</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredMeasures.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: '#706e6b' }}>
                        No measures match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {editPanelOpen && selectedMeasure && (
            <div className="edit-panel" key={selectedMeasure.id || selectedMeasure.name}>
              <div className="edit-panel-header">
                <h3 className="edit-panel-title">{selectedMeasure.name || 'Measure'}</h3>
                {/* Edit / Clone segmented button-group toggle */}
                <div className="measure-mode-toggle">
                  <button
                    type="button"
                    className={`measure-mode-btn${measureDetailTab === 'edit' ? ' is-active' : ''}`}
                    onClick={() => setMeasureDetailTab('edit')}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`measure-mode-btn${measureDetailTab === 'clone' ? ' is-active' : ''}`}
                    onClick={() => setMeasureDetailTab('clone')}
                  >
                    Clone
                  </button>
                </div>
                <button
                  type="button"
                  className="edit-panel-close"
                  aria-label="Close panel"
                  onClick={() => { setEditPanelOpen(false); setSelectedMeasure(null); }}
                >
                  ✕
                </button>
              </div>

              {/* Details / Measure Categories inner tabs */}
              <div className="measure-tabs">
                <button className={`measure-tab ${activeTab === 'details' ? 'measure-tab-active' : ''}`} onClick={() => setActiveTab('details')}>Details</button>
                <button className={`measure-tab ${activeTab === 'subsets' ? 'measure-tab-active' : ''}`} onClick={() => setActiveTab('subsets')}>Measure Categories</button>
              </div>

              <div className="edit-panel-body">
                {activeTab === 'details' && measureDetailTab === 'edit' && (
                  <>
                    <div className="measure-section">
                      <h4 className="measure-section-title">Information</h4>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Measure Name</label>
                        <input type="text" className="edit-form-input" value={editMeasureName} onChange={(e) => setEditMeasureName(e.target.value)} />
                      </div>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Measure Type</label>
                        <select className="edit-form-select" value={editMeasureType} onChange={(e) => setEditMeasureType(e.target.value)}>
                          <option value="Calculated">Calculated</option>
                          <option value="Direct">Direct</option>
                        </select>
                      </div>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Description</label>
                        <textarea className="edit-form-textarea" placeholder="Enter description..." rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                      </div>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Value Type</label>
                        <select className="edit-form-select" value={editValueType} onChange={(e) => setEditValueType(e.target.value)}>
                          <option value="Volume">Volume</option>
                          <option value="Currency">Currency</option>
                          <option value="Percent">Percent</option>
                          <option value="Score">Score</option>
                        </select>
                      </div>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Rounding Precision</label>
                        <select className="edit-form-select" value={editRoundingPrecision} onChange={(e) => setEditRoundingPrecision(e.target.value)}>
                          <option value="2">2 Decimal</option>
                          <option value="0">0 Decimal</option>
                          <option value="1">1 Decimal</option>
                          <option value="3">3 Decimal</option>
                          <option value="4">4 Decimal</option>
                        </select>
                      </div>
                    </div>

                    <div className="measure-section">
                      <h4 className="measure-section-title">Aggregation / Disaggregation Settings</h4>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Aggregation Rule</label>
                        <select className="edit-form-select" value={editAggregationRule} onChange={(e) => setEditAggregationRule(e.target.value)}>
                          <option value="Sum">Sum</option>
                          <option value="Average">Average</option>
                          <option value="Count">Count</option>
                          <option value="Min">Min</option>
                          <option value="Max">Max</option>
                        </select>
                      </div>
                    </div>

                    <div className="measure-section">
                      <h4 className="measure-section-title">Settings</h4>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Calculated Expression</label>
                        <div className="formula-builder">
                          <div className="formula-inputs">
                            <div className="source-search-wrapper"><input type="text" className="edit-form-input formula-input" placeholder="Search measures" /></div>
                            <div className="source-search-wrapper"><input type="text" className="edit-form-input formula-input" placeholder="Select function" /></div>
                            <div className="source-search-wrapper"><input type="text" className="edit-form-input formula-input" placeholder="Select operator" /></div>
                          </div>
                          <textarea className="edit-form-textarea formula-textarea" placeholder="Enter formula..." rows={4} />
                          <button className="check-syntax-button">Check Syntax</button>
                        </div>
                      </div>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Measure Code</label>
                        <input type="text" className="edit-form-input" placeholder="Enter measure code..." />
                      </div>
                      <div className="edit-form-field">
                        <label className="writeback-checkbox-label">
                          <input type="checkbox" className="writeback-checkbox" />
                          <span>Writeback enabled</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'details' && measureDetailTab === 'clone' && (
                  <>
                    <div className="measure-section">
                      <h4 className="measure-section-title">Information</h4>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Measure Name</label>
                        <input type="text" className="edit-form-input" value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
                      </div>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Measure Type</label>
                        <select className="edit-form-select">
                          <option value="Calculated">Calculated</option>
                          <option value="Direct">Direct</option>
                        </select>
                      </div>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Description</label>
                        <textarea className="edit-form-textarea" placeholder="Enter description..." rows={3} />
                      </div>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Value Type</label>
                        <select className="edit-form-select" defaultValue={selectedMeasure.unit}>
                          <option value="Volume">Volume</option>
                          <option value="Currency">Currency</option>
                          <option value="Percent">Percent</option>
                          <option value="Score">Score</option>
                        </select>
                      </div>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Rounding Precision</label>
                        <select className="edit-form-select">
                          <option value="2">2 Decimal</option>
                          <option value="0">0 Decimal</option>
                          <option value="1">1 Decimal</option>
                          <option value="3">3 Decimal</option>
                          <option value="4">4 Decimal</option>
                        </select>
                      </div>
                    </div>

                    <div className="measure-section">
                      <h4 className="measure-section-title">Aggregation / Disaggregation Settings</h4>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Aggregation Rule</label>
                        <select className="edit-form-select" defaultValue={selectedMeasure.aggregation}>
                          <option value="Sum">Sum</option>
                          <option value="Average">Average</option>
                          <option value="Count">Count</option>
                          <option value="Min">Min</option>
                          <option value="Max">Max</option>
                        </select>
                      </div>
                    </div>

                    <div className="measure-section">
                      <h4 className="measure-section-title">Settings</h4>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Calculated Expression</label>
                        <div className="formula-builder">
                          <div className="formula-inputs">
                            <div className="source-search-wrapper"><input type="text" className="edit-form-input formula-input" placeholder="Search measures" /></div>
                            <div className="source-search-wrapper"><input type="text" className="edit-form-input formula-input" placeholder="Select function" /></div>
                            <div className="source-search-wrapper"><input type="text" className="edit-form-input formula-input" placeholder="Select operator" /></div>
                          </div>
                          <textarea className="edit-form-textarea formula-textarea" placeholder="Enter formula..." rows={4} />
                          <button className="check-syntax-button">Check Syntax</button>
                        </div>
                      </div>
                      <div className="edit-form-field">
                        <label className="edit-form-label">* Measure Code</label>
                        <input type="text" className="edit-form-input" placeholder="Enter measure code..." />
                      </div>
                      <div className="edit-form-field">
                        <label className="writeback-checkbox-label">
                          <input type="checkbox" className="writeback-checkbox" />
                          <span>Writeback enabled</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'subsets' && (
                  <div className="subsets-tab-content">
                    <div className="subsets-tab-header">
                      <p className="subsets-tab-description">Select the categories this measure should be part of</p>
                      <div className="subsets-controls">
                        <div className="subsets-search">
                          <img src={imgSearchIcon} alt="Search" />
                          <input type="text" placeholder="Search categories..." value={subsetSearchTerm} onChange={(e) => setSubsetSearchTerm(e.target.value)} />
                        </div>
                        <div className="subsets-toggle">
                          <label className="toggle-label">
                            <input type="checkbox" className="toggle-checkbox" checked={showSelectedOnly} onChange={(e) => setShowSelectedOnly(e.target.checked)} />
                            <span className="toggle-text">Show selected only</span>
                          </label>
                        </div>
                      </div>
                      <p className="subsets-selected-count">{selectedSubsets.length} selected</p>
                    </div>
                    <div className="subsets-list">
                      {filteredSubsets.map((subset, idx) => (
                        <div key={idx} className="subset-item">
                          <label className="subset-checkbox-label">
                            <input type="checkbox" className="subset-checkbox" checked={selectedSubsets.includes(subset)} onChange={() => toggleSubset(subset)} />
                            <span className="subset-name">{subset}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="measure-panel-footer">
                <button type="button" className="measure-neutral-btn" onClick={closeEditPanel}>Cancel</button>
                <button type="button" className="measure-neutral-btn" onClick={() => {
                  if (measureDetailTab === 'clone') {
                    handleCloneMeasure();
                  } else {
                    if (selectedMeasure) {
                      setMeasures((prev) =>
                        prev.map((m) =>
                          m.id === selectedMeasure.id
                            ? { ...m, name: editMeasureName, type: editMeasureType, unit: editValueType, aggregation: editAggregationRule, subsets: selectedSubsets }
                            : m
                        )
                      );
                    }
                    closeEditPanel();
                    showSuccessToast('Measure updated successfully');
                  }
                }}>Save</button>
              </div>
            </div>
          )}

          {deletePanelOpen && selectedMeasure && (
            <div className="edit-panel">
              <div className="edit-panel-header">
                <h3 className="edit-panel-title">Delete Measure</h3>
              </div>
              <div className="edit-panel-body">
                <div className="delete-warning">
                  <p>Are you sure you want to delete this measure?</p>
                  <div className="delete-measure-details">
                    <div className="delete-detail-row"><span className="delete-detail-label">Measure Name:</span><span className="delete-detail-value">{selectedMeasure.name}</span></div>
                    <div className="delete-detail-row"><span className="delete-detail-label">Unit:</span><span className="delete-detail-value">{selectedMeasure.unit}</span></div>
                    <div className="delete-detail-row"><span className="delete-detail-label">Data Type:</span><span className="delete-detail-value">{selectedMeasure.dataType}</span></div>
                    <div className="delete-detail-row"><span className="delete-detail-label">Source:</span><span className="delete-detail-value">{selectedMeasure.sourceName}</span></div>
                  </div>
                  <p className="delete-warning-text">This action cannot be undone.</p>
                </div>
              </div>
              <div className="measure-panel-footer">
                <button type="button" className="measure-neutral-btn" onClick={closeDeletePanel}>Cancel</button>
                <button type="button" className="measure-neutral-btn" onClick={handleDeleteMeasure}>Delete</button>
              </div>
            </div>
          )}

          {mainTab === 'new' && (
            <div className="measures-main-content measures-new-measure-content">
              <div className="measures-new-measure-heading">
                <div className="measures-new-measure-heading-left">
                  <button type="button" className="measures-back-to-list" onClick={closeCreatePanel}>
                    <span className="measures-back-arrow" aria-hidden="true">←</span>
                    Back to list
                  </button>
                  <h3 className="measures-new-measure-title">
                    {panelMode === 'edit' ? 'Edit Measure' : panelMode === 'clone' ? 'Clone Measure' : 'Create New Measure'}
                  </h3>
                </div>
                <div className="measures-new-measure-heading-actions">
                  <button type="button" className="measures-header-cancel" onClick={closeCreatePanel}>
                    Cancel
                  </button>
                  <button type="button" className="measures-header-save" onClick={handleFooterSave}>
                    Save
                  </button>
                </div>
              </div>

              {showFormFromChat && (
                <div className="measures-new-measure-breadcrumb">
                  <button className="ai-breadcrumb" onClick={handleBackToChat}>← Back to AI Chat</button>
                </div>
              )}

              <div className="measures-new-shell">
              <div className="edit-panel-body">
                <div className="measure-section">
                  <h4 className="measure-section-title">Information</h4>
                  <div className="edit-form-field">
                    <label className="edit-form-label">* Measure Name</label>
                    <input
                      type="text"
                      className="edit-form-input"
                      placeholder="Enter measure name..."
                      value={newMeasureForm.name}
                      onChange={(e) => {
                        setNewMeasureForm((prev) => ({ ...prev, name: e.target.value }));
                        if (e.target.value.trim()) setNewMeasureNameError(false);
                      }}
                      style={{ borderColor: newMeasureNameError ? '#c23934' : undefined }}
                    />
                    {newMeasureNameError && <p className="edit-form-error">Measure name is required</p>}
                  </div>
                  <div className="edit-form-field">
                    <label className="edit-form-label">* Measure Type</label>
                    <select className="edit-form-select" value={newMeasureForm.type} onChange={(e) => setNewMeasureForm((prev) => ({ ...prev, type: e.target.value }))}>
                      <option value="Read">Read</option>
                      <option value="Write">Write</option>
                      <option value="Calculated">Calculated</option>
                    </select>
                  </div>
                  <div className="edit-form-field">
                    <label className="edit-form-label">* Description</label>
                    <textarea
                      className="edit-form-textarea"
                      placeholder="Enter description..."
                      rows={3}
                      value={newMeasureForm.description}
                      onChange={(e) => setNewMeasureForm((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div className="edit-form-field">
                    <label className="edit-form-label">* Value Type</label>
                    <select className="edit-form-select" value={newMeasureForm.dataType} onChange={(e) => setNewMeasureForm((prev) => ({ ...prev, dataType: e.target.value, unit: e.target.value.toLowerCase() }))}>
                      <option value="">Select value type...</option>
                      <option value="Number">Number</option>
                      <option value="Currency">Currency</option>
                      <option value="Percent">Percent</option>
                    </select>
                  </div>
                  <div className="edit-form-field">
                    <label className="edit-form-label">* Rounding Precision</label>
                    <select
                      className="edit-form-select"
                      value={newMeasureForm.precision}
                      onChange={(e) => setNewMeasureForm((prev) => ({ ...prev, precision: e.target.value }))}
                    >
                      <option value="2">2 Decimal</option>
                      <option value="0">0 Decimal</option>
                      <option value="1">1 Decimal</option>
                      <option value="3">3 Decimal</option>
                      <option value="4">4 Decimal</option>
                    </select>
                  </div>
                </div>

                <div className="measure-section">
                  <h4 className="measure-section-title">Aggregation / Disaggregation Settings</h4>
                  <div className="edit-form-field">
                    <label className="edit-form-label">* Aggregation Rule</label>
                    <select className="edit-form-select" value={newMeasureForm.aggregation} onChange={(e) => setNewMeasureForm((prev) => ({ ...prev, aggregation: e.target.value }))}>
                      <option value="">Select</option>
                      <option value="Sum">Sum</option>
                      <option value="Average">Average</option>
                      <option value="Count">Count</option>
                      <option value="Min">Min</option>
                      <option value="Max">Max</option>
                    </select>
                  </div>
                </div>

                <div className="measure-section">
                  <h4 className="measure-section-title">Settings</h4>
                  <div className="edit-form-field">
                    <label className="edit-form-label">* Calculated Expression</label>
                    <div className="formula-builder">
                      <div className="formula-inputs">
                        <div className="source-search-wrapper"><input type="text" className="edit-form-input formula-input" placeholder="Search measures" /></div>
                        <div className="source-search-wrapper"><input type="text" className="edit-form-input formula-input" placeholder="Select function" /></div>
                        <div className="source-search-wrapper"><input type="text" className="edit-form-input formula-input" placeholder="Select operator" /></div>
                      </div>
                      <textarea
                        className="edit-form-textarea formula-textarea"
                        placeholder="Enter formula..."
                        rows={4}
                        value={newMeasureForm.formula}
                        onChange={(e) => setNewMeasureForm((prev) => ({ ...prev, formula: e.target.value }))}
                      />
                      <button className="check-syntax-button">Check Syntax</button>
                    </div>
                  </div>
                  <div className="edit-form-field">
                    <label className="edit-form-label">* Measure Code</label>
                    <input
                      type="text"
                      className="edit-form-input"
                      placeholder="Enter measure code..."
                      value={newMeasureForm.measureCode}
                      onChange={(e) => setNewMeasureForm((prev) => ({ ...prev, measureCode: e.target.value }))}
                    />
                  </div>
                  <div className="edit-form-field">
                    <label className="writeback-checkbox-label">
                      <input type="checkbox" className="writeback-checkbox" />
                      <span>Writeback enabled</span>
                    </label>
                  </div>
                </div>

                <div className="measure-section">
                  <h4 className="measure-section-title">Add to Categories</h4>
                  <div className="planning-view-assign-field">
                    <label className="planning-view-assign-label">Select categories you want to add this measure to</label>
                    <div className="planning-view-role-dropdown" ref={newSubsetDropdownRef}>
                      <button type="button" className="planning-view-role-dropdown-trigger" onClick={() => setIsNewSubsetDropdownOpen((prev) => !prev)}>
                        <span>
                          {selectedSubsets.length ? `${selectedSubsets.length} categor${selectedSubsets.length > 1 ? 'ies' : 'y'} selected` : 'Select categories'}
                        </span>
                        <img src={imgChevronDown} alt="" />
                      </button>
                      {isNewSubsetDropdownOpen && (
                        <div className="planning-view-role-dropdown-menu">
                          {availableSubsets.map((subset) => (
                            <label key={subset} className="planning-view-role-dropdown-option">
                              <input type="checkbox" checked={selectedSubsets.includes(subset)} onChange={() => toggleSubset(subset)} />
                              <span>{subset}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedSubsets.length > 0 && (
                      <div className="planning-view-role-pill-list">
                        {selectedSubsets.map((subset) => (
                          <span key={subset} className="planning-view-role-pill">
                            {subset}
                            <button type="button" className="planning-view-role-pill-remove" onClick={() => toggleSubset(subset)} aria-label={`Remove ${subset}`}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </div>
          )}

          {aiChatOpen && (
            <div className="edit-panel ai-chat-panel">
              <div className="edit-panel-header ai-chat-header">
                <h3 className="ai-chat-title">Agentforce</h3>
                <button className="ai-chat-close" onClick={closeAiChat}>
                  <img src={imgCloseIcon} alt="Close" />
                </button>
              </div>

              <div className="edit-panel-body ai-chat-body">
                <div className="ai-chat-messages">
                  {chatMessages.map((message, index) => (
                    <div key={index} className={`ai-chat-message ${message.role}`}>
                      {message.role === 'ai' ? (
                        <div className="ai-message-bubble">
                          <p className="ai-message-content">{message.content}</p>
                          {message.measureData && (
                            <button className="ai-view-button" onClick={() => handleViewMeasure(message.measureData as GeneratedMeasure)}>View</button>
                          )}
                        </div>
                      ) : (
                        <div className="user-message-bubble">
                          <p className="ai-message-content">{message.content}</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {chatMessages.length === 1 && (
                    <div className="ai-starter-prompts">
                      <button className="ai-starter-prompt" onClick={() => handleStarterPrompt('Create a revenue measure to track Net Sales Value for financial reporting')}>Create a revenue measure to track Net Sales Value for financial reporting</button>
                      <button className="ai-starter-prompt" onClick={() => handleStarterPrompt('Help me assign Source DMOs to my sales and revenue measures')}>Help me assign Source DMOs to my sales and revenue measures</button>
                      <button className="ai-starter-prompt" onClick={() => handleStarterPrompt('Create quota attainment measure for sales team performance')}>Create quota attainment measure for sales team performance</button>
                    </div>
                  )}

                  {isAiTyping && (
                    <div className="ai-chat-message ai">
                      <div className="ai-message-bubble">
                        <div className="ai-typing-indicator"><span></span><span></span><span></span></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="ai-chat-input-container">
                  <input
                    type="text"
                    className="ai-chat-input"
                    placeholder="Describe what you want to measure..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
                  />
                  <button className="ai-send-button" onClick={handleSendMessage}>
                    <img src={imgSendIcon} alt="Send" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {assignSubsetPanelOpen && (
            <div className="edit-panel">
              <div className="edit-panel-header">
                <h3 className="edit-panel-title">Assign to Measure Category</h3>
              </div>
              <div className="edit-panel-body">
                <div className="edit-form-group">
                  <label className="edit-form-label">Select Measure Categories</label>
                  <p className="edit-form-description">Choose one or more categories to assign the selected measures to</p>

                  <div className="subsets-tab-content" style={{ marginTop: '12px' }}>
                    <div className="subsets-tab-header">
                      <div className="subsets-controls">
                        <div className="subsets-search">
                          <img src={imgSearchIcon} alt="Search" />
                          <input type="text" placeholder="Search categories..." value={subsetSearchTerm} onChange={(e) => setSubsetSearchTerm(e.target.value)} />
                        </div>
                        <div className="subsets-toggle">
                          <label className="toggle-label">
                            <input type="checkbox" className="toggle-checkbox" checked={showSelectedOnly} onChange={(e) => setShowSelectedOnly(e.target.checked)} />
                            <span className="toggle-text">Show selected only</span>
                          </label>
                        </div>
                      </div>
                      <p className="subsets-selected-count">{selectedSubsetsForAssignment.length} selected</p>
                    </div>
                    <div className="subsets-list">
                      {availableSubsets
                        .filter((subset) => {
                          const matchesSearch = subset.toLowerCase().includes(subsetSearchTerm.toLowerCase());
                          const matchesToggle = !showSelectedOnly || selectedSubsetsForAssignment.includes(subset);
                          return matchesSearch && matchesToggle;
                        })
                        .map((subset, idx) => (
                          <div key={idx} className="subset-item">
                            <label className="subset-checkbox-label">
                              <input type="checkbox" className="subset-checkbox" checked={selectedSubsetsForAssignment.includes(subset)} onChange={() => toggleSubsetForAssignment(subset)} />
                              <span className="subset-name">{subset}</span>
                            </label>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="measure-panel-footer">
                <button type="button" className="measure-neutral-btn" onClick={closeAssignSubsetPanel}>Cancel</button>
                <button type="button" className="measure-neutral-btn" onClick={handleAssignToSubsets}>Save</button>
              </div>
            </div>
          )}

          </div>
        </div>

        {(() => {
          const formOpen = createPanelOpen || deletePanelOpen;
          const footerDisabled = formOpen;
          const footerTitle = formOpen
            ? 'Finish editing this measure first'
            : undefined;
          return (
            <div className="modal-footer">
              <button
                className="modal-cancel-button"
                type="button"
                onClick={onClose}
                disabled={formOpen}
                title={formOpen ? footerTitle : undefined}
                style={formOpen ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                Cancel
              </button>
              <button
                className="modal-done-button"
                onClick={handleFooterSave}
                disabled={footerDisabled}
                title={footerTitle}
                style={footerDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                Save
              </button>
            </div>
          );
        })()}
      </div>

      {showToast && (
        <MeasureToast message={toastMessage} description={toastDescription} onClose={closeToast} />
      )}
    </div>
  );
};

export default ReviewMeasuresModal;
