// FILE: src/components/Dashboard.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { InventoryItem, Order, StockHistory } from '../types';
// Pastikan import ini sesuai
import {
  fetchInventoryPaginated,
  fetchInventoryStats,
  fetchInventoryAllFiltered,
  fetchSearchSuggestions,
  InventoryBatchInsertResult
} from '../services/supabaseService';
import { ItemForm } from './ItemForm';
import { InventoryBatchAddModal } from './InventoryBatchAddModal';
import { DashboardStats } from './DashboardStats';
import { DashboardFilterBar } from './DashboardFilterBar';
import { InventoryList } from './InventoryList';
import { GlobalHistoryModal } from './GlobalHistoryModal';
import { ItemHistoryModal } from './ItemHistoryModal';
import { AssetProfitModal } from './AssetProfitModal';
import { useStore } from '../context/StoreContext';

interface DashboardProps {
  items: InventoryItem[]; 
  orders: Order[];
  history: StockHistory[];
  refreshTrigger: number;
  onViewOrders: () => void;
  onAddNew: () => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  canDelete?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  history, refreshTrigger, onDelete, canDelete = false 
}) => {
  // --- CONTEXT ---
  const { selectedStore } = useStore();
  
  // --- STATE ---
  const [localItems, setLocalItems] = useState<InventoryItem[]>([]);
  const [allItems, setAllItems] = useState<InventoryItem[]>([]); // Store all items when sorting
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Filter States (now with dropdowns)
  const [partNumber, setPartNumber] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [appSearch, setAppSearch] = useState('');
  // Debounced for server fetch
  const [debouncedPartNumber, setDebouncedPartNumber] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [debouncedBrand, setDebouncedBrand] = useState('');
  const [debouncedApp, setDebouncedApp] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'low' | 'empty'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [priceSort, setPriceSort] = useState<'none' | 'asc' | 'desc'>('none');
  
  // Data States
  const [stats, setStats] = useState({ totalItems: 0, totalStock: 0, totalAsset: 0, todayIn: 0, todayOut: 0 });
  const [showHistoryDetail, setShowHistoryDetail] = useState<'in' | 'out' | 'asset' | null>(null);
  const [selectedItemHistory, setSelectedItemHistory] = useState<InventoryItem | null>(null);
  
  // Form States
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>(undefined);
  const [showBatchForm, setShowBatchForm] = useState(false);
  
  // Cache Key Helper
  const getDashCacheKey = (key: string) => `dash_cache_${selectedStore || 'unknown'}_${key}`;

  // --- EFFECTS ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPartNumber(partNumber);
      setDebouncedName(nameSearch);
      setDebouncedBrand(brandSearch);
      setDebouncedApp(appSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [partNumber, nameSearch, brandSearch, appSearch]);

  // Reset page when filters or sort changes
  useEffect(() => {
    setPage(1);
  }, [debouncedPartNumber, debouncedName, filterType, debouncedBrand, debouncedApp, priceSort]);

  // --- DATA LOADING (BAGIAN YANG DIPERBAIKI) ---
  const loadData = useCallback(async () => {
    let hasCachedData = false;
    // Kita bungkus filter jadi satu objek
    const filters = {
      partNumber: debouncedPartNumber,
      name: debouncedName,
      brand: debouncedBrand,
      app: debouncedApp,
      type: filterType
    };

    // Cek apakah ini tampilan default (Halaman 1, tanpa filter)
    const isDefaultView = page === 1 && !debouncedPartNumber && !debouncedName && !debouncedBrand && !debouncedApp && filterType === 'all' && priceSort === 'none';

    // 1. LOAD CACHE (Hanya untuk default view agar cepat)
    if (isDefaultView && selectedStore) {
      try {
        const cachedList = localStorage.getItem(getDashCacheKey('list_default'));
        if (cachedList) {
          const parsed = JSON.parse(cachedList);
          if (parsed && Array.isArray(parsed.data)) {
             setLocalItems(parsed.data);
             setTotalPages(Math.ceil((parsed.total || 0) / 50));
             hasCachedData = parsed.data.length > 0;
          }
        }
      } catch (e) {}
    }

    // Jika cache ada, tampilkan dulu agar tidak menunggu fetch selesai.
    setLoading(!hasCachedData);

    try {
      // 2. FETCH DATA
      // If price sorting is active, fetch all data
      if (priceSort !== 'none') {
        // PERBAIKAN: Kirim store dulu, baru filters
        const allData = await fetchInventoryAllFiltered(selectedStore, filters);
        setAllItems(allData);
        setTotalPages(Math.ceil(allData.length / 50));
      } else {
        // Otherwise, use paginated fetch
        // PERBAIKAN: Urutan argumen disesuaikan dengan supabaseService.ts
        // (store, page, perPage, filters)
        const result = await fetchInventoryPaginated(selectedStore, page, 50, filters);
        setLocalItems(result.data);
        setAllItems([]); // Clear all items when not sorting
        // Gunakan result.total dari service baru (sebelumnya mungkin result.count)
        const totalCount = result.total || 0;
        setTotalPages(Math.ceil(totalCount / 50));
        
        // 3. SAVE CACHE (Jika default view)
        if (isDefaultView && selectedStore) {
          localStorage.setItem(getDashCacheKey('list_default'), JSON.stringify(result));
        }
      }
    } catch (error) {
      console.error("Gagal memuat data dashboard:", error);
    }
    setLoading(false);
  }, [page, debouncedPartNumber, debouncedName, filterType, debouncedBrand, debouncedApp, priceSort, selectedStore]);

  const loadStats = useCallback(async () => {
    // 1. LOAD CACHE STATS
    if (selectedStore) {
      try {
        const cachedStats = localStorage.getItem(getDashCacheKey('stats'));
        if (cachedStats) setStats(JSON.parse(cachedStats));
      } catch(e) {}
    }

    // 2. FETCH STATS
    // fetchInventoryStats sekarang sudah menghitung semua: totalItems, totalStock, totalAsset, todayIn, todayOut
    const invStats = await fetchInventoryStats(selectedStore);
    setStats({
      totalItems: invStats.totalItems || 0,
      totalStock: invStats.totalStock || 0,
      totalAsset: invStats.totalAsset || 0,
      todayIn: invStats.todayIn || 0,
      todayOut: invStats.todayOut || 0
    });

    // 3. SAVE CACHE STATS
    if (selectedStore) {
      localStorage.setItem(getDashCacheKey('stats'), JSON.stringify(invStats));
    }
  }, [selectedStore]);

  useEffect(() => { loadData(); }, [loadData, refreshTrigger]);
  useEffect(() => { loadStats(); }, [loadStats, refreshTrigger]);

  // --- SORTING ---
  const sortedItems = useMemo(() => {
    // Determine which dataset to use
    const itemsToSort = priceSort !== 'none' ? allItems : localItems;
    
    // Jika tidak ada sort harga, langsung return data dari server (sudah dipaginasi)
    if (priceSort === 'none') return itemsToSort;
    
    // Jika sort harga aktif (pakai allItems), kita sort manual di client
    const sorted = [...itemsToSort].sort((a, b) => {
      const priceA = a.costPrice || a.price || 0;
      const priceB = b.costPrice || b.price || 0;
      
      if (priceSort === 'asc') {
        return priceA - priceB; // Termurah ke Termahal
      } else {
        return priceB - priceA; // Termahal ke Termurah
      }
    });
    
    // Apply pagination manual untuk data yang disort di client
    const pageSize = 50;
    const startIdx = (page - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    return sorted.slice(startIdx, endIdx);
  }, [localItems, allItems, priceSort, page]);

  // --- HANDLERS ---
  const handleEditClick = (item: InventoryItem) => { setEditingItem(item); setShowItemForm(true); };
  const handleAddNewClick = () => { setEditingItem(undefined); setShowItemForm(true); };

  const handleFormSuccess = (updatedItem?: InventoryItem) => {
      if (updatedItem) {
          // Optimistic update
          setLocalItems(currentItems => currentItems.map(item => item.id === updatedItem.id ? updatedItem : item));
          if (editingItem) {
             const diff = updatedItem.quantity - editingItem.quantity;
             setStats(prev => ({ ...prev, totalStock: prev.totalStock + diff }));
          }
          setShowItemForm(false);
          loadData(); // Reload data untuk memastikan sinkron
      } else {
          // Barang baru ditambahkan - reset filter agar terlihat di list
          setPartNumber('');
          setNameSearch('');
          setBrandSearch('');
          setAppSearch('');
          setFilterType('all');
          setPage(1);
          setShowItemForm(false);
          loadData(); 
          loadStats();
      }
  };

  const handleBatchSaveSuccess = (result: InventoryBatchInsertResult) => {
    const lines = [
      `Simpan batch selesai.`,
      `Berhasil: ${result.inserted}`,
      `Sudah ada (skip): ${result.skippedExisting}`,
      `Duplikat di input (skip): ${result.skippedDuplicateInput}`,
      `Baris invalid (skip): ${result.skippedInvalid}`,
      `Baris kosong (skip): ${result.skippedEmpty}`
    ];
    if (result.errors.length > 0) {
      lines.push(`Error: ${result.errors.slice(0, 3).join(' | ')}`);
    }
    alert(lines.join('\n'));
    setShowBatchForm(false);
    loadData();
    loadStats();
  };

  // --- Search Suggestions from Database ---
  const [partNumberOptions, setPartNumberOptions] = useState<string[]>([]);
  const [nameOptions, setNameOptions] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [appOptions, setAppOptions] = useState<string[]>([]);
  const suggestionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch suggestions dynamically based on search input
  useEffect(() => {
    if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current);
    suggestionTimeoutRef.current = setTimeout(async () => {
      if (partNumber.length >= 1) {
        const suggestions = await fetchSearchSuggestions(selectedStore, 'part_number', partNumber);
        setPartNumberOptions(suggestions);
      } else {
        setPartNumberOptions([]);
      }
    }, 200);
    return () => { if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current); };
  }, [partNumber, selectedStore]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (nameSearch.length >= 1) {
        const suggestions = await fetchSearchSuggestions(selectedStore, 'name', nameSearch);
        setNameOptions(suggestions);
      } else {
        setNameOptions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [nameSearch, selectedStore]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (brandSearch.length >= 1) {
        // Brand = merek spare part = kolom brand di DB
        const suggestions = await fetchSearchSuggestions(selectedStore, 'brand', brandSearch);
        setBrandOptions(suggestions);
      } else {
        setBrandOptions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [brandSearch, selectedStore]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (appSearch.length >= 1) {
        // Application = jenis mobil = kolom application di DB
        const suggestions = await fetchSearchSuggestions(selectedStore, 'application', appSearch);
        setAppOptions(suggestions);
      } else {
        setAppOptions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [appSearch, selectedStore]);

  // --- RENDER ---
  return (
    <div className="bg-gray-900 min-h-screen pb-24 md:pb-4 font-sans text-gray-100">
      {showItemForm && ( 
        <ItemForm initialData={editingItem} onCancel={() => setShowItemForm(false)} onSuccess={handleFormSuccess} /> 
      )}
      {showBatchForm && (
        <InventoryBatchAddModal
          onClose={() => setShowBatchForm(false)}
          onSaved={handleBatchSaveSuccess}
        />
      )}

      {/* 1. STATS SECTION */}
      <DashboardStats stats={stats} onShowDetail={setShowHistoryDetail} />

      {/* 2. FILTER BAR */}
      <DashboardFilterBar 
        partNumber={partNumber} setPartNumber={setPartNumber} partNumberOptions={partNumberOptions}
        nameSearch={nameSearch} setNameSearch={setNameSearch} nameOptions={nameOptions}
        brandSearch={brandSearch} setBrandSearch={setBrandSearch} brandOptions={brandOptions}
        appSearch={appSearch} setAppSearch={setAppSearch} appOptions={appOptions}
        filterType={filterType} setFilterType={setFilterType}
        viewMode={viewMode} setViewMode={setViewMode}
        priceSort={priceSort} setPriceSort={setPriceSort}
        onAddNew={handleAddNewClick}
        onAddBatch={() => setShowBatchForm(true)}
      />

      {/* 3. INVENTORY LIST */}
      <div className="p-4">
        <InventoryList 
          loading={loading}
          items={sortedItems}
          viewMode={viewMode}
          page={page}
          totalPages={totalPages}
          setPage={setPage}
          onEdit={handleEditClick}
          onDelete={onDelete}
          onShowHistory={setSelectedItemHistory}
          canDelete={canDelete}
        />
      </div>

      {/* 4. MODALS */}
      {(showHistoryDetail === 'in' || showHistoryDetail === 'out') && (
        <GlobalHistoryModal type={showHistoryDetail} onClose={() => setShowHistoryDetail(null)} />
      )}

      {showHistoryDetail === 'asset' && (
        <AssetProfitModal onClose={() => setShowHistoryDetail(null)} />
      )}

      {selectedItemHistory && (
        <ItemHistoryModal item={selectedItemHistory} onClose={() => setSelectedItemHistory(null)} />
      )}
    </div>
  );
};
