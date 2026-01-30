// FILE: src/components/GlobalHistoryModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { StockHistory } from '../types';
import { fetchHistoryLogsPaginated, fetchDistinctEcommerce } from '../services/supabaseService';
import { HistoryTable, SortConfig } from './HistoryTable';
import { Loader2, X, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, User, Hash, ShoppingBag } from 'lucide-react';
import { useStore } from '../context/StoreContext';

interface GlobalHistoryModalProps {
  type: 'in' | 'out';
  onClose: () => void;
}

export const GlobalHistoryModal: React.FC<GlobalHistoryModalProps> = ({ type, onClose }) => {
  const { selectedStore } = useStore();
  const [data, setData] = useState<StockHistory[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [customerSearch, setCustomerSearch] = useState('');
  const [partNumberSearch, setPartNumberSearch] = useState('');
  const [tokoFilter, setTokoFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [ecommerceOptions, setEcommerceOptions] = useState<string[]>([]);

  // Load ecommerce options from database
  useEffect(() => {
    const loadEcommerceOptions = async () => {
      const options = await fetchDistinctEcommerce(selectedStore);
      setEcommerceOptions(options);
    };
    loadEcommerceOptions();
  }, [selectedStore]);

  // Debounce search
  const [debouncedCustomer, setDebouncedCustomer] = useState('');
  const [debouncedPartNumber, setDebouncedPartNumber] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomer(customerSearch);
      setDebouncedPartNumber(partNumberSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [customerSearch, partNumberSearch]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedCustomer, debouncedPartNumber, tokoFilter]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const filters = {
        customer: debouncedCustomer,
        partNumber: debouncedPartNumber,
        ecommerce: tokoFilter !== 'all' ? tokoFilter : ''
      };
      const { data: result, count } = await fetchHistoryLogsPaginated(type, page, 50, filters, selectedStore);
      setData(result);
      setTotalCount(count);
      setTotalPages(Math.ceil(count / 50));
      setLoading(false);
    };
    loadData();
  }, [type, page, debouncedCustomer, debouncedPartNumber, tokoFilter, selectedStore]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;
    
    return [...data].sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortConfig.key) {
        case 'timestamp':
          aVal = new Date(a.timestamp || 0).getTime();
          bVal = new Date(b.timestamp || 0).getTime();
          break;
        case 'customer':
          aVal = (a.reason?.match(/customer:([^|]+)/)?.[1] || '').toLowerCase();
          bVal = (b.reason?.match(/customer:([^|]+)/)?.[1] || '').toLowerCase();
          break;
        case 'partNumber':
          aVal = (a.partNumber || '').toLowerCase();
          bVal = (b.partNumber || '').toLowerCase();
          break;
        case 'name':
          aVal = (a.name || '').toLowerCase();
          bVal = (b.name || '').toLowerCase();
          break;
        case 'quantity':
          aVal = a.quantity || 0;
          bVal = b.quantity || 0;
          break;
        case 'currentQty':
          aVal = (a as any).currentQty || 0;
          bVal = (b as any).currentQty || 0;
          break;
        case 'price':
          aVal = a.price || 0;
          bVal = b.price || 0;
          break;
        case 'totalPrice':
          aVal = a.totalPrice || (a.price || 0) * a.quantity;
          bVal = b.totalPrice || (b.price || 0) * b.quantity;
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
        <div className="bg-gray-800 rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col border border-gray-700 shadow-2xl m-4">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 rounded-t-2xl">
                <h3 className="font-bold text-gray-100 flex items-center gap-2">{type === 'in' ? <TrendingUp className="text-green-500" size={20}/> : <TrendingDown className="text-red-500" size={20}/>} Detail Barang {type === 'in' ? 'Masuk' : 'Keluar'}</h3>
                <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded-full"><X size={20}/></button>
            </div>
            
            {/* Search Filters */}
            <div className="p-3 border-b border-gray-700 bg-gray-800 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                    {/* Customer Search */}
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input 
                            type="text" 
                            placeholder="Cari Pelanggan..." 
                            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none" 
                            value={customerSearch} 
                            onChange={(e) => setCustomerSearch(e.target.value)} 
                        />
                    </div>
                    
                    {/* Part Number Search */}
                    <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input 
                            type="text" 
                            placeholder="Cari Part Number..." 
                            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none" 
                            value={partNumberSearch} 
                            onChange={(e) => setPartNumberSearch(e.target.value)} 
                        />
                    </div>
                    
                    {/* Ecommerce Dropdown */}
                    <div className="relative">
                        <ShoppingBag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <select 
                            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none appearance-none cursor-pointer"
                            value={tokoFilter}
                            onChange={(e) => setTokoFilter(e.target.value)}
                        >
                            <option value="all">Semua Sumber</option>
                            {ecommerceOptions.map(ecom => (
                                <option key={ecom} value={ecom}>{ecom}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-gray-900/30 p-2">
                {loading ? ( <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" size={30}/></div> ) : data.length === 0 ? ( <div className="text-center py-10 text-gray-500">Tidak ada data history</div> ) : (
                    <HistoryTable data={sortedData} sortConfig={sortConfig} onSort={handleSort} />
                )}
            </div>
            <div className="p-3 border-t border-gray-700 flex justify-between items-center bg-gray-800 rounded-b-2xl">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 bg-gray-700 rounded disabled:opacity-30"><ChevronLeft size={18}/></button>
                <div className="text-center">
                  <span className="text-xs text-gray-400">Hal {page} / {totalPages}</span>
                  <span className="text-[10px] text-gray-500 ml-2">({totalCount} item)</span>
                </div>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="p-1 bg-gray-700 rounded disabled:opacity-30"><ChevronRight size={18}/></button>
            </div>
        </div>
    </div>
  );
};