// FILE: src/components/finance/ClosingView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, Download, FileDown, TrendingUp, TrendingDown,
  Printer, Search
} from 'lucide-react';
import { fetchBarangMasuk, fetchBarangKeluar } from '../../services/supabaseService';
import { BarangMasuk, BarangKeluar } from '../../types';
import { useStore } from '../../context/StoreContext';
import html2canvas from 'html2canvas';

type ViewMode = 'masuk' | 'keluar';

export const ClosingView: React.FC = () => {
  const { selectedStore } = useStore();
  const [viewMode, setViewMode] = useState<ViewMode>('masuk');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [barangMasuk, setBarangMasuk] = useState<BarangMasuk[]>([]);
  const [barangKeluar, setBarangKeluar] = useState<BarangKeluar[]>([]);
  const [loading, setLoading] = useState(false);
  const [filteredMasuk, setFilteredMasuk] = useState<BarangMasuk[]>([]);
  const [filteredKeluar, setFilteredKeluar] = useState<BarangKeluar[]>([]);
  
  const printRef = useRef<HTMLDivElement>(null);

  // Initialize dates to today
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
  }, []);

  // Fetch data on mount
  useEffect(() => {
    loadData();
  }, [selectedStore]);

  // Filter data when dates change
  useEffect(() => {
    if (startDate && endDate) {
      filterData();
    }
  }, [startDate, endDate, barangMasuk, barangKeluar]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [masukData, keluarData] = await Promise.all([
        fetchBarangMasuk(selectedStore),
        fetchBarangKeluar(selectedStore)
      ]);
      setBarangMasuk(masukData);
      setBarangKeluar(keluarData);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
    setLoading(false);
  };

  const filterData = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // End of day

    const filteredM = barangMasuk.filter(item => {
      const itemDate = new Date(item.created_at);
      return itemDate >= start && itemDate <= end;
    });

    const filteredK = barangKeluar.filter(item => {
      const itemDate = new Date(item.created_at);
      return itemDate >= start && itemDate <= end;
    });

    setFilteredMasuk(filteredM);
    setFilteredKeluar(filteredK);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Calculate daily totals for Barang Masuk
  const getDailyTotalMasuk = (date: string) => {
    const dayItems = filteredMasuk.filter(item => 
      item.created_at.split('T')[0] === date.split('T')[0]
    );
    return dayItems.reduce((sum, item) => sum + item.harga_total, 0);
  };

  // Calculate store totals for Barang Keluar
  const getStoreTotals = () => {
    const totals: Record<string, number> = {};
    filteredKeluar.forEach(item => {
      const store = item.kode_toko || 'Unknown';
      totals[store] = (totals[store] || 0) + item.harga_total;
    });
    return totals;
  };

  const grandTotal = filteredKeluar.reduce((sum, item) => sum + item.harga_total, 0);
  const storeTotals = getStoreTotals();

  // Export to JPEG
  const exportToJPEG = async () => {
    if (!printRef.current) return;
    
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        backgroundColor: '#111827',
        logging: false
      });
      
      const link = document.createElement('a');
      link.download = `closing-${viewMode}-${startDate}-to-${endDate}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (error) {
      console.error('Failed to export JPEG:', error);
    }
  };

  // Export to PDF (using print dialog)
  const exportToPDF = () => {
    window.print();
  };

  // Get unique dates from filtered data
  const uniqueDates = Array.from(new Set(
    (viewMode === 'masuk' ? filteredMasuk : filteredKeluar)
      .map(item => item.created_at.split('T')[0])
  )).sort();

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-blue-600/20 w-12 h-12 rounded-xl flex items-center justify-center">
              <Calendar size={24} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-100">Closing</h1>
              <p className="text-sm text-gray-400">Laporan barang masuk dan keluar</p>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setViewMode('masuk')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                viewMode === 'masuk'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              <TrendingUp size={20} />
              <span>Barang Masuk</span>
            </button>
            <button
              onClick={() => setViewMode('keluar')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                viewMode === 'keluar'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              <TrendingDown size={20} />
              <span>Barang Keluar</span>
            </button>
          </div>

          {/* Date Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tanggal Mulai
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tanggal Selesai
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={loadData}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Search size={18} />
                <span>Cari</span>
              </button>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-2">
            <button
              onClick={exportToJPEG}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Download size={18} />
              <span>Export JPEG</span>
            </button>
            <button
              onClick={exportToPDF}
              className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <FileDown size={18} />
              <span>Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div ref={printRef} className="max-w-7xl mx-auto">
        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
          {/* Print Header (visible only when printing) */}
          <div className="hidden print:block p-6 border-b border-gray-700">
            <h2 className="text-xl font-bold text-gray-100">
              Laporan {viewMode === 'masuk' ? 'Barang Masuk' : 'Barang Keluar'}
            </h2>
            <p className="text-sm text-gray-400">
              Periode: {formatDate(startDate)} - {formatDate(endDate)}
            </p>
            <p className="text-sm text-gray-400">
              Toko: {selectedStore?.toUpperCase() || 'ALL'}
            </p>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block w-8 h-8 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin"></div>
              <p className="mt-4 text-gray-400">Memuat data...</p>
            </div>
          ) : (
            <>
              {viewMode === 'masuk' ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Tanggal
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Tempo
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Nama Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Daftar Barang
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Harga Satuan
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Jumlah
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Total Harian
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {filteredMasuk.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                            Tidak ada data untuk periode yang dipilih
                          </td>
                        </tr>
                      ) : (
                        filteredMasuk.map((item, index) => (
                          <tr key={item.id} className="hover:bg-gray-700/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-300">
                              {formatDate(item.created_at)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300">
                              {item.tempo || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300">
                              {item.keterangan || item.customer || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="text-gray-300 font-medium">{item.name}</div>
                              <div className="text-xs text-gray-500">
                                {item.part_number} - {item.brand}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-300">
                              {formatCurrency(item.harga_satuan)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-300">
                              {item.qty_masuk}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-green-400">
                              {formatCurrency(getDailyTotalMasuk(item.created_at))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Tanggal
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Jenis Toko
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Tempo
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Nama Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Daftar Barang
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Harga Satuan
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Total Toko
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {filteredKeluar.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                            Tidak ada data untuk periode yang dipilih
                          </td>
                        </tr>
                      ) : (
                        filteredKeluar.map((item, index) => (
                          <tr key={item.id} className="hover:bg-gray-700/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-300">
                              {formatDate(item.created_at)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-md text-xs font-semibold">
                                {item.kode_toko}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300">
                              {item.tempo || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300">
                              {item.customer || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="text-gray-300 font-medium">{item.name}</div>
                              <div className="text-xs text-gray-500">
                                {item.part_number} - {item.brand}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-300">
                              {formatCurrency(item.harga_satuan)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-red-400">
                              {formatCurrency(storeTotals[item.kode_toko] || 0)}
                            </td>
                          </tr>
                        ))
                      )}
                      {filteredKeluar.length > 0 && (
                        <tr className="bg-gray-700/50 font-bold">
                          <td colSpan={6} className="px-4 py-4 text-right text-gray-100 uppercase">
                            Grand Total:
                          </td>
                          <td className="px-4 py-4 text-right text-lg text-red-400">
                            {formatCurrency(grandTotal)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Store Totals Summary */}
                  {Object.keys(storeTotals).length > 0 && (
                    <div className="p-6 bg-gray-700/30 border-t border-gray-700">
                      <h3 className="text-sm font-semibold text-gray-300 uppercase mb-3">
                        Ringkasan Per Toko
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(storeTotals).map(([store, total]) => (
                          <div key={store} className="bg-gray-800 rounded-lg p-3 border border-gray-600">
                            <div className="text-xs text-gray-400 mb-1">Toko {store}</div>
                            <div className="text-lg font-bold text-red-400">
                              {formatCurrency(total)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .print\\:block {
            display: block !important;
          }
          .hidden.print\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
};
