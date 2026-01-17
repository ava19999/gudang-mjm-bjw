// FILE: components/online/KilatView.tsx
// Special view for KILAT orders (instant stock reduction)

import React, { useState, useEffect } from 'react';
import { Zap, Package, CheckCircle, Clock, Trash2 } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { KilatEntry } from '../../types';
import { addKilatEntry, fetchKilatEntries, deleteScanResi } from '../../services/resiService';
import { getItemByPartNumber } from '../../services/supabaseService';

interface KilatViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

const KILAT_TOKO_OPTIONS = ['MJM', 'BJW', 'LARIS'];

export const KilatView: React.FC<KilatViewProps> = ({ showToast }) => {
  const { selectedStore } = useStore();
  const [activeTab, setActiveTab] = useState<'unsold' | 'sold'>('unsold');
  const [selectedToko, setSelectedToko] = useState<string>('MJM');
  const [resi, setResi] = useState<string>('');
  const [partNumber, setPartNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoFillData, setAutoFillData] = useState<any>(null);
  const [kilatEntries, setKilatEntries] = useState<KilatEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadKilatEntries();
  }, [activeTab, selectedStore]);

  useEffect(() => {
    if (partNumber && partNumber.length > 3) {
      loadAutoFillData();
    } else {
      setAutoFillData(null);
    }
  }, [partNumber]);

  const loadKilatEntries = async () => {
    setLoading(true);
    try {
      const entries = await fetchKilatEntries(selectedStore, activeTab === 'sold');
      setKilatEntries(entries);
    } catch (error) {
      console.error('Error loading KILAT entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAutoFillData = async () => {
    try {
      const item = await getItemByPartNumber(partNumber, selectedStore);
      if (item) {
        setAutoFillData({
          barang: item.name,
          brand: item.brand,
          application: item.application,
          stok_saatini: item.quantity
        });
      } else {
        setAutoFillData(null);
      }
    } catch (error) {
      console.error('Error loading auto-fill:', error);
      setAutoFillData(null);
    }
  };

  const handleSubmit = async () => {
    if (!resi || !partNumber) {
      showToast('Resi dan Part Number harus diisi!', 'error');
      return;
    }

    if (!autoFillData) {
      showToast('Part Number tidak ditemukan!', 'error');
      return;
    }

    if (autoFillData.stok_saatini < 1) {
      showToast('Stok tidak mencukupi!', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Jakarta'
      }).format(new Date());

      const entry: Omit<KilatEntry, 'id'> = {
        tanggal: today,
        type_toko: 'KILAT',
        toko: selectedToko,
        resi: resi.trim(),
        part_number: partNumber.trim(),
        barang: autoFillData.barang,
        brand: autoFillData.brand,
        application: autoFillData.application,
        qty_out: 1,
        is_sold: false
      };

      const result = await addKilatEntry(entry, selectedStore);

      if (result.success) {
        showToast('✓ KILAT entry berhasil! Stok sudah dikurangi.', 'success');
        setResi('');
        setPartNumber('');
        setAutoFillData(null);
        loadKilatEntries();
      } else {
        showToast(result.error || 'Gagal menyimpan entry!', 'error');
      }
    } catch (error: any) {
      console.error('Submit error:', error);
      showToast('Error: ' + error.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus entry KILAT ini? Stok tidak akan dikembalikan!')) return;

    const result = await deleteScanResi(id, selectedStore);
    if (result.success) {
      showToast('Entry dihapus', 'success');
      loadKilatEntries();
    } else {
      showToast(result.error || 'Gagal menghapus', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-900/40 to-orange-900/40 rounded-2xl p-6 mb-6 border border-yellow-800/50 shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-yellow-900/50 rounded-xl">
              <Zap size={28} className="text-yellow-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-yellow-300">KILAT - Shopee Express</h1>
              <p className="text-sm text-yellow-200/70">Stok langsung berkurang, qty = 1</p>
            </div>
          </div>
        </div>

        {/* Input Form */}
        <div className="bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-700 shadow-lg">
          <h2 className="text-lg font-semibold mb-4 text-gray-200">Input KILAT</h2>

          <div className="space-y-4">
            {/* Toko Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Toko</label>
              <select
                value={selectedToko}
                onChange={(e) => setSelectedToko(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              >
                {KILAT_TOKO_OPTIONS.map(toko => (
                  <option key={toko} value={toko}>{toko}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Resi Input */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  No. Resi
                </label>
                <input
                  type="text"
                  value={resi}
                  onChange={(e) => setResi(e.target.value)}
                  placeholder="Scan atau ketik resi..."
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  autoComplete="off"
                />
              </div>

              {/* Part Number Input */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Part Number
                </label>
                <input
                  type="text"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value.toUpperCase())}
                  placeholder="Scan atau ketik part number..."
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Auto-fill Display */}
            {autoFillData && (
              <div className={`border rounded-lg p-4 ${
                autoFillData.stok_saatini > 0 
                  ? 'bg-green-900/30 border-green-800' 
                  : 'bg-red-900/30 border-red-800'
              }`}>
                <div className="flex items-start gap-3 mb-3">
                  {autoFillData.stok_saatini > 0 ? (
                    <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Package size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <p className={`font-semibold ${
                    autoFillData.stok_saatini > 0 ? 'text-green-300' : 'text-red-300'
                  }`}>
                    {autoFillData.stok_saatini > 0 ? 'Data Ditemukan' : 'Stok Habis!'}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-400">Nama Barang:</span>
                    <p className="text-gray-200 font-medium">{autoFillData.barang}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Brand:</span>
                    <p className="text-gray-200 font-medium">{autoFillData.brand}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Application:</span>
                    <p className="text-gray-200 font-medium">{autoFillData.application}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Stok Saat Ini:</span>
                    <p className={`font-bold ${
                      autoFillData.stok_saatini > 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {autoFillData.stok_saatini} pcs
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Customer Notice */}
            <div className="bg-yellow-900/20 rounded-lg p-3 border border-yellow-800/30">
              <p className="text-sm text-yellow-300">
                <span className="font-semibold">Customer otomatis: </span>
                KILAT {selectedToko}
              </p>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !resi || !partNumber || !autoFillData || autoFillData?.stok_saatini < 1}
              className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
                isSubmitting || !resi || !partNumber || !autoFillData || autoFillData?.stok_saatini < 1
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white shadow-lg hover:shadow-yellow-500/50 active:scale-95'
              }`}
            >
              {isSubmitting ? 'Menyimpan...' : '⚡ Simpan KILAT (Stok Langsung Kurang)'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-lg overflow-hidden">
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab('unsold')}
              className={`flex-1 px-6 py-4 font-semibold transition-all ${
                activeTab === 'unsold'
                  ? 'bg-yellow-900/30 text-yellow-300 border-b-2 border-yellow-500'
                  : 'text-gray-400 hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Clock size={20} />
                <span>BELUM TERJUAL</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('sold')}
              className={`flex-1 px-6 py-4 font-semibold transition-all ${
                activeTab === 'sold'
                  ? 'bg-green-900/30 text-green-300 border-b-2 border-green-500'
                  : 'text-gray-400 hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <CheckCircle size={20} />
                <span>SUDAH TERJUAL</span>
              </div>
            </button>
          </div>

          {/* Entries List */}
          <div className="p-6">
            {loading ? (
              <div className="text-center py-12 text-gray-400">
                <div className="inline-block w-8 h-8 border-4 border-gray-600 border-t-yellow-500 rounded-full animate-spin mb-4"></div>
                <p>Memuat data...</p>
              </div>
            ) : kilatEntries.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Package size={48} className="mx-auto mb-4 opacity-50" />
                <p>Belum ada data</p>
              </div>
            ) : (
              <div className="space-y-3">
                {kilatEntries.map(entry => (
                  <div
                    key={entry.id}
                    className={`rounded-lg p-4 border transition-all ${
                      entry.is_sold
                        ? 'bg-green-900/20 border-green-800/50'
                        : 'bg-gray-700/50 border-gray-600'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-yellow-300 font-semibold text-lg">{entry.resi}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(entry.tanggal).toLocaleDateString('id-ID')} • {entry.toko}
                        </p>
                      </div>
                      {!entry.is_sold && (
                        <button
                          onClick={() => entry.id && handleDelete(entry.id)}
                          className="p-2 hover:bg-red-900/30 rounded-lg transition-colors text-red-400 hover:text-red-300"
                          title="Hapus"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-400">Part Number:</span>
                        <p className="text-gray-200 font-medium">{entry.part_number}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Barang:</span>
                        <p className="text-gray-200 font-medium">{entry.barang}</p>
                      </div>
                      {entry.is_sold && entry.customer && (
                        <>
                          <div>
                            <span className="text-gray-400">Customer:</span>
                            <p className="text-gray-200 font-medium">{entry.customer}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Harga:</span>
                            <p className="text-gray-200 font-medium">
                              Rp {entry.total_harga?.toLocaleString('id-ID')}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
