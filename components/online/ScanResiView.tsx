// FILE: components/online/ScanResiView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, X, AlertCircle } from 'lucide-react';
import { BarcodeScanner } from '../../utils/barcodeScanner';
import { ScanResi } from '../../types';
import { saveScanResi, deleteScanResi, getTodayScanResi } from '../../services/resiService';

interface ScanResiViewProps {
  store: string | null;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

type TypeToko = 'TIKTOK' | 'SHOPEE' | 'KILAT' | 'RESELLER' | 'EKSPOR';
type SubToko = 'MJM' | 'BJW' | 'LARIS';
type NegaraEkspor = 'PH' | 'MY' | 'SG' | 'HK';

export const ScanResiView: React.FC<ScanResiViewProps> = ({ store, showToast }) => {
  const [selectedTypeToko, setSelectedTypeToko] = useState<TypeToko>('SHOPEE');
  const [selectedSubToko, setSelectedSubToko] = useState<SubToko>('MJM');
  const [selectedNegara, setSelectedNegara] = useState<NegaraEkspor>('PH');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [lastScannedResi, setLastScannedResi] = useState<string>('');
  const [scannedList, setScannedList] = useState<ScanResi[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const scannerRef = useRef<BarcodeScanner | null>(null);
  const cameraElementId = 'qr-reader';

  // Load today's scanned resi
  useEffect(() => {
    loadTodayScans();
  }, [store]);

  const loadTodayScans = async () => {
    const data = await getTodayScanResi(store);
    setScannedList(data);
  };

  const handleStartCamera = async () => {
    if (isCameraOn) {
      await handleStopCamera();
      return;
    }

    try {
      if (!scannerRef.current) {
        scannerRef.current = new BarcodeScanner(cameraElementId);
      }

      await scannerRef.current.start({
        onSuccess: handleScanSuccess,
        onError: (error) => {
          console.error('Scanner error:', error);
        },
        fps: 10,
        qrbox: 250,
      });

      setIsCameraOn(true);
      showToast('Kamera aktif. Arahkan ke barcode resi', 'success');
    } catch (error) {
      showToast('Gagal mengaktifkan kamera. Periksa izin kamera.', 'error');
      console.error('Failed to start camera:', error);
    }
  };

  const handleStopCamera = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop();
      setIsCameraOn(false);
      showToast('Kamera dimatikan', 'success');
    }
  };

