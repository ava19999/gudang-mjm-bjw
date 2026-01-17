// FILE: components/online/ResellerView.tsx
// Manual RESELLER order input with all fields entered manually

import React, { useState, useEffect, useRef } from 'react';
import { ShoppingBag, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { ScanResiEntry } from '../../types';
import { addScanResi, checkResiExists } from '../../services/resiService';
import { getItemByPartNumber } from '../../services/supabaseService';

interface ResellerViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

const TOKO_OPTIONS = ['MJM', 'BJW', 'LARIS'];

export const ResellerView: React.FC<ResellerViewProps> = ({ showToast }) => {
  const { selectedStore } = useStore();
  const [tanggal, setTanggal] = useState<string>('');
  const [selectedToko, setSelectedToko] = useState<string>('MJM');
  const [resi, setResi] = useState<string>('');
  const [customer, setCustomer] = useState<string>('');
  const [partNumber, setPartNumber] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [hargaSatuan, setHargaSatuan] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [autoFillData, setAutoFillData] = useState<any>(null);
  const [recentEntries, setRecentEntries] = useState<ScanResiEntry[]>([]);

  const resiInputRef = useRef<HTMLInputElement>(null);

  // Set default date to today
  useEffect(() => {
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jakarta'
    }).format(new Date());
    setTanggal(today);
  }, []);

  // Check for duplicates when resi or part number changes
  useEffect(() => {
    if (resi && partNumber) {
      checkDuplicate();
    } else {
      setIsDuplicate(false);
    }
  }, [resi, partNumber]);

  // Auto-fill from base when part number is entered
  useEffect(() => {
    if (partNumber && partNumber.length > 3) {
      loadAutoFillData();
    } else {
      setAutoFillData(null);
    }
  }, [partNumber]);

  const checkDuplicate = async () => {
    const exists = await checkResiExists(resi, partNumber, selectedStore);
    setIsDuplicate(exists);
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

  const totalHarga = quantity * hargaSatuan;

  const handleSubmit = async () => {
    if (!tanggal || !resi || !customer || !partNumber) {
      showToast('Tanggal, Resi, Customer, dan Part Number harus diisi!', 'error');
      return;
    }

    if (isDuplicate) {
      showToast('Data sudah ada! Submit ditolak.', 'error');
      return;
    }

    if (!autoFillData) {
      showToast('Part Number tidak ditemukan di database!', 'error');
      return;
    }

    if (quantity <= 0) {
      showToast('Quantity harus lebih dari 0!', 'error');
      return;
    }

    if (hargaSatuan <= 0) {
      showToast('Harga Satuan harus lebih dari 0!', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const entry: ScanResiEntry = {
        tanggal: tanggal,
        type_toko: 'RESELLER',
        toko: selectedToko,
        resi: resi.trim(),
        customer: customer.trim(),
        part_number: partNumber.trim(),
        barang: autoFillData.barang,
        brand: autoFillData.brand,
        application: autoFillData.application,
        stok_saatini: autoFillData.stok_saatini,
        qty_out: quantity,
        harga_satuan: hargaSatuan,
        total_harga: totalHarga,
        no_pesanan: '',
        status_packing: 'SCANNED',
        is_split: false,
        split_count: 1
      };

      const result = await addScanResi(entry, selectedStore);

      if (result.success) {
        showToast('✓ Entry RESELLER berhasil disimpan!', 'success');
        
        // Add to recent entries
        setRecentEntries(prev => [{ ...entry, id: result.id }, ...prev.slice(0, 4)]);

        // Clear form except date and toko
        setResi('');
        setCustomer('');
        setPartNumber('');
        setQuantity(1);
        setHargaSatuan(0);
        setAutoFillData(null);
        
        // Focus back to resi input
        resiInputRef.current?.focus();
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

  const handleKeyPress = (e: React.KeyboardEvent, nextRef?: React.RefObject<any>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextRef?.current) {
        nextRef.current.focus();
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header with Purple/Indigo Gradient */}
        <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 rounded-2xl p-6 mb-6 border border-purple-800/50 shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-purple-900/50 rounded-xl">
              <ShoppingBag size={28} className="text-purple-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-purple-300">RESELLER - Manual Input</h1>
              <p className="text-sm text-purple-200/70">Input manual semua field untuk pesanan reseller</p>
            </div>
          </div>
        </div>

        {/* Input Form */}
        <div className="bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-700 shadow-lg">
          <h2 className="text-lg font-semibold mb-4 text-gray-200">Input Order Reseller</h2>

          <div className="space-y-4">
            {/* Date and Toko */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Tanggal <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Toko <span className="text-red-400">*</span>
                </label>
                <select
                  value={selectedToko}
                  onChange={(e) => setSelectedToko(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  {TOKO_OPTIONS.map(toko => (
                    <option key={toko} value={toko}>{toko}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Resi and Customer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  No. Resi <span className="text-red-400">*</span>
                </label>
                <input
                  ref={resiInputRef}
                  type="text"
                  value={resi}
                  onChange={(e) => setResi(e.target.value)}
                  placeholder="Masukkan nomor resi..."
                  className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                    isDuplicate ? 'border-red-500' : 'border-gray-600'
                  }`}
                  autoComplete="off"
                />
                {isDuplicate && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> Resi + Part Number sudah ada!
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Nama Customer <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Masukkan nama customer..."
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Part Number */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Part Number <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value.toUpperCase())}
                placeholder="Masukkan part number..."
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                autoComplete="off"
              />
            </div>

            {/* Auto-fill Display */}
            {autoFillData && (
              <div className="border rounded-lg p-4 bg-blue-900/30 border-blue-800">
                <div className="flex items-start gap-3 mb-3">
                  <CheckCircle size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="font-semibold text-blue-300">Data Ditemukan</p>
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
                    <p className="text-gray-200 font-bold">{autoFillData.stok_saatini} pcs</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quantity and Price */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Quantity <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Harga Satuan (Rp) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={hargaSatuan}
                  onChange={(e) => setHargaSatuan(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Total Harga (Rp)
                </label>
                <div className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 font-bold">
                  {totalHarga.toLocaleString('id-ID')}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || isDuplicate || !autoFillData}
                className={`w-full py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                  isSubmitting || isDuplicate || !autoFillData
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <TrendingUp size={20} />
                    Submit Order Reseller
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Recent Entries */}
        {recentEntries.length > 0 && (
          <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-lg">
            <h2 className="text-lg font-semibold mb-4 text-gray-200">Recent Entries (Last 5)</h2>
            <div className="space-y-3">
              {recentEntries.map((entry, index) => (
                <div
                  key={index}
                  className="bg-gray-700/50 rounded-lg p-4 border border-gray-600"
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-gray-400">Tanggal:</span>
                      <p className="text-gray-200 font-medium">{entry.tanggal}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Toko:</span>
                      <p className="text-gray-200 font-medium">{entry.toko}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Resi:</span>
                      <p className="text-gray-200 font-medium">{entry.resi}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Customer:</span>
                      <p className="text-gray-200 font-medium">{entry.customer}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-gray-400">Part Number:</span>
                      <p className="text-gray-200 font-medium">{entry.part_number}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Qty:</span>
                      <p className="text-gray-200 font-medium">{entry.qty_out} pcs</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Total:</span>
                      <p className="text-purple-400 font-bold">
                        Rp {entry.total_harga.toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
