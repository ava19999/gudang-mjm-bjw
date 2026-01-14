// FILE: src/components/quickInput/BarangMasukTableView.tsx
import React, { useState, useEffect } from 'react';
import { Search, Package, Calendar } from 'lucide-react';
import { BarangMasuk } from '../../types';
import { fetchBarangMasuk } from '../../services/supabaseService';
import { formatRupiah } from '../../utils';

interface BarangMasukTableViewProps {
    refreshTrigger?: number;
}

export const BarangMasukTableView: React.FC<BarangMasukTableViewProps> = ({ refreshTrigger }) => {
    const [data, setData] = useState<BarangMasuk[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchField, setSearchField] = useState<'customer' | 'part_number'>('customer');

    useEffect(() => {
        loadData();
    }, [refreshTrigger]);

    const loadData = async () => {
        setLoading(true);
        const result = await fetchBarangMasuk();
        setData(result);
        setLoading(false);
    };

    const filteredData = data.filter(item => {
        if (!searchTerm) return true;
        const searchLower = searchTerm.toLowerCase();
        
        if (searchField === 'customer') {
            return item.customer?.toLowerCase().includes(searchLower);
        } else {
            return item.part_number?.toLowerCase().includes(searchLower);
        }
    });

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('id-ID', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
            });
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="bg-gray-900 border-t-2 border-gray-700 p-4">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-900/30 rounded-lg">
                            <Package className="text-blue-400" size={18} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-100">Riwayat Barang Masuk</h3>
                            <p className="text-[10px] text-gray-400">Data yang sudah tersimpan</p>
                        </div>
                    </div>
                    
                    <div className="text-sm text-gray-400">
                        {filteredData.length} dari {data.length} item
                    </div>
                </div>

                {/* Search Bar */}
                <div className="flex gap-2 mb-4">
                    <select
                        value={searchField}
                        onChange={(e) => setSearchField(e.target.value as 'customer' | 'part_number')}
                        className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none"
                    >
                        <option value="customer">Customer</option>
                        <option value="part_number">Part Number</option>
                    </select>
                    
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={16} />
                        <input
                            type="text"
                            placeholder={`Cari berdasarkan ${searchField === 'customer' ? 'Customer' : 'Part Number'}...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none"
                        />
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="text-center py-8 text-gray-500">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-2 text-xs">Memuat data...</p>
                    </div>
                ) : filteredData.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <Package size={40} className="mx-auto opacity-20 mb-2" />
                        <p className="text-sm">
                            {searchTerm ? 'Tidak ada data yang sesuai' : 'Belum ada data barang masuk'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-700">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-800 text-gray-400 uppercase text-[10px] font-bold border-b border-gray-700">
                                <tr>
                                    <th className="px-3 py-2">Tanggal</th>
                                    <th className="px-3 py-2">Tempo</th>
                                    <th className="px-3 py-2">Customer</th>
                                    <th className="px-3 py-2">Part Number</th>
                                    <th className="px-3 py-2">Nama Barang</th>
                                    <th className="px-3 py-2">Brand</th>
                                    <th className="px-3 py-2 text-right">Qty Masuk</th>
                                    <th className="px-3 py-2 text-right">Harga Satuan</th>
                                    <th className="px-3 py-2 text-right">Total Harga</th>
                                    <th className="px-3 py-2 text-right">Stock Akhir</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/50">
                                {filteredData.map((item, index) => (
                                    <tr 
                                        key={item.id || index} 
                                        className="hover:bg-gray-800/50 transition-colors"
                                    >
                                        <td className="px-3 py-2 text-gray-300">
                                            <div className="flex items-center gap-1 text-[10px]">
                                                <Calendar size={10} className="text-gray-500" />
                                                {formatDate(item.created_at)}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className="px-2 py-0.5 bg-blue-900/30 text-blue-300 rounded text-[10px] font-bold">
                                                {item.tempo}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-gray-300 font-medium">
                                            {item.customer || '-'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className="font-mono font-bold text-orange-400">
                                                {item.part_number}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-gray-300 max-w-[200px] truncate" title={item.name}>
                                            {item.name}
                                        </td>
                                        <td className="px-3 py-2 text-gray-400 text-[10px]">
                                            {item.brand || '-'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-bold text-green-400">
                                            {item.qty_masuk}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-blue-300">
                                            {formatRupiah(item.harga_satuan)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-orange-300 font-bold">
                                            {formatRupiah(item.harga_total)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-400">
                                            {item.stock_ahir}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
