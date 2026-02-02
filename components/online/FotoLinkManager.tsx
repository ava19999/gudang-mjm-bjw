// FILE: components/online/FotoLinkManager.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Link2, Search, ChevronLeft, ChevronRight, Image, Loader2, RefreshCw, 
  X, Save, AlertCircle, Check, ZoomIn
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

// Inline SKU Input with Autocomplete
const InlineSkuInput: React.FC<{
  options: PartNumberOption[];
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  isSaving?: boolean;
  hasChanges?: boolean;
  rowIndex?: number;
  onNavigate?: (direction: 'prev' | 'next') => void;
  onInputRef?: (el: HTMLInputElement | null) => void;
}> = ({ options, value, onChange, onSave, isSaving, hasChanges, rowIndex, onNavigate, onInputRef }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const filteredOptions = useMemo(() => {
    if (!inputValue.trim()) return [];
    const lowerSearch = inputValue.toLowerCase();
    return options
      .filter(o => 
        o.part_number.toLowerCase().includes(lowerSearch) || 
        o.name.toLowerCase().includes(lowerSearch)
      )
      .slice(0, 30);
  }, [options, inputValue]);

  // Reset highlight when options change
  useEffect(() => {
    setHighlightIndex(-1);
  }, [filteredOptions.length]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightIndex >= 0) {
      const optionEl = optionRefs.current.get(highlightIndex);
      if (optionEl) {
        optionEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex]);

  const selectOption = (opt: PartNumberOption) => {
    setInputValue(opt.part_number);
    onChange(opt.part_number);
    setIsOpen(false);
    setHighlightIndex(-1);
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
      } else if (e.key === 'Enter' && highlightIndex >= 0) {
        e.preventDefault();
        selectOption(filteredOptions[highlightIndex]);
        return;
      }
    }

    // Row navigation (like Excel)
    if (e.key === 'ArrowDown' && !isOpen) {
      e.preventDefault();
      if (onNavigate) onNavigate('next');
      return;
    } else if (e.key === 'ArrowUp' && !isOpen) {
      e.preventDefault();
      if (onNavigate) onNavigate('prev');
      return;
    }

    if (e.key === 'Enter') {
      if (hasChanges) {
        onSave();
      }
      // Move to next row after Enter (like Excel)
      e.preventDefault();
      if (onNavigate) {
        onNavigate('next');
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false);
      setHighlightIndex(-1);
      if (onNavigate) {
        e.preventDefault();
        onNavigate(e.shiftKey ? 'prev' : 'next');
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightIndex(-1);
    }
  };

  return (
    <div className="relative flex items-center gap-1" ref={dropdownRef}>
      <input
        ref={(el) => {
          (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
          if (onInputRef) onInputRef(el);
        }}
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => inputValue && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Ketik SKU..."
        className={`w-full px-2 py-1.5 bg-gray-700 border rounded text-xs text-gray-200 focus:outline-none focus:border-cyan-500 ${
          hasChanges ? 'border-yellow-500' : 'border-gray-600'
        }`}
      />
      
      {hasChanges && (
        <button
          onClick={onSave}
          disabled={isSaving}
          className="p-1.5 bg-green-600 hover:bg-green-700 rounded text-white disabled:opacity-50 flex-shrink-0"
          title="Simpan (Enter)"
        >
          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        </button>
      )}
      
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
          {filteredOptions.map((opt, idx) => (
            <div
              key={opt.part_number}
              ref={(el) => {
                if (el) optionRefs.current.set(idx, el);
                else optionRefs.current.delete(idx);
              }}
              className={`px-3 py-2 text-xs cursor-pointer transition-colors ${
                idx === highlightIndex 
                  ? 'bg-cyan-600 text-white' 
                  : opt.part_number === inputValue 
                    ? 'bg-cyan-900/30 text-cyan-400' 
                    : 'text-gray-300 hover:bg-gray-700'
              }`}
              onClick={() => selectOption(opt)}
              onMouseEnter={() => setHighlightIndex(idx)}
            >
              <div className="font-mono font-medium">{opt.part_number}</div>
              <div className={`text-[10px] truncate ${idx === highlightIndex ? 'text-cyan-200' : 'text-gray-500'}`}>{opt.name}</div>
            </div>
          ))}
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
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FotoLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('without_sku'); // Default to without_sku for batch editing
  
  // Track edited SKUs - key is nama_csv, value is new sku
  const [editedSkus, setEditedSkus] = useState<Record<string, string>>({});
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
  
  const [partNumberOptions, setPartNumberOptions] = useState<PartNumberOption[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [savingAll, setSavingAll] = useState(false);
  
  // Refs for keyboard navigation between rows
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  
  const itemsPerPage = 30; // Fewer items per page for better batch editing experience

  const loadData = async (searchTerm?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFotoLink(searchTerm);
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
    const timer = setTimeout(() => {
      loadData(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Auto-hide success message
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const filteredData = useMemo(() => {
    if (filter === 'with_sku') return data.filter(d => d.sku && d.sku.trim() !== '');
    if (filter === 'without_sku') return data.filter(d => !d.sku || d.sku.trim() === '');
    return data;
  }, [data, filter]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = filteredData.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const stats = useMemo(() => ({
    total: data.length,
    withSku: data.filter(d => d.sku && d.sku.trim() !== '').length,
    withoutSku: data.filter(d => !d.sku || d.sku.trim() === '').length,
  }), [data]);

  const handleSkuChange = (namaCsv: string, newSku: string) => {
    setEditedSkus(prev => ({ ...prev, [namaCsv]: newSku }));
  };

  const handleSaveRow = async (namaCsv: string) => {
    const newSku = editedSkus[namaCsv];
    if (!newSku || !newSku.trim()) return;
    
    setSavingRows(prev => new Set(prev).add(namaCsv));
    setError(null);
    try {
      const result = await updateFotoLinkSku(namaCsv, newSku.trim());
      if (result.success) {
        // Update local data
        setData(prev => prev.map(d => 
          d.nama_csv === namaCsv ? { ...d, sku: newSku.trim() } : d
        ));
        // Clear from edited
        setEditedSkus(prev => {
          const next = { ...prev };
          delete next[namaCsv];
          return next;
        });
        // Show success or warning message
        if (result.warning) {
          setError(`⚠️ ${result.warning}`); // Show warning in orange/yellow
        } else {
          setSuccessMsg(`✅ SKU "${newSku.trim()}" tersimpan! Foto disalin ke tabel foto dan akan muncul di Beranda.`);
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

  const getCurrentSku = (row: FotoLinkRow): string => {
    if (editedSkus.hasOwnProperty(row.nama_csv)) {
      return editedSkus[row.nama_csv];
    }
    return row.sku || '';
  };

  const hasChanges = (row: FotoLinkRow): boolean => {
    if (!editedSkus.hasOwnProperty(row.nama_csv)) return false;
    const originalSku = row.sku || '';
    return editedSkus[row.nama_csv] !== originalSku;
  };

  // Count unsaved changes
  const unsavedCount = useMemo(() => {
    return Object.keys(editedSkus).filter(namaCsv => {
      const row = data.find(d => d.nama_csv === namaCsv);
      if (!row) return false;
      const originalSku = row.sku || '';
      return editedSkus[namaCsv] !== originalSku && editedSkus[namaCsv].trim() !== '';
    }).length;
  }, [editedSkus, data]);

  // Save all unsaved changes
  const handleSaveAll = async () => {
    const toSave = Object.entries(editedSkus).filter(([namaCsv, newSku]) => {
      const row = data.find(d => d.nama_csv === namaCsv);
      if (!row) return false;
      const originalSku = row.sku || '';
      return newSku !== originalSku && newSku.trim() !== '';
    });

    if (toSave.length === 0) return;

    setSavingAll(true);
    setError(null);
    let successCount = 0;
    let errorCount = 0;
    let warnings: string[] = [];

    for (const [namaCsv, newSku] of toSave) {
      setSavingRows(prev => new Set(prev).add(namaCsv));
      try {
        const result = await updateFotoLinkSku(namaCsv, newSku.trim());
        if (result.success) {
          successCount++;
          setData(prev => prev.map(d => 
            d.nama_csv === namaCsv ? { ...d, sku: newSku.trim() } : d
          ));
          setEditedSkus(prev => {
            const next = { ...prev };
            delete next[namaCsv];
            return next;
          });
          if (result.warning) warnings.push(result.warning);
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
      }
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(namaCsv);
        return next;
      });
    }

    setSavingAll(false);
    if (successCount > 0) {
      setSuccessMsg(`✅ ${successCount} SKU berhasil disimpan!${errorCount > 0 ? ` (${errorCount} gagal)` : ''}`);
    }
    if (warnings.length > 0) {
      setError(`⚠️ ${warnings[0]}${warnings.length > 1 ? ` (+${warnings.length - 1} lainnya)` : ''}`);
    } else if (errorCount > 0 && successCount === 0) {
      setError(`❌ Gagal menyimpan ${errorCount} SKU`);
    }
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
            <p className="text-xs text-gray-400">Mapping nama CSV ke SKU - Batch Editing Mode</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unsavedCount > 0 && (
            <button
              onClick={handleSaveAll}
              disabled={savingAll}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {savingAll ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Save All ({unsavedCount})
            </button>
          )}
          <button
            onClick={() => loadData(search)}
            disabled={loading}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-purple-400' : 'text-gray-300'} />
          </button>
        </div>
      </div>
      
      {/* Keyboard Hints */}
      <div className="mb-2 text-xs text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>⌨️ <kbd className="px-1 bg-gray-700 rounded">↑↓</kbd> = Naik/turun baris (seperti Excel)</span>
        <span><kbd className="px-1 bg-gray-700 rounded">Enter</kbd> = Simpan & turun</span>
        <span><kbd className="px-1 bg-gray-700 rounded">Esc</kbd> = Tutup dropdown</span>
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
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Cari nama CSV..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 focus:border-purple-500 outline-none"
        />
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
                const currentSku = getCurrentSku(row);
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
                      <InlineSkuInput
                        options={partNumberOptions}
                        value={currentSku}
                        onChange={(val) => handleSkuChange(row.nama_csv, val)}
                        onSave={() => handleSaveRow(row.nama_csv)}
                        isSaving={isSaving}
                        hasChanges={rowHasChanges}
                        rowIndex={idx}
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
          {unsavedCount > 0 && <span className="text-yellow-400 ml-2">• {unsavedCount} belum disimpan</span>}
        </span>
        <button 
          onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
          disabled={page === totalPages}
          className="px-3 py-1 bg-gray-700 rounded disabled:opacity-30 text-sm"
        >
          Next <ChevronRight size={16} className="inline" />
        </button>
      </div>

      {/* Floating Save All Button */}
      {unsavedCount > 0 && (
        <div className="fixed bottom-6 right-6 z-40">
          <button
            onClick={handleSaveAll}
            disabled={savingAll}
            className="flex items-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl shadow-lg text-sm font-bold disabled:opacity-50 transition-all hover:scale-105"
          >
            {savingAll ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}
            Simpan Semua ({unsavedCount})
          </button>
        </div>
      )}

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
