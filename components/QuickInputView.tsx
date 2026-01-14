// FILE: src/components/QuickInputView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { InventoryItem } from '../types';
import { updateInventory, getItemByPartNumber } from '../services/supabaseService';
import { createEmptyRow, checkIsRowComplete, createEmptyBarangKeluarRow, checkIsBarangKeluarRowComplete } from './quickInput/quickInputUtils';
import { QuickInputRow, BarangKeluarRow } from './quickInput/types';
import { QuickInputHeader } from './quickInput/QuickInputHeader';
import { QuickInputFooter } from './quickInput/QuickInputFooter';
import { QuickInputTable } from './quickInput/QuickInputTable';
import { BarangKeluarTable } from './quickInput/BarangKeluarTable';
import { BarangMasukTableView } from './quickInput/BarangMasukTableView';
import { useStore } from '../context/StoreContext';

interface QuickInputViewProps {
  items: InventoryItem[];
  onRefresh?: () => void;
  showToast?: (msg: string, type: 'success' | 'error') => void;
}

export const QuickInputView: React.FC<QuickInputViewProps> = ({ items, onRefresh, showToast }) => {
  const { selectedStore } = useStore();
  
  // --- STATE ---
  const [mode, setMode] = useState<'in' | 'out'>('in'); // 'in' = Barang Masuk, 'out' = Barang Keluar
  const [rows, setRows] = useState<QuickInputRow[]>([]);
  const [barangKeluarRows, setBarangKeluarRows] = useState<BarangKeluarRow[]>([]);
  const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
  const [refreshTableTrigger, setRefreshTableTrigger] = useState(0);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  const itemsPerPage = 100;
  const COLUMNS_COUNT_IN = 8; 
  const COLUMNS_COUNT_OUT = 10;
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (mode === 'in' && rows.length === 0) {
      const initialRows = Array.from({ length: 10 }).map((_, index) => createEmptyRow(index + 1));
      setRows(initialRows);
      setTimeout(() => { inputRefs.current[0]?.focus(); }, 100);
    } else if (mode === 'out' && barangKeluarRows.length === 0) {
      const initialRows = Array.from({ length: 10 }).map((_, index) => createEmptyBarangKeluarRow(index + 1));
      setBarangKeluarRows(initialRows);
      setTimeout(() => { inputRefs.current[0]?.focus(); }, 100);
    }
  }, [mode]);

  // --- MODE CHANGE HANDLER ---
  const handleModeChange = (newMode: 'in' | 'out') => {
    setMode(newMode);
    setSuggestions([]);
    setActiveSearchIndex(null);
    setHighlightedIndex(-1);
    setCurrentPage(1);
  };

  // --- HANDLERS ---

  const handleSearchKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (suggestions.length > 0 && activeSearchIndex !== null) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
            return;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
            return;
        } else if (e.key === 'Enter') {
            if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
                e.preventDefault();
                handleSelectItem(id, suggestions[highlightedIndex]);
                return;
            }
        }
    }
    const currentRows = mode === 'in' ? rows : barangKeluarRows;
    const rowIndex = currentRows.findIndex((r: any) => r.id === id);
    const colsCount = mode === 'in' ? COLUMNS_COUNT_IN : COLUMNS_COUNT_OUT;
    handleGridKeyDown(e, rowIndex * colsCount + 0); 
  };

  const handleGridKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    let nextIndex = currentIndex;
    const currentRows = mode === 'in' ? rows : barangKeluarRows;
    const colsCount = mode === 'in' ? COLUMNS_COUNT_IN : COLUMNS_COUNT_OUT;
    const totalInputs = currentRows.length * colsCount;

    switch (e.key) {
        case 'ArrowRight':
            if ((e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value.length) {
                e.preventDefault();
                nextIndex = currentIndex + 1;
            }
            break;
        case 'ArrowLeft':
            if ((e.target as HTMLInputElement).selectionStart === 0) {
                e.preventDefault();
                nextIndex = currentIndex - 1;
            }
            break;
        case 'ArrowUp':
            e.preventDefault();
            nextIndex = currentIndex - colsCount;
            break;
        case 'ArrowDown':
            e.preventDefault();
            nextIndex = currentIndex + colsCount;
            break;
        case 'Enter':
            e.preventDefault();
            nextIndex = currentIndex + 1;
            break;
        default:
            return;
    }

    if (nextIndex >= 0 && nextIndex < totalInputs) {
        const target = inputRefs.current[nextIndex];
        if (target) {
            target.focus();
            setTimeout(() => target.select(), 0); 
        }
    }
  };

  const handlePartNumberChange = (id: number, value: string) => {
    const upperValue = value.toUpperCase();
    
    if (mode === 'in') {
      setRows(prev => prev.map(row => row.id === id ? { ...row, partNumber: upperValue } : row));
    } else {
      setBarangKeluarRows(prev => prev.map(row => row.id === id ? { ...row, partNumber: upperValue } : row));
    }
    
    const currentRows = mode === 'in' ? rows : barangKeluarRows;
    const rowIndex = currentRows.findIndex((r: any) => r.id === id);
    
    if (value.length >= 2) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
        const lowerVal = value.toLowerCase();
        const matches = items.filter(item => item.partNumber && item.partNumber.toLowerCase().includes(lowerVal)).slice(0, 10);
        setSuggestions(matches);
        setActiveSearchIndex(rowIndex);
        setHighlightedIndex(-1);
      }, 300);
    } else {
      setSuggestions([]);
      setActiveSearchIndex(null);
      setHighlightedIndex(-1);
    }
  };

  const handleSelectItem = (id: number, item: InventoryItem) => {
    if (mode === 'in') {
      setRows(prev => prev.map(row => row.id === id ? {
          ...row, 
          partNumber: item.partNumber, 
          namaBarang: item.name,
          brand: item.brand,
          aplikasi: item.application,
          qtySaatIni: item.quantity,
          hargaSatuan: item.costPrice || 0, 
          hargaJual: item.price || 0, 
          error: undefined,
          totalHarga: (item.costPrice || 0) * (row.qtyMasuk || 1)
      } : row));
      
      const rowIndex = rows.findIndex(r => r.id === id);
      const qtyInputIndex = (rowIndex * COLUMNS_COUNT_IN) + 4;
      setTimeout(() => {
          inputRefs.current[qtyInputIndex]?.focus();
          inputRefs.current[qtyInputIndex]?.select();
      }, 50);
    } else {
      setBarangKeluarRows(prev => prev.map(row => row.id === id ? {
          ...row, 
          partNumber: item.partNumber, 
          namaBarang: item.name,
          brand: item.brand,
          aplikasi: item.application,
          rak: item.shelf,
          qtySaatIni: item.quantity,
          error: undefined,
      } : row));
      
      const rowIndex = barangKeluarRows.findIndex(r => r.id === id);
      const qtyInputIndex = (rowIndex * COLUMNS_COUNT_OUT) + 4;
      setTimeout(() => {
          inputRefs.current[qtyInputIndex]?.focus();
          inputRefs.current[qtyInputIndex]?.select();
      }, 50);
    }
    
    setSuggestions([]);
    setActiveSearchIndex(null);
    setHighlightedIndex(-1);
  };

  const addNewRow = () => {
    const currentRows = mode === 'in' ? rows : barangKeluarRows;
    
    // Limit to maximum 15 rows
    if (currentRows.length >= 15) {
      if (showToast) showToast('Maksimal 15 baris untuk Input Barang', 'error');
      return;
    }
    
    const maxId = currentRows.length > 0 ? Math.max(...currentRows.map((r: any) => r.id)) : 0;
    
    if (mode === 'in') {
      setRows(prev => [...prev, createEmptyRow(maxId + 1)]);
    } else {
      setBarangKeluarRows(prev => [...prev, createEmptyBarangKeluarRow(maxId + 1)]);
    }
    
    const newTotalPages = Math.ceil((currentRows.length + 1) / itemsPerPage);
    if (newTotalPages > currentPage) setCurrentPage(newTotalPages);
    
    const colsCount = mode === 'in' ? COLUMNS_COUNT_IN : COLUMNS_COUNT_OUT;
    setTimeout(() => { 
        const newIndex = currentRows.length * colsCount; 
        inputRefs.current[newIndex]?.focus(); 
    }, 100);
  };

  const removeRow = (id: number) => { 
    if (mode === 'in') {
      setRows(prev => prev.filter(row => row.id !== id));
    } else {
      setBarangKeluarRows(prev => prev.filter(row => row.id !== id));
    }
  };

  const updateRow = (id: number, updates: Partial<any> | keyof any, value?: any) => {
    if (mode === 'in') {
      setRows(prev => prev.map(row => {
          if (row.id !== id) return row;
          
          if (typeof updates === 'string') {
              return { ...row, [updates]: value, error: undefined };
          } else {
              return { ...row, ...updates, error: undefined };
          }
      }));
    } else {
      setBarangKeluarRows(prev => prev.map(row => {
          if (row.id !== id) return row;
          
          if (typeof updates === 'string') {
              return { ...row, [updates]: value, error: undefined };
          } else {
              return { ...row, ...updates, error: undefined };
          }
      }));
    }
  };

  const saveRow = async (row: QuickInputRow | BarangKeluarRow) => {
    const isComplete = mode === 'in' 
      ? checkIsRowComplete(row as QuickInputRow)
      : checkIsBarangKeluarRowComplete(row as BarangKeluarRow);
      
    if (!isComplete) { 
      updateRow(row.id, 'error', 'Lengkapi semua kolom!'); 
      return false; 
    }
    
    updateRow(row.id, 'isLoading', true);

    try {
      // Mock save - just log and remove row
      console.log('Mock save:', mode, row);
      
      if (mode === 'in') {
        setRows(prev => prev.filter(r => r.id !== row.id));
      } else {
        setBarangKeluarRows(prev => prev.filter(r => r.id !== row.id));
      }
      
      if (showToast) showToast(`Item ${row.partNumber} berhasil disimpan`, 'success');
      return true;
    } catch (error: any) {
      console.error('Error saving row:', error);
      updateRow(row.id, 'error', 'Error');
      return false;
    } finally {
      if (mode === 'in') {
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, isLoading: false } : r));
      } else {
        setBarangKeluarRows(prev => prev.map(r => r.id === row.id ? { ...r, isLoading: false } : r));
      }
    }
  };

  const saveAllRows = async () => {
    setIsSavingAll(true);
    const currentRows = mode === 'in' ? rows : barangKeluarRows;
    const checkFn = mode === 'in' ? checkIsRowComplete : checkIsBarangKeluarRowComplete;
    
    const rowsToSave = currentRows.filter((row: any) => checkFn(row as any));
    if (rowsToSave.length === 0) {
        setIsSavingAll(false);
        if (showToast) showToast('Isi lengkap data sebelum menyimpan!', 'error');
        return;
    }
    
    const results = await Promise.all(rowsToSave.map(row => saveRow(row as any)));
    const successCount = results.filter(r => r).length;
    
    if (showToast && successCount > 0) showToast(`${successCount} item berhasil disimpan`, 'success');
    if (successCount > 0) {
        if (onRefresh) onRefresh();
        setRefreshTableTrigger(prev => prev + 1);
    }
    
    const remainingRows = currentRows.length - successCount;
    if (remainingRows === 0) {
       if (mode === 'in') {
         const initialRows = Array.from({ length: 10 }).map((_, index) => createEmptyRow(index + 1));
         setRows(initialRows);
       } else {
         const initialRows = Array.from({ length: 10 }).map((_, index) => createEmptyBarangKeluarRow(index + 1));
         setBarangKeluarRows(initialRows);
       }
    }
    setIsSavingAll(false);
  };

  const currentRows = mode === 'in' ? rows : barangKeluarRows;
  const checkFn = mode === 'in' ? checkIsRowComplete : checkIsBarangKeluarRowComplete;
  const validRowsCount = currentRows.filter((r: any) => checkFn(r as any)).length;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayRows = currentRows.slice(startIndex, startIndex + itemsPerPage);
  const totalPages = Math.ceil(currentRows.length / itemsPerPage);

  return (
    <div className="bg-gray-800 flex flex-col overflow-hidden text-gray-100">
      {/* Input Section */}
      <div className="min-h-[60vh]">
        <QuickInputHeader 
          onAddRow={addNewRow} 
          onSaveAll={saveAllRows} 
          isSaving={isSavingAll} 
          validCount={validRowsCount}
          currentRowCount={currentRows.length}
          maxRows={15}
          mode={mode}
          onModeChange={handleModeChange}
        />

        {mode === 'in' ? (
          <QuickInputTable
            currentRows={displayRows as QuickInputRow[]}
            startIndex={startIndex}
            activeSearchIndex={activeSearchIndex}
            suggestions={suggestions}
            inputRefs={inputRefs}
            onPartNumberChange={handlePartNumberChange}
            onSelectItem={handleSelectItem}
            onUpdateRow={updateRow}
            onRemoveRow={removeRow}
            highlightedIndex={highlightedIndex}
            onSearchKeyDown={handleSearchKeyDown}
            onGridKeyDown={handleGridKeyDown}
          />
        ) : (
          <BarangKeluarTable
            currentRows={displayRows as BarangKeluarRow[]}
            startIndex={startIndex}
            activeSearchIndex={activeSearchIndex}
            suggestions={suggestions}
            inputRefs={inputRefs}
            onPartNumberChange={handlePartNumberChange}
            onSelectItem={handleSelectItem}
            onUpdateRow={updateRow}
            onRemoveRow={removeRow}
            highlightedIndex={highlightedIndex}
            onSearchKeyDown={handleSearchKeyDown}
            onGridKeyDown={handleGridKeyDown}
          />
        )}

        <QuickInputFooter 
          totalRows={currentRows.length} 
          currentPage={currentPage} 
          totalPages={totalPages} 
          onPageChange={setCurrentPage} 
        />
      </div>

      {/* Table View Section - Only show for Barang Masuk */}
      {mode === 'in' && <BarangMasukTableView refreshTrigger={refreshTableTrigger} />}
    </div>
  );
};