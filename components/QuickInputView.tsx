// FILE: src/components/QuickInputView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { InventoryItem } from '../types';
import { updateInventory, getItemByPartNumber, saveOfflineOrder, fetchDistinctSuppliers, fetchDistinctCustomers } from '../services/supabaseService';
import { createEmptyRow, checkIsRowComplete } from './quickInput/quickInputUtils';
import { QuickInputRow } from './quickInput/types';
import { QuickInputHeader } from './quickInput/QuickInputHeader';
import { QuickInputFooter } from './quickInput/QuickInputFooter';
import { QuickInputTable } from './quickInput/QuickInputTable';
import { BarangMasukTableView } from './quickInput/BarangMasukTableView';
import { useStore } from '../context/StoreContext';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react'; // Icon untuk tab

interface QuickInputViewProps {
  items: InventoryItem[];
  onRefresh?: () => void;
  showToast?: (msg: string, type: 'success' | 'error') => void;
}

const MIN_QUICK_INPUT_ROWS = 10;

const getQuickInputDraftKey = (store: string | null, mode: 'in' | 'out') =>
  `quick_input_draft_${store || 'mjm'}_${mode}`;

const createInitialRowsForMode = (mode: 'in' | 'out', count: number = MIN_QUICK_INPUT_ROWS): QuickInputRow[] => {
  return Array.from({ length: count }).map((_, index) => {
    const row = createEmptyRow(index + 1);
    row.operation = mode;
    return row;
  });
};

const normalizeDraftRows = (raw: unknown, mode: 'in' | 'out'): QuickInputRow[] => {
  if (!Array.isArray(raw)) return createInitialRowsForMode(mode);

  const hydrated = raw.map((entry, index) => {
    const baseRow = createEmptyRow(index + 1);
    const draft = entry && typeof entry === 'object' ? (entry as Partial<QuickInputRow>) : {};

    return {
      ...baseRow,
      ...draft,
      id: index + 1,
      operation: mode,
      error: undefined,
      isLoading: false
    };
  });

  return hydrated.length > 0 ? hydrated : createInitialRowsForMode(mode);
};

