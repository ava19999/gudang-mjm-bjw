// FILE: components/online/PackingStatusView.tsx
import React, { useState, useEffect } from 'react';
import { Package, Filter, Download } from 'lucide-react';
import { ScanResi } from '../../types';
import { getScanResiByDate } from '../../services/resiService';

interface PackingStatusViewProps {
  store: string | null;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

type FilterStatus = 'ALL' | 'SCANNED' | 'MATCHED' | 'PROCESSED';

export const PackingStatusView: React.FC<PackingStatusViewProps> = ({ store, showToast }) => {
  const [scannedList, setScannedList] = useState<ScanResi[]>([]);
  const [filteredList, setFilteredList] = useState<ScanResi[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [filterTypeToko, setFilterTypeToko] = useState<string>('');
  const [filterToko, setFilterToko] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');

  useEffect(() => {
    // Set default dates: today
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      loadData();
    }
  }, [startDate, endDate, store]);

  useEffect(() => {
    applyFilters();
  }, [scannedList, filterTypeToko, filterToko, filterStatus]);

  const loadData = async () => {
    setIsLoading(true);
    const data = await getScanResiByDate(startDate, endDate, store);
    setScannedList(data);
    setIsLoading(false);
  };

  const applyFilters = () => {
    let filtered = [...scannedList];

    if (filterTypeToko) {
      filtered = filtered.filter((item) => item.type_toko === filterTypeToko);
    }

    if (filterToko) {
      filtered = filtered.filter((item) => item.toko === filterToko);
    }

    if (filterStatus !== 'ALL') {
      filtered = filtered.filter((item) => item.status === filterStatus);
    }

    setFilteredList(filtered);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SCANNED':
        return <span className="px-2 py-1 text-xs bg-blue-900/50 text-blue-300 rounded font-semibold">📦 Scanned</span>;
      case 'MATCHED':
        return <span className="px-2 py-1 text-xs bg-green-900/50 text-green-300 rounded font-semibold">✅ Matched</span>;
      case 'PROCESSED':
        return <span className="px-2 py-1 text-xs bg-purple-900/50 text-purple-300 rounded font-semibold">✨ Processed</span>;
      default:
        return <span className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded font-semibold">{status}</span>;
    }
  };

  // Summary stats
  const stats = {
    total: filteredList.length,
    scanned: filteredList.filter((i) => i.status === 'SCANNED').length,
    matched: filteredList.filter((i) => i.status === 'MATCHED').length,
    processed: filteredList.filter((i) => i.status === 'PROCESSED').length,
  };

  const handleExportCSV = () => {
    if (filteredList.length === 0) {
      showToast('Tidak ada data untuk di-export', 'error');
      return;
    }

    const headers = ['No', 'Tanggal', 'Resi', 'Type Toko', 'Toko', 'Customer', 'No Pesanan', 'Status', 'Scanned At', 'Matched At'];
    const rows = filteredList.map((item, index) => [
      index + 1,
      item.tanggal,
      item.resi,
      item.type_toko,
      item.toko || '',
      item.customer || '',
      item.no_pesanan || '',
      item.status,
      item.scanned_at,
      item.matched_at || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `packing_status_${startDate}_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('CSV berhasil di-export', 'success');
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-4 shadow-lg">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Package size={24} />
          STATUS PACKING - DASHBOARD
        </h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={20} className="text-cyan-400" />
            <h3 className="text-lg font-semibold">Filter</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date Range */}
            <div>
              <label className="block text-sm font-semibold mb-1">Tanggal Mulai</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Tanggal Akhir</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>

            {/* Type Toko */}
            <div>
              <label className="block text-sm font-semibold mb-1">Type Toko</label>
              <select
                value={filterTypeToko}
                onChange={(e) => setFilterTypeToko(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              >
                <option value="">Semua</option>
                <option value="TIKTOK">TIKTOK</option>
                <option value="SHOPEE">SHOPEE</option>
                <option value="KILAT">KILAT</option>
                <option value="RESELLER">RESELLER</option>
                <option value="EKSPOR">EKSPOR</option>
              </select>
            </div>

            {/* Toko */}
            <div>
              <label className="block text-sm font-semibold mb-1">Toko</label>
              <select
                value={filterToko}
                onChange={(e) => setFilterToko(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              >
                <option value="">Semua</option>
                <option value="MJM">MJM</option>
                <option value="BJW">BJW</option>
                <option value="LARIS">LARIS</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-semibold mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              >
                <option value="ALL">Semua</option>
                <option value="SCANNED">Scanned</option>
                <option value="MATCHED">Matched</option>
                <option value="PROCESSED">Processed</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 rounded-lg font-semibold transition-all"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-all flex items-center gap-2"
            >
              <Download size={18} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400 mb-1">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-700">
            <p className="text-sm text-blue-300 mb-1">Scanned</p>
            <p className="text-2xl font-bold text-blue-300">{stats.scanned}</p>
          </div>
          <div className="bg-green-900/30 rounded-lg p-4 border border-green-700">
            <p className="text-sm text-green-300 mb-1">Matched</p>
            <p className="text-2xl font-bold text-green-300">{stats.matched}</p>
          </div>
          <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-700">
            <p className="text-sm text-purple-300 mb-1">Processed</p>
            <p className="text-2xl font-bold text-purple-300">{stats.processed}</p>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 bg-gray-750 border-b border-gray-700">
            <h3 className="text-lg font-bold">📊 Data Packing</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-750 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left border-b border-gray-700">#</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">TANGGAL</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">RESI</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">TYPE</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">TOKO</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">CUSTOMER</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">NO PESANAN</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">STATUS</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">SCAN TIME</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                      {isLoading ? 'Loading...' : 'Tidak ada data'}
                    </td>
                  </tr>
                ) : (
                  filteredList.map((item, index) => (
                    <tr key={item.id} className="border-b border-gray-700 hover:bg-gray-750">
                      <td className="px-4 py-3">{index + 1}</td>
                      <td className="px-4 py-3">
                        {new Date(item.tanggal).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-4 py-3 font-mono text-cyan-400">{item.resi}</td>
                      <td className="px-4 py-3">{item.type_toko}</td>
                      <td className="px-4 py-3">{item.toko || item.negara_ekspor || '-'}</td>
                      <td className="px-4 py-3">{item.customer || '-'}</td>
                      <td className="px-4 py-3">{item.no_pesanan || '-'}</td>
                      <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                      <td className="px-4 py-3">
                        {new Date(item.scanned_at).toLocaleTimeString('id-ID')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
