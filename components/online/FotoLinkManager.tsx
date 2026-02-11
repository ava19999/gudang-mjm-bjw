// FILE: components/online/FotoLinkManager.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Link2, Search, ChevronLeft, ChevronRight, Image, Loader2, RefreshCw, 
  X, Save, AlertCircle, Check, ZoomIn, Plus
} from 'lucide-react';
import { 
  fetchFotoLink, 
  updateFotoLinkSku, 
  fetchAllPartNumbersMJM,
  FotoLinkRow 
} from '../../services/supabaseService';

interface PartNumberOption {
  part_number: string;
  name: string;
}

interface NormalizedOption extends PartNumberOption {
  normPart: string;
  normName: string;
}

const parseSkuCsv = (sku: string | null | undefined): string[] => {
  if (!sku || !sku.trim()) return [];
  const input = sku.trim();
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (inQuotes && input[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      const value = current.trim();
      if (value) result.push(value);
      current = '';
      continue;
    }

    current += ch;
  }

  const last = current.trim();
  if (last) result.push(last);
  return result;
};

const escapeSkuCsv = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/[",]/.test(trimmed)) {
    return `"${trimmed.replace(/"/g, '""')}"`;
  }
  return trimmed;
};

// Helper to parse SKU string to array
const parseSkus = (sku: string | null | undefined): string[] => {
  return parseSkuCsv(sku);
};

// Helper to join SKU array to string
const joinSkus = (skus: string[]): string => {
  return skus.map(escapeSkuCsv).filter(Boolean).join(', ');
};

const stripZeroDecimal = (value: string): string => {
  return value.replace(/(\d+)[.,](0+)(?=\b)/g, '$1');
};

// Normalize input for matching SKUs (ignore punctuation)
const normalizeSkuKey = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const findBestSkuMatch = (rawText: string, options: NormalizedOption[]): string | null => {
  const normalizedRaw = normalizeSkuKey(stripZeroDecimal(rawText));
  if (!normalizedRaw) return null;

  const exact = options.find(o => o.normPart === normalizedRaw);
  if (exact) return exact.part_number;

  const candidates = options.filter(o => o.normPart && normalizedRaw.includes(o.normPart));
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.normPart.length - a.normPart.length);
  return candidates[0].part_number || null;
};

const parseRawSkuInput = (rawText: string, options: NormalizedOption[]): string[] => {
  if (!rawText.trim()) return [];
  const tokens = rawText.split(/[\r\n\t]+/).map(s => s.trim()).filter(Boolean);
  const results: string[] = [];

  const addMatch = (text: string) => {
    const match = findBestSkuMatch(text, options);
    if (match) results.push(match);
  };

  if (tokens.length <= 1) {
    addMatch(rawText);
  } else {
    tokens.forEach(addMatch);
  }

  return Array.from(new Set(results));
};

