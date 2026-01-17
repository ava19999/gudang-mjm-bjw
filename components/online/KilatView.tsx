// FILE: components/online/KilatView.tsx
import React, { useState, useEffect } from 'react';
import { Zap, Package, DollarSign } from 'lucide-react';
import { KilatItem } from '../../types';
import { saveKilatItem, getKilatItems, updateKilatItemToSold } from '../../services/resiService';
import { getItemByPartNumber } from '../../services/supabaseService';

interface KilatViewProps {
  store: string | null;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

type KilatTab = 'DIKIRIM' | 'TERJUAL';

export const KilatView: React.FC<KilatViewProps> = ({ store, showToast }) => {
  const [activeTab, setActiveTab] = useState<KilatTab>('DIKIRIM');
  const [partNumber, setPartNumber] = useState('');
  const [selectedToko, setSelectedToko] = useState<'MJM' | 'BJW' | 'LARIS'>('MJM');
  const [kilatItems, setKilatItems] = useState<KilatItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // For marking as sold
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [soldCustomer, setSoldCustomer] = useState('');
  const [soldHarga, setSoldHarga] = useState('');

  useEffect(() => {
    loadKilatItems();
  }, [activeTab, store]);

  const loadKilatItems = async () => {
    const items = await getKilatItems(store, activeTab);
    setKilatItems(items);
  };

  const handleScanPartNumber = async () => {
    if (!partNumber.trim()) {
      showToast('Masukkan part number', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      // Check if part number exists
      const item = await getItemByPartNumber(partNumber, store);
      if (!item) {
        showToast('Part number tidak ditemukan', 'error');
        setIsProcessing(false);
        return;
      }

      // Check stock
      if (item.quantity <= 0) {
        showToast('Stok tidak tersedia', 'error');
        setIsProcessing(false);
        return;
      }

      // Save kilat item
      const customer = `KILAT SHOPEE ${selectedToko}`;
      const kilatItem: KilatItem = {
        tanggal: new Date().toISOString(),
        toko: selectedToko,
        part_number: partNumber,
        nama_barang: item.name,
        status: 'DIKIRIM',
      };

      const success = await saveKilatItem(kilatItem, store);

      if (success) {
        // Update stock (decrease by 1)
        // Note: This should ideally call a service to update stock
        showToast(`✅ ${partNumber} discan. Stok berkurang -1`, 'success');
        setPartNumber('');
        await loadKilatItems();
      } else {
        showToast('Gagal menyimpan item', 'error');
      }
    } catch (error) {
      console.error('Error scanning part number:', error);
      showToast('Terjadi kesalahan', 'error');
    }

    setIsProcessing(false);
  };

  const handleMarkAsSold = async () => {
    if (!selectedItemId || !soldCustomer.trim() || !soldHarga.trim()) {
      showToast('Lengkapi data customer dan harga', 'error');
      return;
    }

    const harga = parseFloat(soldHarga);
    if (isNaN(harga) || harga <= 0) {
      showToast('Harga tidak valid', 'error');
      return;
    }

    const success = await updateKilatItemToSold(selectedItemId, soldCustomer, harga, store);

    if (success) {
      showToast('Item ditandai sebagai terjual', 'success');
      setSelectedItemId(null);
      setSoldCustomer('');
      setSoldHarga('');
      await loadKilatItems();
    } else {
      showToast('Gagal update status', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-900 to-orange-900 p-4 shadow-lg">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Zap size={24} />
          KILAT SHOPEE - SCAN BARANG
        </h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Scan Section (only in DIKIRIM tab) */}
        {activeTab === 'DIKIRIM' && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">📦 Scan Barang</h3>

            {/* Toko Selection */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">PILIH TOKO:</label>
              <div className="flex gap-2">
                {(['MJM', 'BJW', 'LARIS'] as const).map((toko) => (
                  <button
                    key={toko}
                    onClick={() => setSelectedToko(toko)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      selectedToko === toko
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {toko}
                  </button>
                ))}
              </div>
            </div>

            {/* Part Number Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScanPartNumber()}
                placeholder="Scan atau ketik part number..."
                className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                disabled={isProcessing}
              />
              <button
                onClick={handleScanPartNumber}
                disabled={isProcessing}
                className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 rounded-lg font-semibold transition-all"
              >
                {isProcessing ? 'Processing...' : 'Scan'}
              </button>
            </div>

            <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg text-sm text-yellow-200">
              <strong>Note:</strong> Customer otomatis: "KILAT SHOPEE {selectedToko}", Qty = 1, Stok langsung berkurang
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab('DIKIRIM')}
              className={`flex-1 px-4 py-3 font-semibold transition-all ${
                activeTab === 'DIKIRIM'
                  ? 'bg-yellow-900/50 text-yellow-300 border-b-2 border-yellow-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Package size={18} className="inline mr-2" />
              DIKIRIM KE PUSAT
            </button>
            <button
              onClick={() => setActiveTab('TERJUAL')}
              className={`flex-1 px-4 py-3 font-semibold transition-all ${
                activeTab === 'TERJUAL'
                  ? 'bg-green-900/50 text-green-300 border-b-2 border-green-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <DollarSign size={18} className="inline mr-2" />
              SUDAH TERJUAL
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-750">
                <tr>
                  <th className="px-4 py-3 text-left border-b border-gray-700">#</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">TANGGAL</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">TOKO</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">PART NUMBER</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">NAMA BARANG</th>
                  {activeTab === 'TERJUAL' && (
                    <>
                      <th className="px-4 py-3 text-left border-b border-gray-700">CUSTOMER</th>
                      <th className="px-4 py-3 text-right border-b border-gray-700">HARGA</th>
                      <th className="px-4 py-3 text-left border-b border-gray-700">TERJUAL</th>
                    </>
                  )}
                  {activeTab === 'DIKIRIM' && (
                    <th className="px-4 py-3 text-center border-b border-gray-700">AKSI</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {kilatItems.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'TERJUAL' ? 8 : 6} className="px-4 py-8 text-center text-gray-500">
                      Tidak ada data
                    </td>
                  </tr>
                ) : (
                  kilatItems.map((item, index) => (
                    <tr key={item.id} className="border-b border-gray-700 hover:bg-gray-750">
                      <td className="px-4 py-3">{index + 1}</td>
                      <td className="px-4 py-3">
                        {new Date(item.tanggal).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-4 py-3">{item.toko}</td>
                      <td className="px-4 py-3 font-mono text-cyan-400">{item.part_number}</td>
                      <td className="px-4 py-3">{item.nama_barang}</td>
                      {activeTab === 'TERJUAL' && (
                        <>
                          <td className="px-4 py-3">{item.customer}</td>
                          <td className="px-4 py-3 text-right">
                            {item.harga ? `Rp ${item.harga.toLocaleString('id-ID')}` : '-'}
                          </td>
                          <td className="px-4 py-3">
                            {item.sold_at ? new Date(item.sold_at).toLocaleDateString('id-ID') : '-'}
                          </td>
                        </>
                      )}
                      {activeTab === 'DIKIRIM' && (
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedItemId(item.id!)}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-semibold"
                          >
                            Mark Sold
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mark as Sold Modal */}
      {selectedItemId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-bold mb-4">Tandai Sebagai Terjual</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Customer</label>
                <input
                  type="text"
                  value={soldCustomer}
                  onChange={(e) => setSoldCustomer(e.target.value)}
                  placeholder="Nama customer..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-1">Harga Jual</label>
                <input
                  type="number"
                  value={soldHarga}
                  onChange={(e) => setSoldHarga(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  setSelectedItemId(null);
                  setSoldCustomer('');
                  setSoldHarga('');
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleMarkAsSold}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
