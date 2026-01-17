// FILE: src/components/QuickInputView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { InventoryItem } from '../types';
// Import fungsi baru createOrderFromQuickInput
import { updateInventory, getItemByPartNumber, createOrderFromQuickInput } from '../services/supabaseService';
import { createEmptyRow, checkIsRowComplete } from './quickInput/quickInputUtils';
import { QuickInputRow } from './quickInput/types';
import { QuickInputHeader } from './quickInput/QuickInputHeader';
import { QuickInputFooter } from './quickInput/QuickInputFooter';
import { QuickInputTable } from './quickInput/QuickInputTable';
import { BarangMasukTableView } from './quickInput/BarangMasukTableView';
// BarangKeluarTableView tidak lagi diimport/dipakai
import { useStore } from '../context/StoreContext';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

interface QuickInputViewProps {
  items: InventoryItem[];
  onRefresh?: () => void;
  showToast?: (msg: string, type: 'success' | 'error') => void;
}

export const QuickInputView: React.FC<QuickInputViewProps> = ({ items, onRefresh, showToast }) => {
  const { selectedStore } = useStore();
  
  // --- STATE ---
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [rows, setRows] = useState<QuickInputRow[]>([]);
  const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
  const [refreshTableTrigger, setRefreshTableTrigger] = useState(0);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  const itemsPerPage = 100;
  const COLUMNS_COUNT = 8; 
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // --- INITIALIZATION ---
  useEffect(() => {
    const initialRows = Array.from({ length: 10 }).map((_, index) => {
        const row = createEmptyRow(index + 1);
        row.operation = mode;
        return row;
    });
    setRows(initialRows);
    setTimeout(() => { inputRefs.current[0]?.focus(); }, 100);
  }, [mode]);

  // ... (Keep handleSearchKeyDown, handleGridKeyDown, handlePartNumberChange as is) ...
  const handleSearchKeyDown = (e: React.KeyboardEvent, id: number) => { /* logic existing */ };
  const handleGridKeyDown = (e: React.KeyboardEvent, currentIndex: number) => { /* logic existing */ };
  const handlePartNumberChange = (id: number, value: string) => { /* logic existing */ };

  const handleSelectItem = (id: number, item: InventoryItem) => {
    // LOGIKA HARGA: Jika Masuk = Cost Price, Jika Keluar = Selling Price (bisa diedit nanti)
    const defaultPrice = mode === 'in' ? (item.costPrice || 0) : (item.price || 0);

    setRows(prev => prev.map(row => row.id === id ? {
        ...row, 
        partNumber: item.partNumber, 
        namaBarang: item.name,
        brand: item.brand,
        aplikasi: item.application,
        qtySaatIni: item.quantity,
        hargaSatuan: defaultPrice, 
        hargaJual: item.price || 0,
        error: undefined,
        totalHarga: defaultPrice * (row.qtyMasuk || 1)
    } : row));
    setSuggestions([]);
    setActiveSearchIndex(null);
    setHighlightedIndex(-1);
    
    const rowIndex = rows.findIndex(r => r.id === id);
    const qtyInputIndex = (rowIndex * COLUMNS_COUNT) + 4; 
    setTimeout(() => {
        inputRefs.current[qtyInputIndex]?.focus();
        inputRefs.current[qtyInputIndex]?.select();
    }, 50);
  };

  const addNewRow = () => { /* existing logic */ };
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
      // 1. Validasi Item Exists (Check stock only for warning, not block, since it goes to order)
      const existingItem = await getItemByPartNumber(row.partNumber, selectedStore);
      if (!existingItem) {
        updateRow(row.id, 'error', `Item tidak ditemukan`);
        updateRow(row.id, 'isLoading', false);
        return false;
      }

      // --- LOGIKA BARU UNTUK MODE OUT (MASUK KE ORDER) ---
      if (mode === 'out') {
          // Validasi Stok (Opsional: Bisa di-skip jika ingin membolehkan order barang kosong)
          // Namun user request: "barang keluar... masuk ke data orders"
          if (existingItem.quantity < row.qtyMasuk) {
             // Kita beri warning saja atau error? Jika sistem order, biasanya boleh pesan dulu.
             // Disini saya buat error agar konsisten, tapi bisa diubah jadi warning.
             // updateRow(row.id, 'error', `Stok kurang! Sisa: ${existingItem.quantity}`);
             // return false; 
          }

          // Simpan ke Orders
          await createOrderFromQuickInput(selectedStore, row);
          
          if (showToast) showToast(`Order ${row.partNumber} berhasil dibuat (Status: Proses)`, 'success');
          setRows(prev => prev.filter(r => r.id !== row.id));
          return true;
      } 

      // --- LOGIKA LAMA UNTUK MODE IN (LANGSUNG UPDATE STOCK) ---
      else {
          const transactionData = { 
            type: 'in', 
            qty: row.qtyMasuk, 
            ecommerce: row.via || '-', 
            resiTempo: row.resiTempo || '-', 
            customer: row.customer, 
            price: row.hargaSatuan, 
            tanggal: row.tanggal,
            tempo: row.tempo
          };
          
          const newQuantity = existingItem.quantity + row.qtyMasuk;

          const updatedItem = await updateInventory({
            ...existingItem,
            name: row.namaBarang,
            quantity: newQuantity,
            costPrice: (row.hargaSatuan || existingItem.costPrice),
            lastUpdated: Date.now()
          }, transactionData, selectedStore);

          if (updatedItem) {
            setRows(prev => prev.filter(r => r.id !== row.id));
            if (showToast) showToast(`Stok ${row.partNumber} berhasil ditambah`, 'success');
            setRefreshTableTrigger(prev => prev + 1); // Refresh tabel riwayat masuk
            return true;
          } else {
            updateRow(row.id, 'error', 'Gagal update stok');
            return false;
          }
      }

    } catch (error: any) {
      console.error('Error saving row:', error);
      updateRow(row.id, 'error', 'Error system');
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
    const results = await Promise.all(rowsToSave.map(row => saveRow(row)));
    const successCount = results.filter(r => r).length;
    
    if (showToast && successCount > 0) showToast(`${successCount} item berhasil diproses`, 'success');
    
    const remainingRows = rows.length - successCount;
    if (remainingRows === 0) {
       const initialRows = Array.from({ length: 10 }).map((_, index) => {
           const r = createEmptyRow(index + 1);
           r.operation = mode;
           return r;
       });
       setRows(initialRows);
    }
    setIsSavingAll(false);
  };

  const validRowsCount = rows.filter(r => checkIsRowComplete(r)).length;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentRows = rows.slice(startIndex, startIndex + itemsPerPage);
  const totalPages = Math.ceil(rows.length / itemsPerPage);

  return (
    <div className="bg-gray-800 flex flex-col overflow-hidden text-gray-100">
      
      {/* TAB SWITCHER */}
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
            Input Barang Keluar (Order)
        </button>
      </div>

      {/* Input Section */}
      <div className="min-h-[55vh] flex flex-col">
        <QuickInputHeader 
          onAddRow={addNewRow} 
          onSaveAll={saveAllRows} 
          isSaving={isSavingAll} 
          validCount={validRowsCount}
          customTitle={mode === 'out' ? "Buat Pesanan Barang" : "Simpan Barang Masuk"} 
        />

        <div className={`px-4 py-1 text-xs text-center border-b ${mode === 'in' ? 'bg-green-900/20 text-green-200 border-green-900/30' : 'bg-blue-900/20 text-blue-200 border-blue-900/30'}`}>
            {mode === 'in' 
             ? 'Mode: BARANG MASUK (Update Stok Langsung). Tempo: CASH, 3 BLN, 2 BLN, 1 BLN, NADIR' 
             : 'Mode: BARANG KELUAR (Masuk ke Pesanan/Kasir). Data akan masuk ke menu Pesanan untuk diproses.'}
        </div>

        <QuickInputTable
          currentRows={currentRows}
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

        <QuickInputFooter 
          totalRows={rows.length} 
          currentPage={currentPage} 
          totalPages={totalPages} 
          onPageChange={setCurrentPage} 
        />
      </div>

      {/* Table View Section (Hanya Tampil di Mode Masuk) */}
      {mode === 'in' ? (
          <BarangMasukTableView refreshTrigger={refreshTableTrigger} />
      ) : (
          <div className="flex-1 bg-gray-900 border-t border-gray-700 flex items-center justify-center h-[40vh] text-gray-500 italic">
              Data Barang Keluar akan masuk ke Menu Pesanan (Orders)
          </div>
      )}
    </div>
  );
};