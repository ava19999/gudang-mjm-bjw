// FILE: src/components/GlobalHistoryModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { StockHistory } from '../types';
import { fetchHistoryLogsPaginated } from '../services/supabaseService';
import { HistoryTable, SortConfig } from './HistoryTable';
import { Loader2, X, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, User, Hash } from 'lucide-react';
import { useStore } from '../context/StoreContext';

interface GlobalHistoryModalProps {
  type: 'in' | 'out';
  onClose: () => void;
}

const ITEMS_PER_PAGE = 50;

export const GlobalHistoryModal: React.FC<GlobalHistoryModalProps> = ({ type, onClose }) => {
  const { selectedStore } = useStore();
  const [allData, setAllData] = useState<StockHistory[]>([]); // All data from server
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState('');
  
  // Filter states
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterPartNumber, setFilterPartNumber] = useState('');
  
  // Sort state
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'timestamp', direction: 'desc' });

  // Load ALL data once on mount
  useEffect(() => {
    setLoading(true);
    setLoadingProgress('Mengambil data...');
    
    const loadAllData = async () => {
      try {
        // Load all data (use large limit)
        const { data: result, count } = await fetchHistoryLogsPaginated(
          type, 
          1, 
          100000, // Get all data
          {}, 
          selectedStore,
          'timestamp',
          'desc'
        );
        setAllData(result);
        setLoadingProgress(`${count.toLocaleString('id-ID')} data dimuat`);
      } catch (error) {
        console.error('Error loading data:', error);
        setAllData([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadAllData();
  }, [type, selectedStore]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filterCustomer, filterPartNumber, sortConfig]);

  // Client-side filtering
  const filteredData = useMemo(() => {
    let result = [...allData];
    
    // Filter by customer/supplier
    if (filterCustomer.trim()) {
      const search = filterCustomer.toLowerCase();
      result = result.filter(item => 
        (item.reason || '').toLowerCase().includes(search) ||
        ((item as any).customer || '').toLowerCase().includes(search)
      );
    }
    
    // Filter by part number or name
    if (filterPartNumber.trim()) {
      const search = filterPartNumber.toLowerCase();
      result = result.filter(item => 
        (item.partNumber || '').toLowerCase().includes(search) ||
        (item.name || '').toLowerCase().includes(search)
      );
    }
    
    return result;
  }, [allData, filterCustomer, filterPartNumber]);

  // Client-side sorting
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      let aVal: any = (a as any)[sortConfig.key!];
      let bVal: any = (b as any)[sortConfig.key!];
      
      // Handle special cases
      if (sortConfig.key === 'customer') {
        aVal = ((a as any).customer || a.reason || '').toLowerCase();
        bVal = ((b as any).customer || b.reason || '').toLowerCase();
      }
      
      // Handle numeric values
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      // Handle null/undefined
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      
      // Handle string values
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Client-side pagination
  const paginatedData = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedData.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedData, page]);

  const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE);
  const totalCount = sortedData.length;

  // Handle sort
  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
        <div className="bg-gray-800 rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col border border-gray-700 shadow-2xl m-4">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 rounded-t-2xl">
                <h3 className="font-bold text-gray-100 flex items-center gap-2">{type === 'in' ? <TrendingUp className="text-green-500" size={20}/> : <TrendingDown className="text-red-500" size={20}/>} Detail Barang {type === 'in' ? 'Masuk' : 'Keluar'}</h3>
                <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded-full"><X size={20}/></button>
            </div>
            
            {/* Filter Bar */}
            <div className="p-3 border-b border-gray-700 bg-gray-800 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input 
                        type="text" 
                        placeholder="Cari Pelanggan..." 
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 focus:border-blue-500 outline-none" 
                        value={filterCustomer} 
                        onChange={(e) => setFilterCustomer(e.target.value)} 
                        disabled={loading}
                    />
                </div>
                <div className="relative">
                    <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input 
                        type="text" 
                        placeholder="Cari Part Number..." 
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 focus:border-blue-500 outline-none" 
                        value={filterPartNumber} 
                        onChange={(e) => setFilterPartNumber(e.target.value)} 
                        disabled={loading}
                    />
                </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-gray-900/30 p-2">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Loader2 className="animate-spin text-blue-500" size={30}/>
                    <span className="text-sm text-gray-400">{loadingProgress}</span>
                  </div>
                ) : paginatedData.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">Tidak ada data history</div>
                ) : (
                    <HistoryTable data={paginatedData} sortConfig={sortConfig} onSort={handleSort} />
                )}
            </div>
            <div className="p-3 border-t border-gray-700 flex justify-between items-center bg-gray-800 rounded-b-2xl">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading} className="p-2 bg-gray-700 rounded disabled:opacity-30 hover:bg-gray-600 transition-colors"><ChevronLeft size={18}/></button>
                <div className="text-center">
                  <span className="text-xs text-gray-400">Hal {page} / {totalPages || 1}</span>
                  <span className="text-[10px] text-gray-500 ml-2">({totalCount.toLocaleString('id-ID')} item)</span>
                </div>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0 || loading} className="p-2 bg-gray-700 rounded disabled:opacity-30 hover:bg-gray-600 transition-colors"><ChevronRight size={18}/></button>
            </div>
        </div>
    </div>
  );
};
