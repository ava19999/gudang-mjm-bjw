// FILE: src/components/GlobalHistoryModal.tsx
import React, { useState, useEffect } from 'react';
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
  const [data, setData] = useState<StockHistory[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  
  // Filter states
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterPartNumber, setFilterPartNumber] = useState('');
  const [debouncedFilterCustomer, setDebouncedFilterCustomer] = useState('');
  const [debouncedFilterPartNumber, setDebouncedFilterPartNumber] = useState('');
  
  // Sort state
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'timestamp', direction: 'desc' });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilterCustomer(filterCustomer);
      setDebouncedFilterPartNumber(filterPartNumber);
    }, 350);
    return () => clearTimeout(timer);
  }, [filterCustomer, filterPartNumber]);

  // Reset page when filters/sort change
  useEffect(() => {
    setPage(1);
  }, [type, selectedStore, debouncedFilterCustomer, debouncedFilterPartNumber, sortConfig]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      setLoadingProgress('Mengambil data...');
      try {
        const { data: result, count } = await fetchHistoryLogsPaginated(
          type,
          page,
          ITEMS_PER_PAGE,
          {
            customer: debouncedFilterCustomer || undefined,
            partNumber: debouncedFilterPartNumber || undefined
          },
          selectedStore,
          sortConfig.key || undefined,
          sortConfig.direction
        );

        if (!cancelled) {
          setData(result);
          setTotalCount(count || 0);
          setLoadingProgress(`${(count || 0).toLocaleString('id-ID')} data ditemukan`);
        }
      } catch (error) {
        console.error('Error loading data:', error);
        if (!cancelled) {
          setData([]);
          setTotalCount(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [type, page, selectedStore, debouncedFilterCustomer, debouncedFilterPartNumber, sortConfig]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

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
                    />
                </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-gray-900/30 p-2">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Loader2 className="animate-spin text-blue-500" size={30}/>
                    <span className="text-sm text-gray-400">{loadingProgress}</span>
                  </div>
                ) : data.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">Tidak ada data history</div>
                ) : (
                    <HistoryTable data={data} sortConfig={sortConfig} onSort={handleSort} />
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
