


import React, { useEffect, useState } from 'react';
import { useStore } from '../../context/StoreContext';
import { InventoryItem, SoldItemRow } from '../../types';
// import { fetchInventoryAllFiltered, fetchSoldItems } from '../../services/supabaseService';
import { supabase } from '../../services/supabaseClient';
import { Loader2, Package, Search } from 'lucide-react';


interface SupplierInfo {
  supplier: string;
  lastDate: string;
  lastPrice: number;
  lastPriceCash: number;
  lastPriceTempo: number;
  totalQtyPurchased: number;
  purchaseCount: number;
}

interface StockMoment {
  partNumber: string;
  name: string;
  brand: string;
  date: string;
  stock: number;
  qtyOut: number;
  supplier?: SupplierInfo;
}


const getLastNDates = (n: number): string[] => {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
};

const StockOnlineView: React.FC = () => {
  const { selectedStore } = useStore();
  const [loading, setLoading] = useState(true);
  const [moments, setMoments] = useState<StockMoment[]>([]);
  const [search, setSearch] = useState('');



  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      // Pilih view sesuai toko
      const viewName = selectedStore === 'mjm' ? 'v_stock_online_mjm' : 'v_stock_online_bjw';
      const { data, error } = await supabase
        .from(viewName)
        .select('*');
      if (error) {
        setMoments([]);
        setLoading(false);
        return;
      }
      // Group by tanggal
      const momentsArr: StockMoment[] = (data || []).map(row => ({
        partNumber: row.part_number,
        name: row.name,
        brand: row.brand,
        date: row.tanggal,
        stock: row.stock,
        qtyOut: row.qty_keluar,
        supplier: {
          supplier: row.supplier || 'IMPORTIR MJM',
          lastDate: row.supplier_date || '-',
          lastPrice: row.supplier_price || 0,
          lastPriceCash: row.supplier_price || 0,
          lastPriceTempo: row.supplier_price || 0,
          totalQtyPurchased: 0,
          purchaseCount: 0,
        }
      }));
      setMoments(momentsArr);
      setLoading(false);
    };
    loadData();
  }, [selectedStore]); // Dependensi selectedStore agar view berubah sesuai toko


  // Filter by search
  const searchLower = search.trim().toLowerCase();
  const momentsByDate: Record<string, StockMoment[]> = {};
  moments.forEach(m => {
    if (!momentsByDate[m.date]) momentsByDate[m.date] = [];
    if (
      !searchLower ||
      m.partNumber.toLowerCase().includes(searchLower) ||
      m.name.toLowerCase().includes(searchLower) ||
      m.brand.toLowerCase().includes(searchLower)
    ) {
      momentsByDate[m.date].push(m);
    }
  });

  const sortedDates = Object.keys(momentsByDate).sort().reverse();

  return (
    <div className="p-6 text-gray-100 min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-green-950">
      <h2 className="text-2xl font-extrabold mb-6 flex items-center gap-3 tracking-tight">
        <Package size={28} className="text-green-400 drop-shadow" />
        <span>Stock Online <span className="text-green-300">3 Hari Terakhir</span> <span className="text-xs font-normal text-gray-400">(Stok 2, 1, 0)</span></span>
      </h2>
      <div className="mb-6 flex items-center gap-3">
        <Search size={20} className="text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari part number, nama, brand..."
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-green-500 shadow"
        />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-green-400 mr-3" size={28} />
          <span className="text-lg font-semibold tracking-wide">Memuat stock online...</span>
        </div>
      ) : sortedDates.length === 0 ? (
        <div className="text-gray-400 mt-10 text-center text-lg font-medium">Tidak ada barang dengan stok 2, 1, atau 0 dalam 3 hari terakhir.</div>
      ) : (
        <div className="space-y-10">
          {sortedDates.map(date => (
            <section key={date} className="bg-gradient-to-br from-gray-900 via-gray-950 to-green-950 rounded-2xl border border-green-900/40 shadow-2xl p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="text-xl font-bold text-green-300 drop-shadow">{date}</span>
                <span className="text-xs bg-green-900/60 text-green-200 px-3 py-1 rounded-full font-semibold shadow">{momentsByDate[date].length} barang</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-transparent text-gray-100 text-sm font-medium border border-green-900/40 rounded-xl shadow-xl">
                  <thead className="bg-green-900/80 text-green-100 sticky top-0 z-10 shadow">
                    <tr>
                      <th className="px-5 py-3 border-b border-green-800 text-left font-bold tracking-wide">Part Number</th>
                      <th className="px-5 py-3 border-b border-green-800 text-left font-bold tracking-wide">Nama Barang</th>
                      <th className="px-5 py-3 border-b border-green-800 text-left font-bold tracking-wide">Brand</th>
                      <th className="px-5 py-3 border-b border-green-800 text-center font-bold tracking-wide">Stok</th>
                      <th className="px-5 py-3 border-b border-green-800 text-center font-bold tracking-wide">Qty Keluar</th>
                      <th className="px-5 py-3 border-b border-green-800 text-center font-bold tracking-wide">Supplier Terakhir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {momentsByDate[date].map((m, idx) => (
                      <tr
                        key={m.partNumber + m.date + idx}
                        className={
                          `transition-colors ${idx % 2 === 0 ? 'bg-gray-900/70' : 'bg-gray-800/60'} hover:bg-green-900/30 border-b border-green-900/30`
                        }
                      >
                        <td className="px-5 py-3 font-mono text-blue-300 border-r border-green-900/20 text-base font-bold whitespace-nowrap">{m.partNumber}</td>
                        <td className="px-5 py-3 border-r border-green-900/20 text-base">{m.name}</td>
                        <td className="px-5 py-3 border-r border-green-900/20 text-base">{m.brand}</td>
                        <td className={`px-5 py-3 text-center font-extrabold border-r border-green-900/20 text-lg ${m.stock === 0 ? 'text-red-400' : m.stock <= 2 ? 'text-yellow-300' : 'text-green-300'}`}>{m.stock}</td>
                        <td className="px-5 py-3 text-center text-green-300 border-r border-green-900/20 text-base font-bold">{m.qtyOut}</td>
                        <td className="px-5 py-3 text-center">
                          {m.supplier ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-bold text-cyan-300 text-base tracking-tight bg-cyan-900/30 px-2 py-1 rounded shadow border border-cyan-800/30">{m.supplier.supplier}</span>
                              <span className="text-xs text-gray-400">{m.supplier.lastDate?.slice(0,10)}</span>
                              <span className="text-xs text-green-200 font-semibold">Rp{m.supplier.lastPrice?.toLocaleString('id-ID')}</span>
                            </div>
                          ) : (
                            <span className="font-semibold text-yellow-300">IMPORTIR MJM</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default StockOnlineView;
