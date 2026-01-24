// FILE: src/components/quickInput/BarangMasukTableView.tsx
import React, { useEffect, useState } from 'react';
import { useStore } from '../../context/StoreContext';
import { fetchBarangMasukLog, deleteBarangLog } from '../../services/supabaseService';
import { formatRupiah, formatDate } from '../../utils';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, PackageOpen, Trash2, Search, X } from 'lucide-react';

interface Props { 
    refreshTrigger: number; 
    onRefresh?: () => void;
}

export const BarangMasukTableView: React.FC<Props> = ({ refreshTrigger, onRefresh }) => {
    const { selectedStore } = useStore();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [showFilter, setShowFilter] = useState(false);
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterPartNumber, setFilterPartNumber] = useState('');
    const [filterCustomer, setFilterCustomer] = useState('');
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const LIMIT = 10;

    const loadData = async () => {
        setLoading(true);
        try {
            const { data: logs, total } = await fetchBarangMasukLog(selectedStore, page, LIMIT);
            
            // Apply client-side filters
            let filteredLogs = logs;
            
            if (filterDateFrom || filterDateTo || filterPartNumber || filterCustomer) {
                filteredLogs = logs.filter((item: any) => {
                    // Date filtering
                    if (filterDateFrom) {
                        const itemDate = new Intl.DateTimeFormat('sv-SE', {
                            timeZone: 'Asia/Jakarta'
                        }).format(new Date(item.created_at));
                        if (itemDate < filterDateFrom) return false;
                    }
                    if (filterDateTo) {
                        const itemDate = new Intl.DateTimeFormat('sv-SE', {
                            timeZone: 'Asia/Jakarta'
                        }).format(new Date(item.created_at));
                        if (itemDate > filterDateTo) return false;
                    }
                    
                    // Part number filtering
                    if (filterPartNumber && !item.part_number?.toLowerCase().includes(filterPartNumber.toLowerCase())) {
                        return false;
                    }
                    
                    // Customer filtering
                    if (filterCustomer) {
                        const customer = item.customer || item.ecommerce || '';
                        if (!customer.toLowerCase().includes(filterCustomer.toLowerCase())) {
                            return false;
                        }
                    }
                    
                    return true;
                });
            }
            
            setData(filteredLogs);
            setTotalRows(total);
        } catch (e) {
            console.error("Gagal memuat data barang masuk:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (item: { id: number; part_number: string; quantity?: number; qty_masuk?: number; name?: string }) => {
        const qtyToDelete = item.quantity || item.qty_masuk || 0;
        console.log('handleDelete item:', item);
        console.log('qty to delete:', qtyToDelete);
        
        if (!confirm(`Hapus log barang masuk "${item.part_number}"?\nStok akan dikembalikan (dikurangi ${qtyToDelete}).`)) return;
        
        if (qtyToDelete <= 0) {
            alert('Error: Qty tidak valid. Tidak dapat menghapus.');
            return;
        }
        
        setDeletingId(item.id);
        try {
            const success = await deleteBarangLog(
                item.id, 
                'in', 
                item.part_number, 
                qtyToDelete, 
                selectedStore
            );
            
            if (success) {
                // Hapus dari state lokal terlebih dahulu untuk UX yang lebih responsif
                setData(prevData => prevData.filter(d => d.id !== item.id));
                setTotalRows(prev => Math.max(0, prev - 1));
                
                // Kemudian refresh data dari server untuk memastikan sinkronisasi
                setTimeout(() => {
                    loadData();
                }, 300);
                
                if (onRefresh) onRefresh();
            } else {
                alert('Gagal menghapus log. Silakan coba lagi.');
            }
        } catch (error) {
            console.error('Error deleting log:', error);
            alert('Terjadi error saat menghapus log.');
        } finally {
            setDeletingId(null);
        }
    };

    const resetFilters = () => {
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilterPartNumber('');
        setFilterCustomer('');
        setPage(1);
    };

    useEffect(() => { setPage(1); }, [selectedStore]);
    // Note: Filters trigger immediate reload. For production, consider debouncing filter inputs to reduce API calls.
    useEffect(() => { loadData(); }, [selectedStore, page, refreshTrigger, filterDateFrom, filterDateTo, filterPartNumber, filterCustomer]);

    const totalPages = Math.ceil(totalRows / LIMIT);

    return (
        <div className="flex-1 bg-gray-900 border-t border-gray-700 flex flex-col overflow-hidden h-[40vh]">
            <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
                <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <PackageOpen size={16} className="text-green-500"/>
                    Riwayat Barang Masuk ({selectedStore?.toUpperCase()})
                </h3>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowFilter(!showFilter)} 
                        className={`p-1.5 hover:bg-gray-700 rounded transition-colors ${showFilter ? 'bg-gray-700 text-green-400' : 'text-gray-400'}`}
                        title="Toggle Filter"
                    >
                        <Search size={14} />
                    </button>
                    <button onClick={loadData} className="p-1.5 hover:bg-gray-700 rounded text-gray-400">
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            {showFilter && (
                <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Tanggal Dari</label>
                            <input 
                                type="date" 
                                value={filterDateFrom}
                                onChange={(e) => setFilterDateFrom(e.target.value)}
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-green-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Tanggal Sampai</label>
                            <input 
                                type="date" 
                                value={filterDateTo}
                                onChange={(e) => setFilterDateTo(e.target.value)}
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-green-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Part Number</label>
                            <input 
                                type="text" 
                                value={filterPartNumber}
                                onChange={(e) => setFilterPartNumber(e.target.value)}
                                placeholder="Cari part number..."
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-green-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Customer/Sumber</label>
                            <input 
                                type="text" 
                                value={filterCustomer}
                                onChange={(e) => setFilterCustomer(e.target.value)}
                                placeholder="Cari customer..."
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-green-500"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={resetFilters}
                            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded flex items-center gap-1 transition-colors"
                        >
                            <X size={12} /> Reset Filter
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-auto p-2">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-3 py-2">Tanggal</th>
                            <th className="px-3 py-2">Part Number</th>
                            <th className="px-3 py-2">Nama Barang</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Harga Satuan</th>
                            <th className="px-3 py-2 text-right">Total</th>
                            <th className="px-3 py-2">Customer/Sumber</th>
                            <th className="px-3 py-2">Tempo</th>
                            <th className="px-3 py-2 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-gray-700/50">
                        {loading ? (
                            <tr><td colSpan={9} className="py-8 text-center text-gray-500"><Loader2 size={16} className="animate-spin inline mr-2"/>Memuat data...</td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={9} className="py-8 text-center text-gray-600 italic">Belum ada data barang masuk.</td></tr>
                        ) : (
                            data.map((item, idx) => (
                                <tr key={item.id || idx} className="hover:bg-gray-800/50 transition-colors">
                                    <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">{formatDate(item.created_at)}</td>
                                    <td className="px-3 py-2 font-bold text-gray-200 font-mono">{item.part_number}</td>
                                    <td className="px-3 py-2 text-gray-300 max-w-[200px] truncate" title={item.name}>{item.name || '-'}</td>
                                    <td className="px-3 py-2 text-right font-bold text-green-400">+{item.quantity || item.qty_masuk}</td>
                                    <td className="px-3 py-2 text-right text-gray-400 font-mono">{formatRupiah(item.harga_satuan)}</td>
                                    <td className="px-3 py-2 text-right text-orange-300 font-mono">{formatRupiah(item.harga_total)}</td>
                                    <td className="px-3 py-2 text-gray-400">{item.customer && item.customer !== '-' ? item.customer : (item.ecommerce || '-')}</td>
                                    <td className="px-3 py-2 text-gray-500">{item.tempo || '-'}</td>
                                    <td className="px-3 py-2 text-center">
                                        <button
                                            onClick={() => handleDelete(item)}
                                            disabled={deletingId === item.id}
                                            className="p-1 hover:bg-red-900/30 rounded text-red-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            title="Hapus & Rollback Stok"
                                        >
                                            {deletingId === item.id ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Trash2 size={14} />
                                            )}
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 flex justify-between items-center text-xs">
                <span className="text-gray-500">Hal {page} dari {totalPages || 1}</span>
                <div className="flex gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-300"><ChevronLeft size={16}/></button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-300"><ChevronRight size={16}/></button>
                </div>
            </div>
        </div>
    );
};