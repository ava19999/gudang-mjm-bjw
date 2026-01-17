// FILE: components/online/ScanCorrectionView.tsx
// View for deleting wrong scans (only SCANNED status, not MATCHED)

import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, Calendar, Filter, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { ScanResiEntry } from '../../types';
import { fetchScanResiEntries, deleteScanResi } from '../../services/resiService';

interface ScanCorrectionViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const ScanCorrectionView: React.FC<ScanCorrectionViewProps> = ({ showToast }) => {
  const { selectedStore } = useStore();
  const [entries, setEntries] = useState<ScanResiEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // Filters
  const [filterTypeToko, setFilterTypeToko] = useState<string>('');
  const [filterToko, setFilterToko] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  useEffect(() => {
    loadEntries();
  }, [selectedStore]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const filters: any = {
        status_packing: 'SCANNED' // Only show SCANNED entries (not MATCHED)
      };
      
      if (filterTypeToko) filters.type_toko = filterTypeToko;
      if (filterToko) filters.toko = filterToko;
      if (filterDateFrom) filters.dateFrom = filterDateFrom;
      if (filterDateTo) filters.dateTo = filterDateTo;

      const data = await fetchScanResiEntries(selectedStore, filters);
      setEntries(data);
    } catch (error) {
      console.error('Error loading entries:', error);
      showToast('Gagal memuat data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    loadEntries();
  };

  const handleClearFilters = () => {
    setFilterTypeToko('');
    setFilterToko('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setTimeout(loadEntries, 100);
  };

  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map(e => e.id!).filter(id => id !== undefined)));
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) {
      showToast('Pilih minimal 1 entry untuk dihapus', 'error');
      return;
    }

    const confirmed = confirm(
      `Hapus ${selectedIds.size} entry yang dipilih?\n\n` +
      'PERHATIAN: Hanya entry dengan status SCANNED yang dapat dihapus. ' +
      'Entry MATCHED tidak dapat dihapus karena sudah diproses.'
    );

    if (!confirmed) return;

    setLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of Array.from(selectedIds)) {
      const result = await deleteScanResi(id, selectedStore);
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
        console.error(`Failed to delete ${id}:`, result.error);
      }
    }

    if (successCount > 0) {
      showToast(`✓ ${successCount} entry berhasil dihapus`, 'success');
    }
    if (errorCount > 0) {
      showToast(`⚠️ ${errorCount} entry gagal dihapus`, 'error');
    }

    setSelectedIds(new Set());
    loadEntries();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-900/40 to-orange-900/40 rounded-2xl p-6 mb-6 border border-red-800/50 shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-red-900/50 rounded-xl">
              <Trash2 size={28} className="text-red-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-red-300">Koreksi Salah Scan</h1>
              <p className="text-sm text-red-200/70">Hapus entry yang belum diproses</p>
            </div>
          </div>
        </div>

        {/* Warning Notice */}
        <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle size={24} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-200">
            <p className="font-semibold mb-1">Perhatian:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Hanya entry dengan status <span className="font-semibold text-yellow-300">SCANNED</span> yang dapat dihapus</li>
              <li>Entry dengan status <span className="font-semibold text-green-300">MATCHED</span> tidak dapat dihapus</li>
              <li>Pastikan data yang dihapus memang salah input</li>
            </ul>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-700 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={20} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-200">Filter Data</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Type Toko */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Type Toko</label>
              <select
                value={filterTypeToko}
                onChange={(e) => setFilterTypeToko(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
              <label className="block text-sm font-medium text-gray-400 mb-2">Toko/Sub</label>
              <input
                type="text"
                value={filterToko}
                onChange={(e) => setFilterToko(e.target.value)}
                placeholder="MJM, BJW, LARIS..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            {/* Date From */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Dari Tanggal</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Sampai Tanggal</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleFilter}
              className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition-colors"
            >
              Terapkan Filter
            </button>
            <button
              onClick={handleClearFilters}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-semibold transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="bg-gray-800 rounded-xl p-4 mb-4 flex items-center justify-between border border-gray-700">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={entries.length > 0 && selectedIds.size === entries.length}
                onChange={toggleSelectAll}
                className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm font-medium text-gray-300">Pilih Semua</span>
            </label>
            <span className="text-sm text-gray-400">
              {selectedIds.size} dari {entries.length} dipilih
            </span>
          </div>

          <button
            onClick={handleDelete}
            disabled={selectedIds.size === 0 || loading}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-all ${
              selectedIds.size === 0 || loading
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-500 text-white shadow-lg hover:shadow-red-500/50 active:scale-95'
            }`}
          >
            <Trash2 size={18} />
            Hapus Yang Dipilih
          </button>
        </div>

        {/* Entries Table */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block w-8 h-8 border-4 border-gray-600 border-t-red-500 rounded-full animate-spin mb-4"></div>
                <p className="text-gray-400">Memuat data...</p>
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Trash2 size={48} className="mx-auto mb-4 opacity-50" />
                <p>Tidak ada entry SCANNED</p>
                <p className="text-sm mt-2">Semua scan sudah diproses atau belum ada data</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-700/50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={entries.length > 0 && selectedIds.size === entries.length}
                        onChange={toggleSelectAll}
                        className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-red-600"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Tanggal</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Toko</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Resi</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Part Number</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Barang</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, index) => (
                    <tr
                      key={entry.id}
                      className={`border-t border-gray-700 hover:bg-gray-700/30 transition-colors ${
                        index % 2 === 0 ? 'bg-gray-800/50' : 'bg-gray-800/30'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entry.id!)}
                          onChange={() => entry.id && toggleSelection(entry.id)}
                          className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-red-600"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {formatDate(entry.tanggal)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 bg-blue-900/50 text-blue-300 rounded">
                          {entry.type_toko}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">{entry.toko}</td>
                      <td className="px-4 py-3 text-sm text-cyan-300 font-medium">{entry.resi}</td>
                      <td className="px-4 py-3 text-sm text-gray-300 font-mono">{entry.part_number}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">{entry.barang}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