// Multi-SKU Input with Chips/Tags - Auto-save on select with multi-select support
const MultiSkuInput: React.FC<{
  options: PartNumberOption[];
  skus: string[];
  onChange: (skus: string[]) => void;
  onSave: () => void;
  onAddSku: (sku: string) => void; // Direct save single SKU
  onAddMultipleSkus: (skus: string[]) => void; // Direct save multiple SKUs at once
  onRemoveSku: (sku: string) => void; // Direct remove single SKU
  isSaving?: boolean;
  hasChanges?: boolean;
  onNavigate?: (direction: 'prev' | 'next') => void;
  onInputRef?: (el: HTMLInputElement | null) => void;
}> = ({ options, skus, onChange, onSave, onAddSku, onAddMultipleSkus, onRemoveSku, isSaving, hasChanges, onNavigate, onInputRef }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [selectedForAdd, setSelectedForAdd] = useState<Set<string>>(new Set()); // Multi-select mode
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const normalizedOptions = useMemo<NormalizedOption[]>(() => {
    return options.map(opt => ({
      ...opt,
      normPart: normalizeSkuKey(stripZeroDecimal(opt.part_number)),
      normName: normalizeSkuKey(stripZeroDecimal(opt.name || ''))
    }));
  }, [options]);

  const filteredOptions = useMemo(() => {
    if (!inputValue.trim()) return [];
    const normalizedSearch = normalizeSkuKey(stripZeroDecimal(inputValue));
    if (!normalizedSearch) return [];
    // Filter out already selected SKUs
    return normalizedOptions
      .filter(o =>
        !skus.includes(o.part_number) &&
        (o.normPart.includes(normalizedSearch) ||
         o.normName.includes(normalizedSearch))
      )
      .slice(0, 30);
  }, [normalizedOptions, inputValue, skus]);

  // Reset highlight and selection when options change
  useEffect(() => {
    setHighlightIndex(-1);
  }, [filteredOptions.length]);

  // Clear selection when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedForAdd(new Set());
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        // If there are selected items, save them before closing
        if (selectedForAdd.size > 0) {
          onAddMultipleSkus(Array.from(selectedForAdd));
          setSelectedForAdd(new Set());
        }
        setIsOpen(false);
        setHighlightIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedForAdd, onAddMultipleSkus]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightIndex >= 0) {
      const optionEl = optionRefs.current.get(highlightIndex);
      if (optionEl) {
        optionEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex]);

  const tryAddFromRawInput = (rawText: string) => {
    const parsed = parseRawSkuInput(rawText, normalizedOptions);
    if (parsed.length === 0) return false;

    if (parsed.length === 1) {
      onAddSku(parsed[0]);
    } else {
      onAddMultipleSkus(parsed);
    }
    setSelectedForAdd(new Set());
    setInputValue('');
    setIsOpen(false);
    setHighlightIndex(-1);
    inputRef.current?.focus();
    return true;
  };

  const toggleSelection = (sku: string) => {
    setSelectedForAdd(prev => {
      const next = new Set(prev);
      if (next.has(sku)) {
        next.delete(sku);
      } else {
        next.add(sku);
      }
      return next;
    });
  };

  const confirmSelection = () => {
    if (selectedForAdd.size > 0) {
      onAddMultipleSkus(Array.from(selectedForAdd));
      setSelectedForAdd(new Set());
      setInputValue('');
      setIsOpen(false);
      setHighlightIndex(-1);
      inputRef.current?.focus();
    }
  };

  const addSku = (sku: string) => {
    if (sku && !skus.includes(sku)) {
      // Auto-save immediately when selecting from dropdown
      onAddSku(sku);
    }
    setInputValue('');
    setIsOpen(false);
    setHighlightIndex(-1);
    setSelectedForAdd(new Set());
    inputRef.current?.focus();
  };

  const removeSku = (skuToRemove: string) => {
    // Auto-save removal immediately
    onRemoveSku(skuToRemove);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Dropdown navigation
    if (isOpen && filteredOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex(prev => 
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        return;
      } else if (e.key === ' ' && highlightIndex >= 0) {
        // Space to toggle checkbox
        e.preventDefault();
        toggleSelection(filteredOptions[highlightIndex].part_number);
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedForAdd.size > 0) {
          // Confirm multi-selection
          confirmSelection();
        } else if (highlightIndex >= 0) {
          // Single select
          addSku(filteredOptions[highlightIndex].part_number);
        }
        return;
      }
    }

    if (e.key === 'Enter' && (!isOpen || filteredOptions.length === 0) && inputValue.trim()) {
      const didAdd = tryAddFromRawInput(inputValue);
      if (didAdd) {
        e.preventDefault();
        return;
      }
    }

    // Backspace to remove last chip
    if (e.key === 'Backspace' && !inputValue && skus.length > 0) {
      e.preventDefault();
      removeSku(skus[skus.length - 1]);
      return;
    }

    // Row navigation (like Excel) - only when input is empty and dropdown is closed
    if (!inputValue && !isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (onNavigate) onNavigate('next');
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (onNavigate) onNavigate('prev');
        return;
      }
    }

    if (e.key === 'Enter' && !isOpen) {
      if (hasChanges) {
        onSave();
      }
      // Move to next row after Enter (like Excel)
      e.preventDefault();
      if (onNavigate) {
        onNavigate('next');
      }
    } else if (e.key === 'Tab') {
      // Save any pending selections before leaving
      if (selectedForAdd.size > 0) {
        onAddMultipleSkus(Array.from(selectedForAdd));
        setSelectedForAdd(new Set());
      }
      setIsOpen(false);
      setHighlightIndex(-1);
      if (onNavigate) {
        e.preventDefault();
        onNavigate(e.shiftKey ? 'prev' : 'next');
      }
    } else if (e.key === 'Escape') {
      setSelectedForAdd(new Set());
      setIsOpen(false);
      setHighlightIndex(-1);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className={`flex flex-wrap items-center gap-1 p-1.5 bg-gray-700 border rounded min-h-[32px] ${
        hasChanges ? 'border-yellow-500' : 'border-gray-600'
      }`}>
        {/* SKU Chips */}
        {skus.map(sku => (
          <span 
            key={sku} 
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-900/50 text-cyan-300 rounded text-xs font-mono"
          >
            {sku}
            <button 
              onClick={() => removeSku(sku)}
              className="hover:text-red-400 transition-colors"
              title="Hapus SKU"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        
        {/* Input for adding new SKU */}
        <input
          ref={(el) => {
            (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
            if (onInputRef) onInputRef(el);
          }}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onPaste={(e) => {
            const pastedText = e.clipboardData.getData('text');
            if (pastedText && tryAddFromRawInput(pastedText)) {
              e.preventDefault();
            }
          }}
          onFocus={() => inputValue && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={skus.length === 0 ? "Ketik SKU..." : "+"}
          className="flex-1 min-w-[60px] bg-transparent text-xs text-gray-200 focus:outline-none placeholder-gray-500"
        />
        
        {/* Save button */}
        {hasChanges && (
          <button
            onClick={onSave}
            disabled={isSaving}
            className="p-1 bg-green-600 hover:bg-green-700 rounded text-white disabled:opacity-50 flex-shrink-0"
            title="Simpan (Enter)"
          >
            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          </button>
        )}
      </div>
      
      {/* Dropdown with multi-select support */}
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50">
          {/* Multi-select hint and confirm button */}
          {selectedForAdd.size > 0 && (
            <div className="px-3 py-2 bg-green-900/30 border-b border-gray-600 flex items-center justify-between">
              <span className="text-xs text-green-400">
                {selectedForAdd.size} SKU dipilih
              </span>
              <button
                onClick={confirmSelection}
                className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded flex items-center gap-1"
              >
                <Check size={12} />
                Simpan Semua
              </button>
            </div>
          )}
          <div className="text-[10px] px-3 py-1 text-gray-500 border-b border-gray-700">
            💡 <kbd className="px-1 bg-gray-700 rounded">Space</kbd> = pilih beberapa SKU sekaligus
          </div>
          <div className="max-h-40 overflow-y-auto">
            {filteredOptions.map((opt, idx) => {
              const isSelected = selectedForAdd.has(opt.part_number);
              return (
                <div
                  key={opt.part_number}
                  ref={(el) => {
                    if (el) optionRefs.current.set(idx, el);
                    else optionRefs.current.delete(idx);
                  }}
                  className={`px-3 py-2 text-xs cursor-pointer transition-colors flex items-center gap-2 ${
                    idx === highlightIndex 
                      ? 'bg-cyan-600 text-white' 
                      : isSelected
                        ? 'bg-green-900/30 text-green-300'
                        : 'text-gray-300 hover:bg-gray-700'
                  }`}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                      // Multi-select with modifier key
                      toggleSelection(opt.part_number);
                    } else if (selectedForAdd.size > 0) {
                      // Already in multi-select mode, toggle
                      toggleSelection(opt.part_number);
                    } else {
                      // Single select - save immediately
                      addSku(opt.part_number);
                    }
                  }}
                  onMouseEnter={() => setHighlightIndex(idx)}
                >
                  {/* Checkbox */}
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    isSelected 
                      ? 'bg-green-500 border-green-500' 
                      : 'border-gray-500'
                  }`}>
                    {isSelected && <Check size={10} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-medium">{opt.part_number}</div>
                    <div className={`text-[10px] truncate ${
                      idx === highlightIndex ? 'text-cyan-200' : isSelected ? 'text-green-400' : 'text-gray-500'
                    }`}>{opt.name}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Clickable Thumbnail with Zoom
const ClickableThumbnail: React.FC<{
  url?: string | null;
  onClick?: () => void;
}> = ({ url, onClick }) => {
  if (!url) {
    return (
      <div className="w-12 h-12 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
        <Image size={14} className="text-gray-500" />
      </div>
    );
  }
  return (
    <div 
      className="w-12 h-12 relative group cursor-pointer flex-shrink-0"
      onClick={onClick}
    >
      <img 
        src={url} 
        alt="Foto" 
        className="w-12 h-12 object-cover rounded border border-gray-600 group-hover:border-cyan-500 transition-colors"
        onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
        <ZoomIn size={14} className="text-white" />
      </div>
    </div>
  );
};

type FilterType = 'all' | 'with_sku' | 'without_sku';

export const FotoLinkManager: React.FC = () => {
  const [search, setSearch] = useState('');
  const [searchSku, setSearchSku] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FotoLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('without_sku'); // Default to without_sku for batch editing
  
  // Track edited SKUs - key is nama_csv, value is new sku (not used in auto-save mode)
  const [editedSkus, setEditedSkus] = useState<Record<string, string>>({});
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
  
  const [partNumberOptions, setPartNumberOptions] = useState<PartNumberOption[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  
  // Refs for keyboard navigation between rows
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  
  const itemsPerPage = 30; // Fewer items per page for better batch editing experience

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFotoLink(); // tanpa parameter search
      setData(result || []);
    } catch (err: any) {
      console.error('Error loading foto link:', err);
      setError(err?.message || 'Gagal memuat data');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPartNumberOptions = async () => {
    try {
      const result = await fetchAllPartNumbersMJM();
      setPartNumberOptions(result || []);
    } catch (err) {
      console.error('Error loading part numbers:', err);
    }
  };

  useEffect(() => {
    loadData();
    loadPartNumberOptions();
  }, []);

  useEffect(() => {
    // Tidak perlu reload data dari backend saat search berubah, hanya filter di frontend
    setPage(1);
  }, [search]);

  // Auto-hide success message
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const filteredData = useMemo(() => {
    let result = data;
    // Filter by SKU presence
    if (filter === 'with_sku') result = result.filter(d => d.sku && d.sku.trim() !== '');
    if (filter === 'without_sku') result = result.filter(d => !d.sku || d.sku.trim() === '');

    // Filter by nama_csv (multi-keyword, semua kata harus ada, urutan bebas)
    if (search.trim()) {
      const keywords = search.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter(d =>
        keywords.every(kw => d.nama_csv && d.nama_csv.toLowerCase().includes(kw))
      );
    }

    // Filter by SKU search
    if (searchSku.trim()) {
      const skuLower = searchSku.toLowerCase().trim();
      result = result.filter(d => d.sku && d.sku.toLowerCase().includes(skuLower));
    }

    return result;
  }, [data, filter, search, searchSku]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = filteredData.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const stats = useMemo(() => ({
    total: data.length,
    withSku: data.filter(d => d.sku && d.sku.trim() !== '').length,
    withoutSku: data.filter(d => !d.sku || d.sku.trim() === '').length,
  }), [data]);

  // Focus next empty SKU row after save
  const focusNextEmptyRow = (currentNamaCsv: string) => {
    // Get current page data with updated info
    const currentIndex = paginatedData.findIndex(d => d.nama_csv === currentNamaCsv);
    if (currentIndex === -1) return;
    
    // Look for next empty row in current page (after current)
    for (let i = currentIndex + 1; i < paginatedData.length; i++) {
      const row = paginatedData[i];
      const isEmpty = !row.sku || row.sku.trim() === '';
      if (isEmpty) {
        const inputEl = inputRefs.current.get(row.nama_csv);
        if (inputEl) {
          setTimeout(() => inputEl.focus(), 100);
          return;
        }
      }
    }
    
    // If no empty row found after current, check from beginning
    for (let i = 0; i < currentIndex; i++) {
      const row = paginatedData[i];
      const isEmpty = !row.sku || row.sku.trim() === '';
      if (isEmpty) {
        const inputEl = inputRefs.current.get(row.nama_csv);
        if (inputEl) {
          setTimeout(() => inputEl.focus(), 100);
          return;
        }
      }
    }
  };

  const handleSkuChange = (namaCsv: string, newSkus: string[]) => {
    setEditedSkus(prev => ({ ...prev, [namaCsv]: joinSkus(newSkus) }));
  };

  // Auto-save: Add single SKU immediately
  const handleAddSkuDirect = async (namaCsv: string, newSku: string) => {
    const row = data.find(d => d.nama_csv === namaCsv);
    if (!row) return;
    
    const currentSkus = parseSkus(row.sku);
    if (currentSkus.includes(newSku)) return; // Already exists
    
    const updatedSkus = [...currentSkus, newSku];
    const updatedSkuString = joinSkus(updatedSkus);
    
    setSavingRows(prev => new Set(prev).add(namaCsv));
    setError(null);
    try {
      const result = await updateFotoLinkSku(namaCsv, updatedSkuString);
      if (result.success) {
        // Update local data immediately
        setData(prev => prev.map(d => 
          d.nama_csv === namaCsv ? { ...d, sku: updatedSkuString } : d
        ));
        if (result.warning) {
          setError(`⚠️ ${result.warning}`);
        } else {
          setSuccessMsg(`✅ SKU "${newSku}" tersimpan!`);
        }
        // Focus next empty row after successful save
        setTimeout(() => focusNextEmptyRow(namaCsv), 150);
      } else {
        setError(`❌ ${result.error || 'Gagal menyimpan SKU'}`);
      }
    } catch (err: any) {
      setError(`❌ ${err.message || 'Gagal menyimpan SKU'}`);
    } finally {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(namaCsv);
        return next;
      });
    }
  };

  // Auto-save: Remove single SKU immediately
  const handleRemoveSkuDirect = async (namaCsv: string, skuToRemove: string) => {
    const row = data.find(d => d.nama_csv === namaCsv);
    if (!row) return;
    
    const currentSkus = parseSkus(row.sku);
    const updatedSkus = currentSkus.filter(s => s !== skuToRemove);
    const updatedSkuString = joinSkus(updatedSkus);
    
    setSavingRows(prev => new Set(prev).add(namaCsv));
    setError(null);
    try {
      const result = await updateFotoLinkSku(namaCsv, updatedSkuString || '');
      if (result.success) {
        // Update local data immediately
        setData(prev => prev.map(d => 
          d.nama_csv === namaCsv ? { ...d, sku: updatedSkuString } : d
        ));
        setSuccessMsg(`✅ SKU "${skuToRemove}" dihapus`);
      } else {
        setError(`❌ ${result.error || 'Gagal menghapus SKU'}`);
      }
    } catch (err: any) {
      setError(`❌ ${err.message || 'Gagal menghapus SKU'}`);
    } finally {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(namaCsv);
        return next;
      });
    }
  };

  // Auto-save: Add multiple SKUs at once (from multi-select)
  const handleAddMultipleSkusDirect = async (namaCsv: string, newSkus: string[]) => {
    if (newSkus.length === 0) return;
    
    const row = data.find(d => d.nama_csv === namaCsv);
    if (!row) return;
    
    const currentSkus = parseSkus(row.sku);
    // Filter out already existing SKUs
    const skusToAdd = newSkus.filter(s => !currentSkus.includes(s));
    if (skusToAdd.length === 0) {
      setError('⚠️ SKU yang dipilih sudah ada semua');
      return;
    }
    
    const updatedSkus = [...currentSkus, ...skusToAdd];
    const updatedSkuString = joinSkus(updatedSkus);
    
    setSavingRows(prev => new Set(prev).add(namaCsv));
    setError(null);
    try {
      const result = await updateFotoLinkSku(namaCsv, updatedSkuString);
      if (result.success) {
        // Update local data immediately
        setData(prev => prev.map(d => 
          d.nama_csv === namaCsv ? { ...d, sku: updatedSkuString } : d
        ));
        if (result.warning) {
          setError(`⚠️ ${result.warning}`);
        } else {
          setSuccessMsg(`✅ ${skusToAdd.length} SKU tersimpan!`);
        }
        // Focus next empty row after successful save
        setTimeout(() => focusNextEmptyRow(namaCsv), 150);
      } else {
        setError(`❌ ${result.error || 'Gagal menyimpan SKU'}`);
      }
    } catch (err: any) {
      setError(`❌ ${err.message || 'Gagal menyimpan SKU'}`);
    } finally {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(namaCsv);
        return next;
      });
    }
  };

  const handleSaveRow = async (namaCsv: string) => {
    const newSkuString = editedSkus[namaCsv];
    if (!newSkuString || !newSkuString.trim()) return;
    
    const skuArray = parseSkus(newSkuString);
    if (skuArray.length === 0) return;
    
    setSavingRows(prev => new Set(prev).add(namaCsv));
    setError(null);
    try {
      // Save to foto_link with comma-separated SKUs
      const result = await updateFotoLinkSku(namaCsv, newSkuString.trim());
      if (result.success) {
        // Update local data
        setData(prev => prev.map(d => 
          d.nama_csv === namaCsv ? { ...d, sku: newSkuString.trim() } : d
        ));
        // Clear from edited
        setEditedSkus(prev => {
          const next = { ...prev };
          delete next[namaCsv];
          return next;
        });
        // Show success or warning message
        const skuCount = skuArray.length;
        if (result.warning) {
          setError(`⚠️ ${result.warning}`);
        } else {
          setSuccessMsg(`✅ ${skuCount} SKU tersimpan! Foto disalin ke tabel foto untuk setiap SKU.`);
        }
      } else {
        setError(`❌ ${result.error || 'Gagal menyimpan SKU'}`);
      }
    } catch (err: any) {
      setError(`❌ ${err.message || 'Gagal menyimpan SKU'}`);
    } finally {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(namaCsv);
        return next;
      });
    }
  };

  const getCurrentSkus = (row: FotoLinkRow): string[] => {
    // Always return from actual data (not edited), since we auto-save now
    return parseSkus(row.sku);
  };

  const hasChanges = (row: FotoLinkRow): boolean => {
    // With auto-save, there are no pending changes
    return false;
  };

  // Navigate to another row's input
  const handleNavigateRow = (currentNamaCsv: string, direction: 'prev' | 'next') => {
    const currentIndex = paginatedData.findIndex(r => r.nama_csv === currentNamaCsv);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    
    // Handle page boundaries
    if (targetIndex < 0 && page > 1) {
      setPage(p => p - 1);
      // Focus will be handled after page change
      return;
    }
    if (targetIndex >= paginatedData.length && page < totalPages) {
      setPage(p => p + 1);
      return;
    }

    const targetRow = paginatedData[targetIndex];
    if (targetRow) {
      const targetInput = inputRefs.current.get(targetRow.nama_csv);
      if (targetInput) {
        targetInput.focus();
        targetInput.select();
      }
    }
  };

  // Loading state
  if (loading && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={48} className="animate-spin text-purple-400 mb-4" />
        <p className="text-gray-400">Memuat data foto_link...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-900/30 rounded-lg">
            <Link2 size={20} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-100">Foto Link Manager</h2>
            <p className="text-xs text-gray-400">Auto-save: Pilih SKU dari dropdown untuk langsung simpan</p>
          </div>
        </div>
        <button
          onClick={() => loadData()}
          disabled={loading}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-purple-400' : 'text-gray-300'} />
        </button>
      </div>
      
      {/* Keyboard Hints */}
      <div className="mb-2 text-xs text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>⌨️ Ketik SKU → pilih dengan <kbd className="px-1 bg-gray-700 rounded">↑↓</kbd> → <kbd className="px-1 bg-gray-700 rounded">Enter</kbd> = Auto Save</span>
        <span><kbd className="px-1 bg-gray-700 rounded">Space</kbd> = Multi-select (checklist)</span>
        <span><kbd className="px-1 bg-gray-700 rounded">Backspace</kbd> = Hapus SKU terakhir</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button 
          onClick={() => { setFilter('all'); setPage(1); }}
          className={`rounded-lg p-2 text-center border transition-colors ${
            filter === 'all' ? 'bg-gray-700 border-purple-500' : 'bg-gray-800 border-gray-700 hover:border-gray-600'
          }`}
        >
          <div className="text-xl font-bold text-gray-100">{stats.total}</div>
          <div className="text-xs text-gray-400">Total</div>
        </button>
        <button 
          onClick={() => { setFilter('with_sku'); setPage(1); }}
          className={`rounded-lg p-2 text-center border transition-colors ${
            filter === 'with_sku' ? 'bg-green-900/30 border-green-500' : 'bg-green-900/20 border-green-900/50 hover:border-green-700'
          }`}
        >
          <div className="text-xl font-bold text-green-400">{stats.withSku}</div>
          <div className="text-xs text-gray-400">Ada SKU</div>
        </button>
        <button 
          onClick={() => { setFilter('without_sku'); setPage(1); }}
          className={`rounded-lg p-2 text-center border transition-colors ${
            filter === 'without_sku' ? 'bg-yellow-900/30 border-yellow-500' : 'bg-yellow-900/20 border-yellow-900/50 hover:border-yellow-700'
          }`}
        >
          <div className="text-xl font-bold text-yellow-400">{stats.withoutSku}</div>
          <div className="text-xs text-gray-400">Belum SKU</div>
        </button>
      </div>

      {/* Search */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Cari nama CSV..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 focus:border-purple-500 outline-none"
          />
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Cari SKU..."
            value={searchSku}
            onChange={(e) => { setSearchSku(e.target.value); setPage(1); }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 focus:border-cyan-500 outline-none"
          />
        </div>
      </div>

      {/* Success Message */}
      {successMsg && (
        <div className="mb-4 p-3 bg-green-900/30 border border-green-900/50 rounded-lg text-green-400 text-sm flex items-center gap-2">
          <Check size={16} />
          <span className="flex-1">{successMsg}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-900/50 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-300">
            <tr>
              <th className="px-2 py-2 text-left text-xs w-10">#</th>
              <th className="px-2 py-2 text-left text-xs">Nama CSV</th>
              <th className="px-2 py-2 text-left text-xs w-48">SKU (dari base_mjm)</th>
              <th className="px-2 py-2 text-center text-xs w-48">Foto (klik untuk zoom)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  {loading ? 'Memuat...' : filter === 'without_sku' ? 'Semua item sudah memiliki SKU!' : 'Tidak ada data'}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => {
                const currentSkus = getCurrentSkus(row);
                const rowHasChanges = hasChanges(row);
                const isSaving = savingRows.has(row.nama_csv);
                const hasSku = row.sku && row.sku.trim() !== '';
                
                return (
                  <tr 
                    key={row.nama_csv} 
                    className={`${rowHasChanges ? 'bg-yellow-900/20' : hasSku ? 'bg-gray-900' : 'bg-gray-900/50'} hover:bg-gray-800/50`}
                  >
                    <td className="px-2 py-3 text-gray-500 text-xs">
                      {(page - 1) * itemsPerPage + idx + 1}
                    </td>
                    <td className="px-2 py-3">
                      <div className="text-gray-200 text-xs" title={row.nama_csv}>
                        {row.nama_csv}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <MultiSkuInput
                        options={partNumberOptions}
                        skus={currentSkus}
                        onChange={(skus) => handleSkuChange(row.nama_csv, skus)}
                        onSave={() => handleSaveRow(row.nama_csv)}
                        onAddSku={(sku) => handleAddSkuDirect(row.nama_csv, sku)}
                        onRemoveSku={(sku) => handleRemoveSkuDirect(row.nama_csv, sku)}
                        onAddMultipleSkus={(skus) => handleAddMultipleSkusDirect(row.nama_csv, skus)}
                        isSaving={isSaving}
                        hasChanges={rowHasChanges}
                        onNavigate={(dir) => handleNavigateRow(row.nama_csv, dir)}
                        onInputRef={(el) => {
                          if (el) inputRefs.current.set(row.nama_csv, el);
                          else inputRefs.current.delete(row.nama_csv);
                        }}
                      />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex justify-center gap-1">
                        <ClickableThumbnail 
                          url={row.foto_1} 
                          onClick={() => { if (row.foto_1) { setPreviewImage(row.foto_1); setPreviewTitle(row.nama_csv); }}}
                        />
                        <ClickableThumbnail 
                          url={row.foto_2} 
                          onClick={() => { if (row.foto_2) { setPreviewImage(row.foto_2); setPreviewTitle(row.nama_csv); }}}
                        />
                        <ClickableThumbnail 
                          url={row.foto_3} 
                          onClick={() => { if (row.foto_3) { setPreviewImage(row.foto_3); setPreviewTitle(row.nama_csv); }}}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4 bg-gray-800 p-2 rounded-lg border border-gray-700">
        <button 
          onClick={() => setPage(p => Math.max(1, p - 1))} 
          disabled={page === 1}
          className="px-3 py-1 bg-gray-700 rounded disabled:opacity-30 text-sm"
        >
          <ChevronLeft size={16} className="inline" /> Prev
        </button>
        <span className="text-xs text-gray-400">
          Hal {page}/{totalPages} ({filteredData.length} item)
        </span>
        <button 
          onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
          disabled={page === totalPages}
          className="px-3 py-1 bg-gray-700 rounded disabled:opacity-30 text-sm"
        >
          Next <ChevronRight size={16} className="inline" />
        </button>
      </div>

      {/* Image Preview Modal - Single Large Image */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => { setPreviewImage(null); setPreviewTitle(''); }}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent">
              <div className="text-sm font-medium text-white truncate pr-10">{previewTitle}</div>
            </div>
            <button 
              onClick={() => { setPreviewImage(null); setPreviewTitle(''); }}
              className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white z-10"
            >
              <X size={20} />
            </button>
            <img 
              src={previewImage} 
              alt="Preview" 
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};
