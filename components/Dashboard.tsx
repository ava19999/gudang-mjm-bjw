// FILE: src/components/Dashboard.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { InventoryItem, Order, StockHistory } from '../types';
// Pastikan import ini sesuai
import { fetchInventoryPaginated, fetchInventoryStats, fetchInventoryAllFiltered } from '../services/supabaseService';
import { ItemForm } from './ItemForm';
import { DashboardStats } from './DashboardStats';
import { DashboardCharts } from './DashboardCharts';
import { DashboardFilterBar } from './DashboardFilterBar';
import { InventoryList } from './InventoryList';
import { GlobalHistoryModal } from './GlobalHistoryModal';
import { ItemHistoryModal } from './ItemHistoryModal';
import { useStore } from '../context/StoreContext';
import { BarChart3 } from 'lucide-react';

interface DashboardProps {
  items: InventoryItem[]; 
  orders: Order[];
  history: StockHistory[];
  refreshTrigger: number;
  onViewOrders: () => void;
  onAddNew: () => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  orders, history, refreshTrigger, onDelete 
}) => {
  // --- CONTEXT ---
  const { selectedStore } = useStore();
  
  // --- STATE ---
  const [localItems, setLocalItems] = useState<InventoryItem[]>([]);
  const [allItems, setAllItems] = useState<InventoryItem[]>([]); // Store all items when sorting
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [debouncedBrand, setDebouncedBrand] = useState('');
  const [appSearch, setAppSearch] = useState('');
  const [debouncedApp, setDebouncedApp] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'low' | 'empty'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [priceSort, setPriceSort] = useState<'none' | 'asc' | 'desc'>('none');
  
  // Dashboard View Toggle
  const [showCharts, setShowCharts] = useState(false);
  
  // Data States
  const [stats, setStats] = useState({ totalItems: 0, totalStock: 0, totalAsset: 0, todayIn: 0, todayOut: 0 });
  const [showHistoryDetail, setShowHistoryDetail] = useState<'in' | 'out' | null>(null);
  const [selectedItemHistory, setSelectedItemHistory] = useState<InventoryItem | null>(null);
  
  // Form States
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>(undefined);

  // --- EFFECTS ---
  useEffect(() => {
    const timer = setTimeout(() => { 
        setDebouncedSearch(searchTerm); 
        setDebouncedBrand(brandSearch);
        setDebouncedApp(appSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, brandSearch, appSearch]);

  // Reset page when filters or sort changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterType, debouncedBrand, debouncedApp, priceSort]);

  // --- DATA LOADING (BAGIAN YANG DIPERBAIKI) ---
  const loadData = useCallback(async () => {
    setLoading(true);
    
    // Kita bungkus filter jadi satu objek
    const filters = {
        search: debouncedSearch,
        brand: debouncedBrand,
        app: debouncedApp,
        type: filterType
    };

    try {
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
        }
    } catch (error) {
        console.error("Gagal memuat data dashboard:", error);
    }
    
    setLoading(false);
  }, [page, debouncedSearch, filterType, debouncedBrand, debouncedApp, priceSort, selectedStore]);

  const loadStats = useCallback(async () => {
    // Bagian ini sudah benar karena fetchInventoryStats hanya butuh parameter store
    const invStats = await fetchInventoryStats(selectedStore);
    
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayIn = history
      .filter(h => h.type === 'in' && h.timestamp && h.timestamp >= startOfDay.getTime())
      .reduce((acc, h) => acc + (Number(h.quantity) || 0), 0);
    const todayOut = history
      .filter(h => h.type === 'out' && h.timestamp && h.timestamp >= startOfDay.getTime())
      .reduce((acc, h) => acc + (Number(h.quantity) || 0), 0);

    setStats({ ...invStats, todayIn, todayOut });
  }, [history, selectedStore]);

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
          setShowItemForm(false);
          loadData(); loadStats();
      }
  };

  // --- RENDER ---
  return (
    <div className="bg-gray-900 min-h-screen pb-24 md:pb-4 font-sans text-gray-100">
      {showItemForm && ( 
        <ItemForm initialData={editingItem} onCancel={() => setShowItemForm(false)} onSuccess={handleFormSuccess} /> 
      )}

      {/* 1. STATS SECTION */}
      <DashboardStats stats={stats} onShowDetail={setShowHistoryDetail} />

      {/* Dashboard Charts Toggle */}
      <div className="px-4 pt-2">
        <button
          onClick={() => setShowCharts(!showCharts)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm font-bold text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          <BarChart3 size={16} />
          {showCharts ? 'Sembunyikan Statistik' : 'Tampilkan Statistik Operasional'}
        </button>
      </div>

      {/* Charts Section */}
      {showCharts && (
        <div className="p-4 animate-in fade-in slide-in-from-top-2">
          <DashboardCharts orders={orders} history={history} />
        </div>
      )}

      {/* 2. FILTER BAR */}
      <DashboardFilterBar 
        searchTerm={searchTerm} setSearchTerm={setSearchTerm}
        brandSearch={brandSearch} setBrandSearch={setBrandSearch}
        appSearch={appSearch} setAppSearch={setAppSearch}
        filterType={filterType} setFilterType={setFilterType}
        viewMode={viewMode} setViewMode={setViewMode}
        priceSort={priceSort} setPriceSort={setPriceSort}
        onAddNew={handleAddNewClick}
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
        />
      </div>

      {/* 4. MODALS */}
      {showHistoryDetail && (
        <GlobalHistoryModal type={showHistoryDetail} onClose={() => setShowHistoryDetail(null)} />
      )}

      {selectedItemHistory && (
        <ItemHistoryModal item={selectedItemHistory} onClose={() => setSelectedItemHistory(null)} />
      )}
    </div>
  );
};