// FILE: components/scanResi/ScanResiStage2.tsx
// Stage 2: Packing Verification - Camera barcode scanner


import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../context/StoreContext';
import {
  verifyResiStage2,
  getPendingStage2List,
  getResiStage1List
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

// Error boundary for camera region (modernized, more robust)
function CameraError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="flex flex-col items-center justify-center h-full py-16">
      <span className="text-red-400 text-lg font-bold mb-2">Gagal memuat kamera</span>
      <span className="text-red-300 text-sm mb-2">
        {error.includes('removeChild')
          ? 'Kamera gagal dimuat. Cek izin kamera, pastikan device support, dan refresh halaman.'
          : (error || 'Terjadi error saat mengaktifkan kamera.')}
      </span>
      <span className="text-gray-400 text-xs">Coba refresh halaman atau cek izin kamera.</span>
    </div>
  );
}

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
  const [showAllStage1, setShowAllStage1] = useState(true); // default true: tampilkan semua resi stage 1
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchEcommerce, setSearchEcommerce] = useState('');
  const [searchToko, setSearchToko] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [lastScannedResi, setLastScannedResi] = useState<string | null>(null);
  const [scanningEnabled, setScanningEnabled] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending'); // 'pending' | 'stage2' | 'all'
  // State untuk input manual
  const [manualResi, setManualResi] = useState('');
  const scannerRef = useRef<HTMLDivElement>(null);
  const scanCooldownRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualResi.trim()) {
      showToast('Nomor resi tidak boleh kosong!', 'error');
      return;
    }
    await verifyResi(manualResi.trim());
    setManualResi('');
  };
  

  // Load data and cleanup camera on unmount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      let data: ResiScanStage[] = [];
      try {
        if (showAllStage1) {
          data = await getResiStage1List(selectedStore);
        } else {
          data = await getPendingStage2List(selectedStore);
        }
        if (mounted) setPendingList(Array.isArray(data) ? data : []);
        setDataError(null);
      } catch (e: any) {
        setDataError('Gagal memuat data resi. Silakan refresh halaman.');
      }
      setLoading(false);
    };
    load();
    return () => {
      mounted = false;
      cleanupScanner();
      if (scanCooldownRef.current) clearTimeout(scanCooldownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore, showAllStage1]);
  
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
      // Jangan ubah statusFilter, cukup reload data sesuai filter yang aktif
      setLoading(true);
      let data: ResiScanStage[] = [];
      if (statusFilter === 'pending') {
        data = await getPendingStage2List(selectedStore);
      } else if (statusFilter === 'stage2') {
        // Ambil semua, filter di client
        data = await getResiStage1List(selectedStore);
      } else {
        // 'all'
        data = await getResiStage1List(selectedStore);
      }
      setPendingList(data);
      setLoading(false);
      if (onRefresh) onRefresh();
    } else {
      showToast(result.message, 'error');
    }
  };
  

  // Robust camera start with error handling
  const startCamera = async () => {
    setCameraError(null);
    setCameraInitialized(false);
    try {
      const permission = await requestCameraPermission();
      if (!permission.success) throw new Error(permission.message);
      const result = await initCamera(
        'scanner-region',
        handleScanSuccess,
        (err) => setCameraError(err || 'Gagal membaca barcode'),
        { fps: 10, qrbox: { width: 320, height: 160 }, aspectRatio: 2.0 }
      );
      if (!result.success) throw new Error(result.message);
      setCameraActive(true);
      setCameraInitialized(true);
      showToast('Kamera aktif - Arahkan ke barcode', 'success');
    } catch (err: any) {
      setCameraError(err?.message || 'Terjadi error saat mengaktifkan kamera.');
      setCameraActive(false);
      setCameraInitialized(false);
      showToast(err?.message || 'Terjadi error saat mengaktifkan kamera.', 'error');
      await cleanupScanner();
    }
  };
  

  const stopCameraScanning = async () => {
    try {
      if (cameraInitialized) await stopCamera();
      await cleanupScanner();
    } catch {}
    setCameraInitialized(false);
    setCameraActive(false);
    setScanningEnabled(true);
    setLastScannedResi(null);
    showToast('Kamera dimatikan', 'warning');
  };
  
  // Ganti filteredList agar filter status bisa 'all', 'pending', atau 'stage2'
  const filteredList = pendingList.filter(resi => {
    const matchSearch =
      resi.resi.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resi.ecommerce.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resi.sub_toko.toLowerCase().includes(searchTerm.toLowerCase());
    const matchEcommerce = !searchEcommerce || resi.ecommerce === searchEcommerce;
    const matchToko = !searchToko || resi.sub_toko === searchToko;
    let matchStatus = true;
    if (statusFilter === 'pending') matchStatus = !resi.stage2_verified;
    if (statusFilter === 'stage2') matchStatus = !!resi.stage2_verified;
    // jika 'all', tampilkan semua
    return matchSearch && matchEcommerce && matchToko && matchStatus;
  });
  
  const pendingCount = pendingList.filter(r => !r.stage2_verified).length;
  
  const ecommerceOptions = Array.from(new Set(pendingList.map(r => r.ecommerce))).filter(Boolean);
  const tokoOptions = Array.from(new Set(pendingList.map(r => r.sub_toko))).filter(Boolean);
  
  const getEcommerceBadgeColor = (ecommerce: string) => {
    switch (ecommerce.toUpperCase()) {
      case 'SHOPEE': return 'bg-orange-600';
      case 'TIKTOK': return 'bg-blue-600';
      case 'KILAT': return 'bg-purple-600';
      case 'EKSPOR': return 'bg-green-600';
      default: return 'bg-gray-600';
    }
  };
  
  // Fallback UI jika error data
  if (dataError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-gray-100 p-4">
        <div className="max-w-lg w-full bg-gray-800 rounded-xl p-8 shadow-lg border border-gray-700 flex flex-col items-center">
          <AlertCircle size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Gagal memuat data</h2>
          <p className="text-gray-300 mb-4">{dataError}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold">Refresh Halaman</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {/* ...existing code... */}
    </div>
  );
};