  const handleScanSuccess = async (decodedText: string) => {
    setLastScannedResi(decodedText);

    // Determine toko and negara based on type
    let toko: string | undefined = undefined;
    let negara_ekspor: string | undefined = undefined;

    if (selectedTypeToko === 'EKSPOR') {
      negara_ekspor = selectedNegara;
    } else if (selectedTypeToko !== 'KILAT' && selectedTypeToko !== 'RESELLER') {
      toko = selectedSubToko;
    }

    const resiData: ScanResi = {
      tanggal: new Date().toISOString(),
      type_toko: selectedTypeToko,
      toko,
      negara_ekspor,
      resi: decodedText,
      status: 'SCANNED',
      scanned_at: new Date().toISOString(),
    };

    setIsLoading(true);
    const result = await saveScanResi(resiData, store);
    setIsLoading(false);

    if (result.success) {
      showToast(`✅ Resi ${decodedText} tersimpan`, 'success');
      await loadTodayScans();
    } else {
      showToast(`❌ ${result.error || 'Gagal menyimpan resi'}`, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus resi ini?')) return;

    const success = await deleteScanResi(id, store);
    if (success) {
      showToast('Resi dihapus', 'success');
      await loadTodayScans();
    } else {
      showToast('Gagal menghapus resi', 'error');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop();
      }
    };
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SCANNED':
        return <span className="px-2 py-1 text-xs bg-blue-900/50 text-blue-300 rounded">📦 Scanned</span>;
      case 'MATCHED':
        return <span className="px-2 py-1 text-xs bg-green-900/50 text-green-300 rounded">✅ Matched</span>;
      case 'PROCESSED':
        return <span className="px-2 py-1 text-xs bg-purple-900/50 text-purple-300 rounded">✨ Processed</span>;
      default:
        return <span className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded">{status}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-900 to-blue-900 p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            📦 SCAN RESI - PACKING
          </h2>
          <button
            onClick={handleStartCamera}
            className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
              isCameraOn
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isCameraOn ? (
              <>
                <X size={18} /> Stop Camera
              </>
            ) : (
              <>
                <Camera size={18} /> Start Camera
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Type Toko Selection */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <label className="block text-sm font-semibold mb-2">PILIH TOKO:</label>
          <div className="flex flex-wrap gap-2">
            {(['TIKTOK', 'SHOPEE', 'KILAT', 'RESELLER', 'EKSPOR'] as TypeToko[]).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedTypeToko(type)}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  selectedTypeToko === type
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Sub Toko (for TIKTOK, SHOPEE) */}
          {(selectedTypeToko === 'TIKTOK' || selectedTypeToko === 'SHOPEE') && (
            <div className="mt-4">
              <label className="block text-sm font-semibold mb-2">SUB TOKO:</label>
              <div className="flex gap-2">
                {(['LARIS', 'MJM', 'BJW'] as SubToko[]).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setSelectedSubToko(sub)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      selectedSubToko === sub
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Negara (for EKSPOR) */}
          {selectedTypeToko === 'EKSPOR' && (
            <div className="mt-4">
              <label className="block text-sm font-semibold mb-2">NEGARA:</label>
              <div className="flex gap-2">
                {(['PH', 'MY', 'SG', 'HK'] as NegaraEkspor[]).map((negara) => (
                  <button
                    key={negara}
                    onClick={() => setSelectedNegara(negara)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      selectedNegara === negara
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {negara}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* KILAT Note */}
          {selectedTypeToko === 'KILAT' && (
            <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg flex items-start gap-2">
              <AlertCircle size={20} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-200">
                <strong>KILAT:</strong> Stok langsung berkurang, customer tetap "KILAT SHOPEE", qty=1
              </div>
            </div>
          )}
        </div>

        {/* Camera Scanner */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div id={cameraElementId} className="w-full max-w-md mx-auto rounded-lg overflow-hidden" />
          
          {!isCameraOn && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Camera size={64} className="mb-4 opacity-30" />
              <p className="text-lg">Klik "Start Camera" untuk mulai scan</p>
            </div>
          )}

          {lastScannedResi && (
            <div className="mt-4 p-3 bg-green-900/30 border border-green-700 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-green-400 font-bold">🔊 BEEP!</span>
                <span className="text-green-300">✅ Resi <strong>{lastScannedResi}</strong> tersimpan</span>
              </div>
            </div>
          )}
        </div>

        {/* Hasil Scan Hari Ini */}
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 bg-gray-750 border-b border-gray-700">
            <h3 className="text-lg font-bold">📊 HASIL SCAN HARI INI</h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-750 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left border-b border-gray-700">#</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">RESI</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">TIPE</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">TOKO</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">WAKTU</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">STATUS</th>
                  <th className="px-4 py-3 text-center border-b border-gray-700">AKSI</th>
                </tr>
              </thead>
              <tbody>
                {scannedList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Belum ada resi yang discan hari ini
                    </td>
                  </tr>
                ) : (
                  scannedList.map((item, index) => (
                    <tr key={item.id} className="border-b border-gray-700 hover:bg-gray-750">
                      <td className="px-4 py-3">{index + 1}</td>
                      <td className="px-4 py-3 font-mono">{item.resi}</td>
                      <td className="px-4 py-3">{item.type_toko}</td>
                      <td className="px-4 py-3">{item.toko || item.negara_ekspor || '-'}</td>
                      <td className="px-4 py-3">
                        {new Date(item.scanned_at).toLocaleTimeString('id-ID')}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDelete(item.id!)}
                          className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                          title="Hapus"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg">
            <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-white">Menyimpan...</p>
          </div>
        </div>
      )}
    </div>
  );
};
