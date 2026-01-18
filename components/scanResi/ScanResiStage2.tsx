// FILE: components/scanResi/ScanResiStage2.tsx
// Stage 2: Packing Verification - Camera barcode scanner

import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../context/StoreContext';
import {
  verifyResiStage2,
  getPendingStage2List
} from '../../services/resiScanService';
import {
  initCamera,
  stopCamera,
  requestCameraPermission,
  cleanupScanner
} from '../../utils/cameraScanner';
import { ResiScanStage } from '../../types';
import {
  Camera,
  CameraOff,
  Package,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Search,
  X,
  Check
} from 'lucide-react';

interface ScanResiStage2Props {
  onRefresh?: () => void;
}

const Toast = ({ message, type, onClose }: any) => (
  <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-xl flex items-center gap-2 text-white text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${
    type === 'success' ? 'bg-green-600' : type === 'warning' ? 'bg-yellow-600' : 'bg-red-600'
  }`}>
    {type === 'success' ? <Check size={16} /> : <X size={16} />}
    {message}
    <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
      <X size={14}/>
    </button>
  </div>
);

export const ScanResiStage2: React.FC<ScanResiStage2Props> = ({ onRefresh }) => {
  const { selectedStore, userName } = useStore();
  
  const [pendingList, setPendingList] = useState<ResiScanStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [lastScannedResi, setLastScannedResi] = useState<string | null>(null);
  const [scanningEnabled, setScanningEnabled] = useState(true);
  
  const scannerRef = useRef<HTMLDivElement>(null);
  const scanCooldownRef = useRef<NodeJS.Timeout | null>(null);
  
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  
  useEffect(() => {
    loadPendingList();
    
    return () => {
      cleanupScanner();
      if (scanCooldownRef.current) {
        clearTimeout(scanCooldownRef.current);
      }
    };
  }, [selectedStore]);
  
  const loadPendingList = async () => {
    setLoading(true);
    const data = await getPendingStage2List(selectedStore);
    setPendingList(data);
    setLoading(false);
  };
  
  const handleScanSuccess = async (decodedText: string) => {
    // Prevent rapid duplicate scans
    if (!scanningEnabled || decodedText === lastScannedResi) {
      return;
    }
    
    setLastScannedResi(decodedText);
    setScanningEnabled(false);
    
    // Audio feedback
    const beep = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OmfTgwOUKnk875qHgU7k9X0y3ksBS2Ax/DagjEIF2Kz6OyrUQ8IRp/g8r5sIAUsgs/y2Yg2CBxqvfDpn04MDlCq5PS+aiEGPJLU9Mt5LAUugcbw2oM');
    beep.play().catch(() => {});
    
    await verifyResi(decodedText);
    
    // Re-enable scanning after cooldown
    if (scanCooldownRef.current) {
      clearTimeout(scanCooldownRef.current);
    }
    scanCooldownRef.current = setTimeout(() => {
      setScanningEnabled(true);
      setLastScannedResi(null);
    }, 2000);
  };
  
  const verifyResi = async (resiNumber: string) => {
    const result = await verifyResiStage2(
      {
        resi: resiNumber,
        verified_by: userName || 'Admin'
      },
      selectedStore
    );
    
    if (result.success) {
      showToast(`✓ ${resiNumber} terverifikasi!`, 'success');
      await loadPendingList();
      if (onRefresh) onRefresh();
    } else {
      showToast(result.message, 'error');
    }
  };
  
  const startCamera = async () => {
    setCameraError(null);
    
    // Request permission first
    const permission = await requestCameraPermission();
    if (!permission.success) {
      setCameraError(permission.message);
      showToast(permission.message, 'error');
      return;
    }
    
    // Initialize camera
    const result = await initCamera(
      'scanner-region',
      handleScanSuccess,
      undefined,
      {
        fps: 10,
        qrbox: { width: 300, height: 150 },
        aspectRatio: 2.0
      }
    );
    
    if (result.success) {
      setCameraActive(true);
      showToast('Kamera aktif - Arahkan ke barcode', 'success');
    } else {
      setCameraError(result.message);
      showToast(result.message, 'error');
    }
  };
  
  const stopCameraScanning = async () => {
    await stopCamera();
    setCameraActive(false);
    setScanningEnabled(true);
    setLastScannedResi(null);
    showToast('Kamera dimatikan', 'warning');
  };
  
  const filteredList = pendingList.filter(resi =>
    resi.resi.toLowerCase().includes(searchTerm.toLowerCase()) ||
    resi.ecommerce.toLowerCase().includes(searchTerm.toLowerCase()) ||
    resi.sub_toko.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const getEcommerceBadgeColor = (ecommerce: string) => {
    switch (ecommerce.toUpperCase()) {
      case 'SHOPEE': return 'bg-orange-600';
      case 'TIKTOK': return 'bg-blue-600';
      case 'KILAT': return 'bg-purple-600';
      case 'EKSPOR': return 'bg-green-600';
      default: return 'bg-gray-600';
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-xl">
              <Camera size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Stage 2: Packing Verification</h1>
              <p className="text-sm text-gray-400">Scan resi dengan kamera untuk verifikasi</p>
            </div>
          </div>
          <button
            onClick={loadPendingList}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>
      
      {/* Camera Scanner */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6 shadow-lg border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Camera size={20} />
            Scanner Kamera
          </h2>
          {cameraActive ? (
            <button
              onClick={stopCameraScanning}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              <CameraOff size={16} />
              Matikan Kamera
            </button>
          ) : (
            <button
              onClick={startCamera}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              <Camera size={16} />
              Aktifkan Kamera
            </button>
          )}
        </div>
        
        {/* Scanner Region */}
        <div className="relative">
          <div
            id="scanner-region"
            ref={scannerRef}
            className={`w-full rounded-lg overflow-hidden ${
              cameraActive ? 'bg-black' : 'bg-gray-700'
            }`}
            style={{ minHeight: '300px' }}
          >
            {!cameraActive && (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <Camera size={64} className="text-gray-500 mb-4" />
                <p className="text-gray-400 text-center">
                  Klik "Aktifkan Kamera" untuk mulai scanning
                </p>
                {cameraError && (
                  <div className="mt-4 px-4 py-2 bg-red-600/20 text-red-400 rounded-lg flex items-center gap-2">
                    <AlertCircle size={16} />
                    {cameraError}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Scanning Status Indicator */}
          {cameraActive && (
            <div className="absolute top-4 right-4 px-3 py-2 bg-green-600 rounded-lg flex items-center gap-2 text-sm font-semibold shadow-lg">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              Scanning Active
            </div>
          )}
          
          {/* Last Scanned Indicator */}
          {lastScannedResi && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-blue-600 rounded-lg text-sm font-semibold shadow-lg">
              Scanned: {lastScannedResi}
            </div>
          )}
        </div>
        
        {/* Instructions */}
        <div className="mt-4 p-4 bg-gray-700/50 rounded-lg">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertCircle size={16} />
            Petunjuk Penggunaan:
          </h3>
          <ul className="text-sm text-gray-300 space-y-1 ml-6 list-disc">
            <li>Pastikan izin kamera sudah diberikan</li>
            <li>Arahkan kamera ke barcode/QR code pada resi</li>
            <li>Pastikan barcode terlihat jelas dalam frame</li>
            <li>System akan otomatis memverifikasi resi yang terdeteksi</li>
          </ul>
        </div>
      </div>
      
      {/* Pending List */}
      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Package size={20} />
              Menunggu Verifikasi
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Total:</span>
              <span className="px-3 py-1 bg-yellow-600 rounded-full text-sm font-semibold">
                {filteredList.length}
              </span>
            </div>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari resi, e-commerce, atau toko..."
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Tanggal Scan</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Resi</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">E-commerce</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Toko</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Di-scan oleh</th>
                <th className="px-4 py-3 text-center text-sm font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading && pendingList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                    Memuat data...
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    <CheckCircle size={48} className="mx-auto mb-2 text-green-600" />
                    <p className="text-lg font-semibold">Semua resi sudah diverifikasi!</p>
                    <p className="text-sm">Tidak ada resi yang menunggu verifikasi</p>
                  </td>
                </tr>
              ) : (
                filteredList.map((resi) => (
                  <tr key={resi.id} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      {new Date(resi.stage1_scanned_at || resi.created_at).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-blue-400">
                      {resi.resi}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 ${getEcommerceBadgeColor(resi.ecommerce)} rounded text-xs font-semibold`}>
                        {resi.ecommerce}
                        {resi.negara_ekspor && ` - ${resi.negara_ekspor}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-semibold">
                        {resi.sub_toko}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {resi.stage1_scanned_by || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-yellow-600 text-white rounded-full">
                        <AlertCircle size={12} />
                        Pending
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Statistics */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Pending Verifikasi</p>
              <p className="text-3xl font-bold text-yellow-400">{pendingList.length}</p>
            </div>
            <div className="p-3 bg-yellow-600/20 rounded-xl">
              <Package size={24} className="text-yellow-400" />
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Scanner Status</p>
              <p className="text-lg font-semibold text-gray-100">
                {cameraActive ? 'Active' : 'Inactive'}
              </p>
            </div>
            <div className={`p-3 rounded-xl ${cameraActive ? 'bg-green-600/20' : 'bg-gray-700'}`}>
              {cameraActive ? (
                <Camera size={24} className="text-green-400" />
              ) : (
                <CameraOff size={24} className="text-gray-400" />
              )}
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Last Scanned</p>
              <p className="text-sm font-mono text-blue-400">
                {lastScannedResi || 'None'}
              </p>
            </div>
            <div className="p-3 bg-blue-600/20 rounded-xl">
              <CheckCircle size={24} className="text-blue-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
