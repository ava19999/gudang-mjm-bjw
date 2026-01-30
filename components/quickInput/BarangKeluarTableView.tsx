// FILE: src/components/quickInput/BarangKeluarTableView.tsx
import React, { useEffect, useState } from 'react';
import { useStore } from '../../context/StoreContext';
import { fetchBarangKeluarLog } from '../../services/supabaseService'; // Pastikan fungsi ini sudah diimport
import { formatRupiah, formatDate } from '../../utils';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, Truck, Search, X } from 'lucide-react';

interface Props { refreshTrigger: number; }

export const BarangKeluarTableView: React.FC<Props> = ({ refreshTrigger }) => {
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
    const LIMIT = 10;

    const loadData = async () => {
        setLoading(true);
        try {
            // Build filters object
            const filters: {
                dateFrom?: string;
                dateTo?: string;
                partNumber?: string;
                customer?: string;
            } = {};
            
            if (filterDateFrom) filters.dateFrom = filterDateFrom;
            if (filterDateTo) filters.dateTo = filterDateTo;
            if (filterPartNumber) filters.partNumber = filterPartNumber;
            if (filterCustomer) filters.customer = filterCustomer;
            
            // Fetch with server-side filtering
            const { data: logs, total } = await fetchBarangKeluarLog(
                selectedStore, 
                page, 
                LIMIT,
                Object.keys(filters).length > 0 ? filters : undefined
            );
            
            setData(logs);
            setTotalRows(total);
        } catch (e) {
            console.error("Gagal memuat data barang keluar:", e);
        } finally {
            setLoading(false);
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
    // Server-side filtering: searches entire database, not just current page
    useEffect(() => { 
        setPage(1); // Reset to page 1 when filters change
    }, [filterDateFrom, filterDateTo, filterPartNumber, filterCustomer]);
    
    useEffect(() => { loadData(); }, [selectedStore, page, refreshTrigger, filterDateFrom, filterDateTo, filterPartNumber, filterCustomer]);

    const totalPages = Math.ceil(totalRows / LIMIT);

    return (
        <div className="flex-1 bg-gray-900 border-t border-gray-700 flex flex-col overflow-hidden h-[40vh]">
            <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
                <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <Truck size={16} className="text-red-500"/>
                    Riwayat Barang Keluar ({selectedStore?.toUpperCase()})
                </h3>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowFilter(!showFilter)} 
                        className={`p-1.5 hover:bg-gray-700 rounded transition-colors ${
                            showFilter ? 'bg-gray-700 text-green-400' : 'text-gray-400'
                        }`}
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
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Tanggal Sampai</label>
                            <input 
                                type="date" 
                                value={filterDateTo}
                                onChange={(e) => setFilterDateTo(e.target.value)}
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Part Number</label>
                            <input 
                                type="text" 
                                value={filterPartNumber}
                                onChange={(e) => setFilterPartNumber(e.target.value)}
                                placeholder="Cari part number..."
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Customer</label>
                            <input 
                                type="text" 
                                value={filterCustomer}
                                onChange={(e) => setFilterCustomer(e.target.value)}
                                placeholder="Cari customer..."
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-red-500"
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
                            <th className="px-3 py-2">Tempo</th>
                            <th className="px-3 py-2">Customer</th>
                            <th className="px-3 py-2">Part Number</th>
                            <th className="px-3 py-2">Nama Barang</th>
                            <th className="px-3 py-2 text-right">Qty Keluar</th>
                            <th className="px-3 py-2 text-right">Stok Saat Ini</th>
                            <th className="px-3 py-2 text-right">Hrg Satuan</th>
                            <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-gray-700/50">
                        {loading ? (
                            <tr><td colSpan={9} className="py-8 text-center text-gray-500"><Loader2 size={16} className="animate-spin inline mr-2"/>Memuat data...</td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={9} className="py-8 text-center text-gray-600 italic">Belum ada data barang keluar.</td></tr>
                        ) : (
                            data.map((item, idx) => (
                                <tr key={item.id || idx} className="hover:bg-gray-800/50 transition-colors">
                                    <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">{formatDate(item.created_at)}</td>
                                    <td className="px-3 py-2 text-yellow-500 font-bold">{item.tempo || 'CASH'}</td>
                                    <td className="px-3 py-2 text-gray-300">{item.customer}</td>
                                    <td className="px-3 py-2 font-bold text-gray-200 font-mono">{item.part_number}</td>
                                    <td className="px-3 py-2 text-gray-300 max-w-[200px] truncate" title={item.name}>{item.name || '-'}</td>
                                    <td className="px-3 py-2 text-right font-bold text-red-400">-{item.quantity}</td>
                                    <td className="px-3 py-2 text-right font-bold text-cyan-400">{item.current_qty ?? 0}</td>
                                    <td className="px-3 py-2 text-right text-gray-400 font-mono">{formatRupiah(item.harga_satuan)}</td>
                                    <td className="px-3 py-2 text-right text-orange-300 font-mono">{formatRupiah(item.harga_total)}</td>
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