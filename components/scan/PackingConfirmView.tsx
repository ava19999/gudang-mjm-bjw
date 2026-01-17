// FILE: components/scan/PackingConfirmView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Camera, Check, Search } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { OnlineOrderRow } from '../../types';
import {
  fetchScanResiEntries,
  updateScanResiStatus,
  checkDuplicateResi
} from '../../services/supabaseService';

interface PackingConfirmViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onRefresh?: () => void;
}

export const PackingConfirmView: React.FC<PackingConfirmViewProps> = ({ showToast, onRefresh }) => {
  const { selectedStore } = useStore();
  const [resiToScan, setResiToScan] = useState('');
  const [scannedResiList, setScannedResiList] = useState<OnlineOrderRow[]>([]);
  const [packedResiList, setPackedResiList] = useState<OnlineOrderRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const resiInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadResiData();
  }, [selectedStore]);

  const loadResiData = async () => {
    const scanned = await fetchScanResiEntries(selectedStore, 'scanned');
    const packed = await fetchScanResiEntries(selectedStore, 'packed');
    setScannedResiList(scanned);
    setPackedResiList(packed);
  };

  const handleResiScan = async () => {
    const trimmedResi = resiToScan.trim();
    if (!trimmedResi) {
      showToast('Masukkan nomor resi!', 'error');
      return;
    }

    setLoading(true);

    try {
      // Check if resi exists in scanned list
      const existingResi = scannedResiList.filter(item => item.resi === trimmedResi);
      
      if (existingResi.length === 0) {
        showToast(`Resi ${trimmedResi} tidak ditemukan atau belum discan oleh warehouse!`, 'error');
        setLoading(false);
        return;
      }

      // Update all items with this resi to "packed" status
      const updatePromises = existingResi.map(item => {
        if (!item.id) {
          console.error('Item missing id:', item);
          return Promise.resolve(false);
        }
        return updateScanResiStatus(item.id, 'packed', selectedStore);
      });
      
      const results = await Promise.all(updatePromises);
      const successCount = results.filter(r => r).length;
      
      showToast(`Resi ${trimmedResi} dikonfirmasi PACKED! ✓`, 'success');
      setResiToScan('');
      loadResiData();
      onRefresh?.();
      resiInputRef.current?.focus();
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredScannedResi = scannedResiList.filter(item =>
    item.resi.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPackedResi = packedResiList.filter(item =>
    item.resi.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group by resi
  const groupByResi = (items: OnlineOrderRow[]) => {
    return items.reduce((acc, item) => {
      if (!acc[item.resi]) {
        acc[item.resi] = [];
      }
      acc[item.resi].push(item);
      return acc;
    }, {} as Record<string, OnlineOrderRow[]>);
  };

  const groupedScanned = groupByResi(filteredScannedResi);
  const groupedPacked = groupByResi(filteredPackedResi);

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h1 className="text-2xl font-bold text-gray-100 mb-4">Konfirmasi Packing</h1>
          <p className="text-gray-400 mb-6">
            Scan resi untuk mengkonfirmasi barang sudah dipacking dan siap dikirim
          </p>

          {/* Resi Scanner */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Nomor Resi
              </label>
              <input
                ref={resiInputRef}
                type="text"
                value={resiToScan}
                onChange={(e) => setResiToScan(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleResiScan();
                  }
                }}
                placeholder="Scan atau ketik nomor resi..."
                className="w-full bg-gray-700 text-gray-100 rounded-lg px-4 py-3 text-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleResiScan}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-medium"
              >
                <Check size={20} />
                {loading ? 'Processing...' : 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-yellow-900 bg-opacity-30 rounded-lg p-6 border border-yellow-700">
            <h3 className="text-lg font-semibold text-yellow-400 mb-2">Menunggu Packing</h3>
            <p className="text-4xl font-bold text-yellow-300">
              {Object.keys(groupedScanned).length}
            </p>
            <p className="text-sm text-yellow-500 mt-1">Resi belum dikonfirmasi</p>
          </div>
          <div className="bg-green-900 bg-opacity-30 rounded-lg p-6 border border-green-700">
            <h3 className="text-lg font-semibold text-green-400 mb-2">Sudah Packed</h3>
            <p className="text-4xl font-bold text-green-300">
              {Object.keys(groupedPacked).length}
            </p>
            <p className="text-sm text-green-500 mt-1">Resi siap kirim</p>
          </div>
        </div>

        {/* Search */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari resi..."
              className="w-full pl-10 pr-4 py-2 bg-gray-700 text-gray-100 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Waiting to Pack */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-gray-100 mb-4">
            Menunggu Packing ({Object.keys(groupedScanned).length})
          </h2>
          
          {Object.keys(groupedScanned).length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">Semua resi sudah dipacking! ✓</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(groupedScanned).map(([resi, items]) => (
                <div key={resi} className="bg-yellow-900 bg-opacity-20 rounded-lg p-4 border border-yellow-700">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-yellow-300 font-mono">
                        {resi}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {items.length} item(s)
                      </p>
                    </div>
                    <span className="px-2 py-1 bg-yellow-600 text-white text-xs rounded">
                      Belum
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Platform: {items[0].ecommerce}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Already Packed */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-gray-100 mb-4">
            Sudah Packed ({Object.keys(groupedPacked).length})
          </h2>
          
          {Object.keys(groupedPacked).length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">Belum ada resi yang dipacking</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(groupedPacked).map(([resi, items]) => (
                <div key={resi} className="bg-green-900 bg-opacity-20 rounded-lg p-4 border border-green-700">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-green-300 font-mono">
                        {resi}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {items.length} item(s)
                      </p>
                    </div>
                    <span className="px-2 py-1 bg-green-600 text-white text-xs rounded flex items-center gap-1">
                      <Check size={12} />
                      Packed
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Platform: {items[0].ecommerce}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
