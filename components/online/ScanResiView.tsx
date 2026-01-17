// FILE: components/online/ScanResiView.tsx
// Main Scan Resi view for TIKTOK, SHOPEE, EKSPOR

import React, { useState, useEffect, useRef } from 'react';
import { Scan, Package, AlertCircle, CheckCircle, X, Search } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { ScanResiEntry } from '../../types';
import { addScanResi, checkResiExists } from '../../services/resiService';
import { getItemByPartNumber } from '../../services/supabaseService';

interface ScanResiViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

const TYPE_TOKO_OPTIONS = [
  { value: 'TIKTOK', label: 'TIKTOK', subs: ['LARIS', 'MJM', 'BJW'] },
  { value: 'SHOPEE', label: 'SHOPEE', subs: ['LARIS', 'MJM', 'BJW'] },
  { value: 'EKSPOR', label: 'EKSPOR', subs: ['PH', 'MY', 'SG', 'HK'] }
];

export const ScanResiView: React.FC<ScanResiViewProps> = ({ showToast }) => {
  const { selectedStore } = useStore();
  const [selectedType, setSelectedType] = useState<string>('TIKTOK');
  const [selectedSub, setSelectedSub] = useState<string>('LARIS');
  const [resi, setResi] = useState<string>('');
  const [partNumber, setPartNumber] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [autoFillData, setAutoFillData] = useState<any>(null);
  const [recentScans, setRecentScans] = useState<ScanResiEntry[]>([]);

  const resiInputRef = useRef<HTMLInputElement>(null);
  const partInputRef = useRef<HTMLInputElement>(null);

  const currentTypeOption = TYPE_TOKO_OPTIONS.find(opt => opt.value === selectedType);
  const subOptions = currentTypeOption?.subs || [];

  // Auto-focus resi input on mount
  useEffect(() => {
    resiInputRef.current?.focus();
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
    if (exists) {
      // Play error sound
      playErrorSound();
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

  const playErrorSound = () => {
    // Browser beep for duplicate alert - requires user interaction
    try {
      if (typeof window !== 'undefined' && window.AudioContext) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 400;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      }
    } catch (error) {
      // Audio may be blocked by browser policy, silently fail
      console.debug('Audio feedback not available:', error);
    }
  };

  const playSuccessSound = () => {
    // Browser beep for success - requires user interaction
    try {
      if (typeof window !== 'undefined' && window.AudioContext) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      }
    } catch (error) {
      // Audio may be blocked by browser policy, silently fail
      console.debug('Audio feedback not available:', error);
    }
  };

  const handleScanSubmit = async () => {
    if (!resi || !partNumber) {
      showToast('Resi dan Part Number harus diisi!', 'error');
      return;
    }

    if (isDuplicate) {
      showToast('Data sudah ada! Scan ditolak.', 'error');
      playErrorSound();
      return;
    }

    if (!autoFillData) {
      showToast('Part Number tidak ditemukan di database!', 'error');
      return;
    }

    setIsScanning(true);

    try {
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Jakarta'
      }).format(new Date());

      const entry: ScanResiEntry = {
        tanggal: today,
        type_toko: selectedType,
        toko: selectedSub,
        resi: resi.trim(),
        customer: '', // Will be filled during import
        part_number: partNumber.trim(),
        barang: autoFillData.barang,
        brand: autoFillData.brand,
        application: autoFillData.application,
        stok_saatini: autoFillData.stok_saatini,
        qty_out: 0, // Will be filled during import
        harga_satuan: 0, // Will be filled during import
        total_harga: 0, // Will be filled during import
        no_pesanan: '',
        negara_ekspor: selectedType === 'EKSPOR' ? selectedSub : undefined,
        status_packing: 'SCANNED',
        is_split: false,
        split_count: 1
      };

      const result = await addScanResi(entry, selectedStore);

      if (result.success) {
        playSuccessSound();
        showToast('✓ Scan berhasil!', 'success');
        
        // Add to recent scans
        setRecentScans(prev => [{ ...entry, id: result.id }, ...prev.slice(0, 4)]);

        // Clear form
        setResi('');
        setPartNumber('');
        setAutoFillData(null);
        
        // Focus back to resi input
        resiInputRef.current?.focus();
      } else {
        showToast(result.error || 'Gagal menyimpan scan!', 'error');
        playErrorSound();
      }
    } catch (error: any) {
      console.error('Scan error:', error);
      showToast('Error: ' + error.message, 'error');
      playErrorSound();
    } finally {
      setIsScanning(false);
    }
  };

  const handleResiKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      partInputRef.current?.focus();
    }
  };

  const handlePartKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!isDuplicate) {
        handleScanSubmit();
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-900/40 to-blue-900/40 rounded-2xl p-6 mb-6 border border-cyan-800/50 shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-cyan-900/50 rounded-xl">
              <Scan size={28} className="text-cyan-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-cyan-300">Scan Resi Online</h1>
              <p className="text-sm text-cyan-200/70">Packing - Pagi & Siang</p>
            </div>
          </div>
        </div>

        {/* Type & Sub Selection */}
        <div className="bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-700 shadow-lg">
          <h2 className="text-lg font-semibold mb-4 text-gray-200">Pilih Type Toko</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Type Toko</label>
              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  const newOption = TYPE_TOKO_OPTIONS.find(opt => opt.value === e.target.value);
                  setSelectedSub(newOption?.subs[0] || '');
                }}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                {TYPE_TOKO_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Sub Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                {selectedType === 'EKSPOR' ? 'Negara' : 'Toko'}
              </label>
              <select
                value={selectedSub}
                onChange={(e) => setSelectedSub(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                {subOptions.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Current Selection Display */}
          <div className="bg-cyan-900/20 rounded-lg p-3 border border-cyan-800/30">
            <p className="text-sm text-cyan-300">
              <span className="font-semibold">Saat ini: </span>
              {selectedType} → {selectedSub}
            </p>
          </div>
        </div>

        {/* Scan Form */}
        <div className="bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-700 shadow-lg">
          <h2 className="text-lg font-semibold mb-4 text-gray-200">Scan Barang</h2>

          <div className="space-y-4">
            {/* Resi Input */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                No. Resi / Tracking Number
              </label>
              <input
                ref={resiInputRef}
                type="text"
                value={resi}
                onChange={(e) => setResi(e.target.value)}
                onKeyPress={handleResiKeyPress}
                placeholder="Scan atau ketik nomor resi..."
                className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-gray-100 focus:ring-2 focus:border-transparent ${
                  isDuplicate 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-gray-600 focus:ring-cyan-500'
                }`}
                autoComplete="off"
              />
            </div>

            {/* Part Number Input */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Part Number
              </label>
              <input
                ref={partInputRef}
                type="text"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value.toUpperCase())}
                onKeyPress={handlePartKeyPress}
                placeholder="Scan atau ketik part number..."
                className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-gray-100 focus:ring-2 focus:border-transparent ${
                  isDuplicate 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-gray-600 focus:ring-cyan-500'
                }`}
                autoComplete="off"
              />
            </div>

            {/* Duplicate Alert */}
            {isDuplicate && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 flex items-start gap-3 animate-pulse">
                <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-300">⚠️ DATA SUDAH ADA!</p>
                  <p className="text-sm text-red-200 mt-1">
                    Kombinasi Resi "{resi}" dan Part "{partNumber}" sudah pernah discan.
                  </p>
                </div>
              </div>
            )}

            {/* Auto-fill Display */}
            {autoFillData && !isDuplicate && (
              <div className="bg-green-900/30 border border-green-800 rounded-lg p-4">
                <div className="flex items-start gap-3 mb-3">
                  <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="font-semibold text-green-300">Data Ditemukan</p>
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
                    <p className="text-gray-200 font-medium">{autoFillData.stok_saatini} pcs</p>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleScanSubmit}
              disabled={isScanning || isDuplicate || !resi || !partNumber || !autoFillData}
              className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
                isScanning || isDuplicate || !resi || !partNumber || !autoFillData
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg hover:shadow-cyan-500/50 active:scale-95'
              }`}
            >
              {isScanning ? 'Menyimpan...' : '✓ Simpan Scan'}
            </button>
          </div>
        </div>

        {/* Recent Scans */}
        {recentScans.length > 0 && (
          <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-lg">
            <h2 className="text-lg font-semibold mb-4 text-gray-200">Scan Terakhir</h2>
            <div className="space-y-3">
              {recentScans.map((scan, index) => (
                <div key={index} className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-cyan-300 font-semibold">{scan.resi}</span>
                    <span className="text-xs px-2 py-1 bg-green-900/50 text-green-300 rounded">
                      SCANNED
                    </span>
                  </div>
                  <div className="text-sm text-gray-300">
                    <p><span className="text-gray-500">Part:</span> {scan.part_number}</p>
                    <p><span className="text-gray-500">Barang:</span> {scan.barang}</p>
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