export const QuickInputView: React.FC<QuickInputViewProps> = ({ items, onRefresh, showToast }) => {
  const { selectedStore } = useStore();
  
  // --- STATE ---
  const [mode, setMode] = useState<'in' | 'out'>('in'); // State untuk mode Masuk/Keluar
  const [rows, setRows] = useState<QuickInputRow[]>(() => createInitialRowsForMode('in'));
  const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
  const [supplierList, setSupplierList] = useState<string[]>([]);
  const [customerList, setCustomerList] = useState<string[]>([]);
  const [refreshTableTrigger, setRefreshTableTrigger] = useState(0);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  const itemsPerPage = 100;
  const COLUMNS_COUNT = 8; 
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // --- FETCH SUPPLIERS LIST ---
  useEffect(() => {
    const loadSuppliers = async () => {
      if (selectedStore) {
        const suppliers = await fetchDistinctSuppliers(selectedStore);
        setSupplierList(suppliers);
      }
    };
    loadSuppliers();
  }, [selectedStore]);

  // --- FETCH CUSTOMERS LIST (dari Barang Keluar) ---
  useEffect(() => {
    const loadCustomers = async () => {
      if (selectedStore) {
        const customers = await fetchDistinctCustomers(selectedStore);
        setCustomerList(customers);
      }
    };
    loadCustomers();
  }, [selectedStore]);

  // --- INITIALIZATION / RESTORE DRAFT ---
  useEffect(() => {
    if (!selectedStore) return;

    const storageKey = getQuickInputDraftKey(selectedStore, mode);
    const savedDraft = localStorage.getItem(storageKey);

    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        setRows(normalizeDraftRows(parsed, mode));
      } catch (error) {
        console.warn('Failed to parse quick input draft, reset to initial rows:', error);
        setRows(createInitialRowsForMode(mode));
      }
    } else {
      setRows(createInitialRowsForMode(mode));
    }

    setCurrentPage(1);
    setTimeout(() => { inputRefs.current[0]?.focus(); }, 100);
  }, [mode, selectedStore]);

  // --- PERSIST DRAFT ---
  useEffect(() => {
    if (!selectedStore) return;

    const storageKey = getQuickInputDraftKey(selectedStore, mode);
    const draftRows = rows.map(({ error, isLoading, ...rest }) => ({
      ...rest,
      operation: mode
    }));

    localStorage.setItem(storageKey, JSON.stringify(draftRows));
  }, [rows, mode, selectedStore]);

  // --- HANDLERS ---
  const handleSearchKeyDown = (e: React.KeyboardEvent, id: number) => {
    // Handle dropdown navigation for part number suggestions
    if (suggestions.length > 0 && activeSearchIndex !== null) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
            return;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
            return;
        } else if (e.key === 'Enter') {
            if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
                e.preventDefault();
                e.stopPropagation();
                handleSelectItem(id, suggestions[highlightedIndex]);
                return;
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setSuggestions([]);
            setActiveSearchIndex(null);
            setHighlightedIndex(-1);
            return;
        }
    }
    // If no dropdown or not handling dropdown keys, use grid navigation
    const rowIndex = rows.findIndex(r => r.id === id);
    handleGridKeyDown(e, rowIndex * COLUMNS_COUNT + 3); // Part number is column 3
  };

  const handleGridKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    // Skip jika ada modifier key (kecuali Shift untuk Tab)
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    
    let nextIndex = currentIndex;
    const totalInputs = rows.length * COLUMNS_COUNT;
    const target = e.target as HTMLInputElement;
    const currentCol = currentIndex % COLUMNS_COUNT;
    const currentRow = Math.floor(currentIndex / COLUMNS_COUNT);

    switch (e.key) {
        case 'Tab':
            // Tab = maju, Shift+Tab = mundur
            e.preventDefault();
            nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
            break;
        case 'ArrowRight':
            // Pindah ke kanan - selalu pindah jika ada kolom berikutnya
            if (currentCol < COLUMNS_COUNT - 1) {
                // Hanya pindah jika cursor di akhir teks atau input kosong atau select/date
                if (target.type === 'date' || target.tagName === 'SELECT' || 
                    target.selectionStart === target.value?.length || !target.value) {
                    e.preventDefault();
                    nextIndex = currentIndex + 1;
                }
            }
            break;
        case 'ArrowLeft':
            // Pindah ke kiri - selalu pindah jika ada kolom sebelumnya
            if (currentCol > 0) {
                // Hanya pindah jika cursor di awal teks atau input kosong atau select/date
                if (target.type === 'date' || target.tagName === 'SELECT' || 
                    target.selectionStart === 0 || !target.value) {
                    e.preventDefault();
                    nextIndex = currentIndex - 1;
                }
            }
            break;
        case 'ArrowUp':
            // Pindah ke baris atas
            if (currentRow > 0) {
                e.preventDefault();
                nextIndex = currentIndex - COLUMNS_COUNT;
            }
            break;
        case 'ArrowDown':
            // Pindah ke baris bawah
            if (currentRow < rows.length - 1) {
                e.preventDefault();
                nextIndex = currentIndex + COLUMNS_COUNT;
            }
            break;
        case 'Enter':
            e.preventDefault();
            // Enter = pindah ke kolom berikutnya, atau baris berikutnya jika di kolom terakhir
            nextIndex = currentIndex + 1;
            break;
        default: return;
    }
    
    // Batasi index dalam range valid
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= totalInputs) nextIndex = totalInputs - 1;
    
    if (nextIndex !== currentIndex && nextIndex >= 0 && nextIndex < totalInputs) {
        const targetEl = inputRefs.current[nextIndex];
        if (targetEl) {
            targetEl.focus();
            setTimeout(() => {
                if (targetEl.select) targetEl.select();
            }, 0); 
        }
    }
  };

  const handlePartNumberChange = (id: number, value: string) => {
    setRows(prev => prev.map(row => row.id === id ? { ...row, partNumber: value.toUpperCase() } : row));
    const rowIndex = rows.findIndex(r => r.id === id);
    if (value.length >= 2) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
        const lowerVal = value.toLowerCase();
        // Pencarian barang tetap sama
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
    // LOGIKA HARGA BERBEDA UNTUK MASUK VS KELUAR
    const defaultPrice = mode === 'in' ? (item.costPrice || 0) : (item.price || 0);

    setRows(prev => prev.map(row => row.id === id ? {
        ...row, 
        partNumber: item.partNumber, 
        namaBarang: item.name,
        brand: item.brand,
        aplikasi: item.application,
        qtySaatIni: item.quantity,
        hargaSatuan: defaultPrice, 
        hargaJual: item.price || 0, // Tetap simpan harga jual referensi
        error: undefined,
        // Set totalHarga default (qty 1)
        totalHarga: defaultPrice * (row.qtyKeluar || 1)
    } : row));
    setSuggestions([]);
    setActiveSearchIndex(null);
    setHighlightedIndex(-1);
    
    // Auto focus ke kolom Qty
    const rowIndex = rows.findIndex(r => r.id === id);
    const qtyInputIndex = (rowIndex * COLUMNS_COUNT) + 4; 
    setTimeout(() => {
        inputRefs.current[qtyInputIndex]?.focus();
        inputRefs.current[qtyInputIndex]?.select();
    }, 50);
  };

  const addNewRow = () => {
    const maxId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) : 0;
    const newRow = createEmptyRow(maxId + 1);
    newRow.operation = mode; // Set operasi sesuai mode aktif
    setRows(prev => [...prev, newRow]);
    
    // Pagination handling
    const newTotalPages = Math.ceil((rows.length + 1) / itemsPerPage);
    if (newTotalPages > currentPage) setCurrentPage(newTotalPages);
    
    setTimeout(() => { 
        const newIndex = rows.length * COLUMNS_COUNT; 
        inputRefs.current[newIndex]?.focus(); 
    }, 100);
  };

  const removeRow = (id: number) => { setRows(prev => prev.filter(row => row.id !== id)); };

  const updateRow = (id: number, updates: Partial<QuickInputRow> | keyof QuickInputRow, value?: any) => {
    setRows(prev => prev.map(row => {
        if (row.id !== id) return row;
        if (typeof updates === 'string') {
            return { ...row, [updates]: value, error: undefined };
        } else {
            return { ...row, ...updates, error: undefined };
        }
    }));
  };

  const saveRow = async (row: QuickInputRow) => {
    if (!checkIsRowComplete(row)) { updateRow(row.id, 'error', 'Lengkapi semua kolom!'); return false; }
    updateRow(row.id, 'isLoading', true);

    try {
      // Mode 'out' tidak lagi langsung mengubah stok, akan diproses via saveOfflineOrder
      // Validasi stok dilakukan saat ACC pesanan, bukan saat input
      if (mode === 'out') {
        // Validasi item exists saja, stok akan dicek saat ACC pesanan
        const existingItem = await getItemByPartNumber(row.partNumber, selectedStore);
        if (!existingItem) {
          updateRow(row.id, 'error', `Item tidak ditemukan`);
          updateRow(row.id, 'isLoading', false);
          return false;
        }
        
        // TIDAK PERLU validasi stok di sini
        // Stok akan dicek saat ACC pesanan di OrderManagement (processOfflineOrderItem)
        // Jika stok kosong/kurang, pesanan tetap bisa masuk ke offline order
        // Nanti saat ACC pesanan baru akan dicek stoknya
        
        // Return true untuk ditandai berhasil validasi, penyimpanan akan dilakukan di saveAllRows
        updateRow(row.id, 'isLoading', false);
        return true;
      }
      
      // Mode 'in' - existing logic
      // 1. Ambil data terbaru dari server untuk validasi stok
      const existingItem = await getItemByPartNumber(row.partNumber, selectedStore);
      if (!existingItem) {
        updateRow(row.id, 'error', `Item tidak ditemukan`);
        updateRow(row.id, 'isLoading', false);
        return false;
      }
      
      // 3. Siapkan Transaction Data
      const transactionData = { 
        type: mode, // 'in' or 'out'
        qty: row.qtyMasuk, // Gunakan qtyMasuk untuk mode 'in'
        ecommerce: row.via || '-', 
        resiTempo: row.resiTempo || '-', 
        customer: row.customer, 
        price: row.hargaSatuan, // Harga per unit saat transaksi
        tanggal: row.tanggal,
        tempo: row.tempo
      };
      
      // 4. Hitung Stok Baru (hanya untuk 'in')
      const newQuantity = existingItem.quantity + row.qtyMasuk;

      // 5. Update Database
      const updatedItem = await updateInventory({
        ...existingItem,
        name: row.namaBarang,
        quantity: newQuantity,
        // Update harga master hanya jika Barang Masuk (Last Buying Price)
        costPrice: row.hargaSatuan || existingItem.costPrice,
        price: row.hargaJual || existingItem.price,
        lastUpdated: Date.now()
      }, transactionData, selectedStore);

      if (updatedItem) {
        setRows(prev => prev.filter(r => r.id !== row.id));
        if (showToast) showToast(`Item ${row.partNumber} berhasil masuk`, 'success');
        return true;
      } else {
        updateRow(row.id, 'error', 'Gagal simpan');
        return false;
      }
    } catch (error: any) {
      console.error('Error saving row:', error);
      updateRow(row.id, 'error', 'Error');
      return false;
    } finally {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, isLoading: false } : r));
    }
  };

  const saveAllRows = async () => {
    setIsSavingAll(true);
    const rowsToSave = rows.filter(row => checkIsRowComplete(row));
    if (rowsToSave.length === 0) {
        setIsSavingAll(false);
        if (showToast) showToast('Isi lengkap data sebelum menyimpan!', 'error');
        return;
    }
    
    if (mode === 'out') {
      // Barang Keluar: Group by customer + tanggal, save to orders
      // First validate all rows
      const validationResults = await Promise.all(rowsToSave.map(row => saveRow(row)));
      const allValid = validationResults.every(r => r);
      
      if (!allValid) {
        setIsSavingAll(false);
        if (showToast) showToast('Beberapa item gagal validasi. Periksa kembali.', 'error');
        return;
      }
      
      // Group by customer + date (using JSON.stringify for safer key generation)
      const groupedOrders: Record<string, QuickInputRow[]> = {};
      rowsToSave.forEach(row => {
        const key = JSON.stringify([row.customer.trim().toLowerCase(), row.tanggal]);
        if (!groupedOrders[key]) groupedOrders[key] = [];
        groupedOrders[key].push(row);
      });
      
      // Save each group as an order
      let successCount = 0;
      for (const [key, groupRows] of Object.entries(groupedOrders)) {
        const firstRow = groupRows[0];
        const cartItems = groupRows.map(row => ({
          partNumber: row.partNumber,
          name: row.namaBarang,
          cartQuantity: row.qtyKeluar,
          price: row.hargaSatuan,
          brand: row.brand || '',
          application: row.aplikasi || '',
        }));
        
        const success = await saveOfflineOrder(cartItems, firstRow.customer, firstRow.tempo || 'CASH', selectedStore);
        if (success) {
          successCount += groupRows.length;
          // Remove saved rows
          setRows(prev => prev.filter(r => !groupRows.find(gr => gr.id === r.id)));
        }
      }
      
      if (showToast && successCount > 0) {
        showToast(`${successCount} item berhasil disimpan ke Proses Pesanan`, 'success');
      }
      
      if (successCount === rowsToSave.length) {
        // Reset with empty rows
        const initialRows = createInitialRowsForMode(mode);
        setRows(initialRows);
      }
      
      if (onRefresh) onRefresh();
      setRefreshTableTrigger(prev => prev + 1);
    } else {
      // Barang Masuk: existing logic
      const results = await Promise.all(rowsToSave.map(row => saveRow(row)));
      const successCount = results.filter(r => r).length;
      
      if (showToast && successCount > 0) showToast(`${successCount} item berhasil diproses`, 'success');
      if (successCount > 0) {
          if (onRefresh) onRefresh();
          setRefreshTableTrigger(prev => prev + 1); 
      }
      
      const remainingRows = rows.length - successCount;
      if (remainingRows === 0) {
         // Reset dengan rows kosong baru sesuai mode
         const initialRows = createInitialRowsForMode(mode);
         setRows(initialRows);
      }
    }
    
    setIsSavingAll(false);
  };

  const validRowsCount = rows.filter(r => checkIsRowComplete(r)).length;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentRows = rows.slice(startIndex, startIndex + itemsPerPage);
  const totalPages = Math.ceil(rows.length / itemsPerPage);

  return (
    <div className="bg-gray-800 flex flex-col overflow-hidden text-gray-100">
      
      {/* --- TAB SWITCHER (BARU) --- */}
      <div className="flex border-b border-gray-700 bg-gray-900">
        <button
            onClick={() => setMode('in')}
            className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
                mode === 'in' 
                ? 'bg-gray-800 text-green-400 border-t-2 border-green-500' 
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
            }`}
        >
            <ArrowDownCircle size={18} />
            Input Barang Masuk
        </button>
        <button
            onClick={() => setMode('out')}
            className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
                mode === 'out' 
                ? 'bg-gray-800 text-red-400 border-t-2 border-red-500' 
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
            }`}
        >
            <ArrowUpCircle size={18} />
            Input Barang Keluar
        </button>
      </div>

      {/* Input Section */}
      <div className="min-h-[55vh] flex flex-col">
        {/* Header sedikit disesuaikan agar text tombol simpan dinamis */}
        <QuickInputHeader 
          onAddRow={addNewRow} 
          onSaveAll={saveAllRows} 
          isSaving={isSavingAll} 
          validCount={validRowsCount}
          mode={mode}
          customTitle={mode === 'out' ? `Simpan (${validRowsCount})` : undefined} 
        />

        <div className="bg-yellow-900/20 px-4 py-1 text-xs text-yellow-200 text-center border-b border-yellow-900/30">
            Mode: <strong>{mode === 'in' ? 'BARANG MASUK (Tambah Stok)' : 'BARANG KELUAR (Kurangi Stok)'}</strong>. 
            Pastikan pilihan Tempo: <em>CASH, 3 BLN, 2 BLN, TEMPO, atau NADIR</em>.
        </div>

        <QuickInputTable
          currentRows={currentRows}
          startIndex={startIndex}
          activeSearchIndex={activeSearchIndex}
          suggestions={suggestions}
          supplierList={supplierList}
          customerList={customerList}
          inputRefs={inputRefs}
          onPartNumberChange={handlePartNumberChange}
          onSelectItem={handleSelectItem}
          onUpdateRow={updateRow}
          onRemoveRow={removeRow}
          highlightedIndex={highlightedIndex}
          onSearchKeyDown={handleSearchKeyDown}
          onGridKeyDown={handleGridKeyDown}
          mode={mode}
        />

        <QuickInputFooter 
          totalRows={rows.length} 
          currentPage={currentPage} 
          totalPages={totalPages} 
          onPageChange={setCurrentPage} 
        />
      </div>

      {/* Table View Section (Dynamic based on Mode) */}
      {mode === 'in' ? (
          <BarangMasukTableView refreshTrigger={refreshTableTrigger} onRefresh={onRefresh} />
      ) : (
          <div className="bg-gray-900 border-t border-gray-700 p-6 text-center">
              <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 max-w-2xl mx-auto">
                  <h4 className="text-lg font-bold text-red-400 mb-2">📋 Alur Barang Keluar</h4>
                  <p className="text-sm text-gray-300 mb-2">
                      Data akan masuk ke <strong>Proses Pesanan</strong> untuk di-ACC terlebih dahulu.
                  </p>
                  <p className="text-xs text-gray-400">
                      💡 Tips: Customer & tanggal yang sama akan digabung jadi 1 nota.
                  </p>
              </div>
          </div>
      )}
    </div>
  );
};
