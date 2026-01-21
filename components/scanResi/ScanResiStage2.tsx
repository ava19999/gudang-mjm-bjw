// FILE: components/scanResi/ScanResiStage2.tsx
// Stage 2: Packing Verification - Camera barcode scanner
// Updated: Custom TTS "Ini sudah di scan tolol" for double scan

import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../context/StoreContext';
import {
  verifyResiStage2,
  verifyResiStage2Bulk,
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
  Check,
  List,
  Save,
  AlertTriangle,
  Trash2,
  Plus
} from 'lucide-react';

// Import audio file untuk notifikasi duplikat
import duplicateAudioFile from './sudah di scan.mp3';

// --- AUDIO ASSETS (Base64) ---
// Nada 'Ting' (Sukses)
const AUDIO_SUCCESS = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OmfTgwOUKnk875qHgU7k9X0y3ksBS2Ax/DagjEIF2Kz6OyrUQ8IRp/g8r5sIAUsgs/y2Yg2CBxqvfDpn04MDlCq5PS+aiEGPJLU9Mt5LAUugcbw2oM';

// Nada 'Buzz/Low' (Error fallback jika TTS gagal)
const AUDIO_ERROR = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAIA+AAABAAgAZGF0YQAAAAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAf3hxeHCAgIB/cnVygICAf3J1coCAgH9ydXKAgIB/cnVygICAf3J1coCAgH9ydXKAgIB/cnVygICAf3J1coCAgH9ydXKAgIB/cnVygICAf3J1coCAgH9ydXKAgIB/cnVygICAf3J1coCAgH9ydXKAgIB/cnVygICAgIA=';

function CameraError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-4 text-center">
      <span className="text-red-400 text-lg font-bold mb-2">Gagal memuat kamera</span>
      <span className="text-red-300 text-sm mb-2">
        {error.includes('removeChild')
          ? 'Konflik DOM terdeteksi. Silakan refresh halaman.'
          : (error || 'Terjadi error saat mengaktifkan kamera.')}
      </span>
      <button 
        onClick={() => window.location.reload()}
        className="mt-2 px-4 py-2 bg-red-600/50 hover:bg-red-600 rounded text-xs text-white"
      >
        Refresh Halaman
      </button>
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
  const [showAllStage1, setShowAllStage1] = useState(true);
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchEcommerce, setSearchEcommerce] = useState('');
  const [searchToko, setSearchToko] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [lastScannedResi, setLastScannedResi] = useState<string | null>(null);
  const [scanningEnabled, setScanningEnabled] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [manualResi, setManualResi] = useState('');
  
  // Bulk Verify States
  const [showBulkVerifyModal, setShowBulkVerifyModal] = useState(false);
  const [bulkResiList, setBulkResiList] = useState<Array<{ id: string; resi: string; isDuplicate: boolean }>>([
    { id: '1', resi: '', isDuplicate: false }
  ]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bulkInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  
  const scannerRef = useRef<HTMLDivElement>(null);
  const scanCooldownRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // -- HELPER: Play Sound (Beep) --
  const playBeep = (type: 'success' | 'error') => {
    try {
      const audioSource = type === 'success' ? AUDIO_SUCCESS : AUDIO_ERROR;
      const audio = new Audio(audioSource);
      audio.volume = 1.0;
      audio.play().catch(e => console.error("Audio playback failed", e));
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  // -- HELPER: Text to Speech (Suara Ngomong) --
  const speakMessage = (message: string) => {
    if ('speechSynthesis' in window) {
      // Hentikan suara sebelumnya jika ada
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'id-ID'; // Bahasa Indonesia
      utterance.rate = 0.9;     // Kecepatan bicara (1.0 normal, 0.9 agak lambat biar jelas)
      utterance.pitch = 1.0;    // Nada suara
      utterance.volume = 1.0;   // Volume maksimal

      // Coba cari voice Indonesia spesifik (opsional)
      const voices = window.speechSynthesis.getVoices();
      const indoVoice = voices.find(v => v.lang.includes('id') || v.lang.includes('ID'));
      if (indoVoice) utterance.voice = indoVoice;

      window.speechSynthesis.speak(utterance);
    } else {
      // Fallback jika browser tidak support TTS
      playBeep('error');
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualResi.trim()) {
      showToast('Nomor resi tidak boleh kosong!', 'error');
      playBeep('error');
      return;
    }
    await verifyResi(manualResi.trim());
    setManualResi('');
  };

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
        if (mounted) setPendingList(data);
      } catch (e: any) {
        setCameraError('Gagal memuat data resi.');
      }
      setLoading(false);
    };
    load();
    return () => {
      mounted = false;
      cleanupScanner();
      if (scanCooldownRef.current) clearTimeout(scanCooldownRef.current);
      window.speechSynthesis.cancel(); // Stop bicara saat pindah halaman
    };
  }, [selectedStore, showAllStage1]);
  
  const loadPendingList = async () => {
    setLoading(true);
    const data = await getPendingStage2List(selectedStore);
    setPendingList(data);
    setLoading(false);
  };
  
  const handleScanSuccess = async (decodedText: string) => {
    // 1. Jika masih cooldown, abaikan
    if (!scanningEnabled) return;

    // 2. CEK DOUBLE SCAN
    if (decodedText === lastScannedResi) {
      // Mainkan audio custom "sudah di scan.mp3"
      try {
        const audio = new Audio(duplicateAudioFile);
        audio.volume = 1.0;
        audio.play().catch((e) => console.error('Audio play failed:', e));
      } catch (e) {
        console.error('Audio error:', e);
        playBeep('error');
      }
      showToast('Resi sudah discan barusan!', 'warning');
      return;
    }
    
    // 3. Scan Baru yang Valid
    setLastScannedResi(decodedText);
    setScanningEnabled(false);
    
    // Play sound "Ting" (Sukses Scan)
    playBeep('success');
    
    // Proses verifikasi ke database
    await verifyResi(decodedText);
    
    // Cooldown
    if (scanCooldownRef.current) {
      clearTimeout(scanCooldownRef.current);
    }
    scanCooldownRef.current = setTimeout(() => {
      setScanningEnabled(true);
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
      setLoading(true);
      let data: ResiScanStage[] = [];
      if (statusFilter === 'pending') {
        data = await getPendingStage2List(selectedStore);
      } else {
        data = await getResiStage1List(selectedStore);
      }
      setPendingList(data);
      setLoading(false);
      if (onRefresh) onRefresh();
    } else {
      // Jika error dari server (misal resi tidak ditemukan atau sudah diverifikasi)
      // Mainkan audio duplikat
      try {
        const audio = new Audio(duplicateAudioFile);
        audio.volume = 1.0;
        audio.play().catch((e) => console.error('Audio play failed:', e));
      } catch (e) {
        console.error('Audio error:', e);
        playBeep('error');
      }
      showToast(result.message, 'error');
    }
  };

  // ============================================================================
  // BULK VERIFY FUNCTIONS
  // ============================================================================
  
  const checkBulkDuplicates = (list: typeof bulkResiList) => {
    const seen = new Set<string>();
    return list.map(item => {
      const resiClean = item.resi.trim().toUpperCase();
      if (!resiClean) return { ...item, isDuplicate: false };
      
      const isDupe = seen.has(resiClean);
      seen.add(resiClean);
      return { ...item, isDuplicate: isDupe };
    });
  };

  const handleBulkResiChange = (id: string, value: string) => {
    setBulkResiList(prev => {
      const updated = prev.map(item => 
        item.id === id ? { ...item, resi: value } : item
      );
      return checkBulkDuplicates(updated);
    });
  };

  const handleBulkResiKeyDown = (e: React.KeyboardEvent, id: string, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentResi = bulkResiList.find(r => r.id === id)?.resi.trim();
      
      if (currentResi && index === bulkResiList.length - 1) {
        const newId = Date.now().toString();
        setBulkResiList(prev => [...prev, { id: newId, resi: '', isDuplicate: false }]);
        setTimeout(() => {
          bulkInputRefs.current[newId]?.focus();
        }, 50);
      } else if (index < bulkResiList.length - 1) {
        const nextId = bulkResiList[index + 1].id;
        bulkInputRefs.current[nextId]?.focus();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (index < bulkResiList.length - 1) {
        const nextId = bulkResiList[index + 1].id;
        bulkInputRefs.current[nextId]?.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index > 0) {
        const prevId = bulkResiList[index - 1].id;
        bulkInputRefs.current[prevId]?.focus();
      }
    }
  };

  const handleAddBulkRow = () => {
    const newId = Date.now().toString();
    setBulkResiList(prev => [...prev, { id: newId, resi: '', isDuplicate: false }]);
    setTimeout(() => {
      bulkInputRefs.current[newId]?.focus();
    }, 50);
  };

  const handleRemoveBulkRow = (id: string) => {
    if (bulkResiList.length <= 1) return;
    setBulkResiList(prev => {
      const filtered = prev.filter(item => item.id !== id);
      return checkBulkDuplicates(filtered);
    });
  };

  const handleClearBulkList = () => {
    setBulkResiList([{ id: '1', resi: '', isDuplicate: false }]);
  };

  const handlePasteFromExcel = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    
    const lines = pastedText
      .split(/[\r\n\t]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (lines.length === 0) return;
    
    const newResiList = lines.map((resi, index) => ({
      id: `paste-${Date.now()}-${index}`,
      resi: resi,
      isDuplicate: false
    }));
    
    setBulkResiList(prev => {
      const existingNonEmpty = prev.filter(r => r.resi.trim());
      const merged = [...existingNonEmpty, ...newResiList];
      return checkBulkDuplicates(merged);
    });
    
    showToast(`${lines.length} resi berhasil di-paste dari Excel`);
  };

  const handleBulkInputPaste = (e: React.ClipboardEvent<HTMLInputElement>, id: string) => {
    const pastedText = e.clipboardData.getData('text');
    
    if (pastedText.includes('\n') || pastedText.includes('\r') || pastedText.includes('\t')) {
      e.preventDefault();
      
      const lines = pastedText
        .split(/[\r\n\t]+/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      if (lines.length > 1) {
        const newResiList = lines.map((resi, index) => ({
          id: `paste-${Date.now()}-${index}`,
          resi: resi,
          isDuplicate: false
        }));
        
        setBulkResiList(prev => {
          const currentIndex = prev.findIndex(r => r.id === id);
          const before = prev.slice(0, currentIndex).filter(r => r.resi.trim());
          const after = prev.slice(currentIndex + 1).filter(r => r.resi.trim());
          const merged = [...before, ...newResiList, ...after];
          return checkBulkDuplicates(merged);
        });
        
        showToast(`${lines.length} resi berhasil di-paste`);
        return;
      }
    }
  };

  const handleSaveBulkVerify = async () => {
    const validResis = bulkResiList.filter(r => r.resi.trim() && !r.isDuplicate).map(r => r.resi.trim());
    
    if (validResis.length === 0) {
      showToast('Tidak ada resi valid untuk diverifikasi!', 'error');
      return;
    }

    setBulkSaving(true);

    const result = await verifyResiStage2Bulk(validResis, userName || 'Admin', selectedStore);

    if (result.success) {
      showToast(result.message);
      
      // Reload list
      setLoading(true);
      let data: ResiScanStage[] = [];
      if (showAllStage1) {
        data = await getResiStage1List(selectedStore);
      } else {
        data = await getPendingStage2List(selectedStore);
      }
      setPendingList(data);
      setLoading(false);
      
      if (onRefresh) onRefresh();
      
      // Reset bulk list
      setBulkResiList([{ id: '1', resi: '', isDuplicate: false }]);
      setShowBulkVerifyModal(false);
    } else {
      showToast(result.message, 'error');
    }

    setBulkSaving(false);
  };

  const validBulkCount = bulkResiList.filter(r => r.resi.trim() && !r.isDuplicate).length;
  const duplicateBulkCount = bulkResiList.filter(r => r.isDuplicate).length;

  const startCamera = async () => {
    setCameraError(null);
    setCameraInitialized(false);
    
    const scannerElement = document.getElementById('scanner-region');
    if (!scannerElement) {
      setCameraError('Komponen scanner belum siap. Silakan coba lagi.');
      return;
    }

    try {
      const permission = await requestCameraPermission();
      if (!permission.success) throw new Error(permission.message);
      
      const result = await initCamera(
        'scanner-region',
        handleScanSuccess,
        (err) => {},
        { fps: 10, qrbox: { width: 320, height: 160 }, aspectRatio: 2.0 }
      );
      
      if (!result.success) throw new Error(result.message);
      
      setCameraActive(true);
      setCameraInitialized(true);
      showToast('Kamera aktif', 'success');
      
      // Load voices di awal agar siap pakai
      if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
      }
    } catch (err: any) {
      console.error(err);
      setCameraError(err?.message || 'Terjadi error saat mengaktifkan kamera.');
      setCameraActive(false);
      setCameraInitialized(false);
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkVerifyModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors font-semibold"
            >
              <List size={16} />
              Verifikasi Masal
            </button>
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
      </div>
      
      {/* Camera Scanner + Input Manual */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6 shadow-lg border border-gray-700">
        <form onSubmit={handleManualSubmit} className="flex flex-col md:flex-row gap-2 mb-4">
          <input
            type="text"
            value={manualResi}
            onChange={e => setManualResi(e.target.value)}
            placeholder="Input manual nomor resi..."
            className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-mono"
            autoComplete="off"
          />
          <button
            type="submit"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-lg flex items-center gap-2 disabled:bg-gray-700 disabled:cursor-not-allowed"
            disabled={loading || !manualResi.trim()}
          >
            <Check size={20} />
            Verifikasi
          </button>
        </form>

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
        
        {/* SAFE SCANNER REGION */}
        <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ minHeight: '300px' }}>
          <div id="scanner-region" ref={scannerRef} className="w-full h-full"/>

          {!cameraActive && !cameraError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-800">
              <Camera size={64} className="text-gray-600 mb-4" />
              <p className="text-gray-400 text-center font-medium">Klik tombol "Aktifkan Kamera" di atas</p>
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-0 z-20 bg-gray-800">
               <CameraError error={cameraError} />
            </div>
          )}

          {cameraActive && !cameraError && (
            <div className="absolute top-4 right-4 z-30 px-3 py-2 bg-green-600 rounded-lg flex items-center gap-2 text-sm font-semibold shadow-lg">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              Scanning Active
            </div>
          )}

          {lastScannedResi && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-30 px-4 py-2 bg-blue-600 rounded-lg text-sm font-semibold shadow-lg">
              Scanned: {lastScannedResi}
            </div>
          )}
        </div>
        
        <div className="mt-4 p-4 bg-gray-700/50 rounded-lg">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertCircle size={16} />
            Petunjuk Penggunaan:
          </h3>
          <ul className="text-sm text-gray-300 space-y-1 ml-6 list-disc">
            <li>Pastikan izin kamera sudah diberikan</li>
            <li>Suara "Ting": Scan berhasil masuk</li>
            <li>Suara Bicara: "Ini sudah di scan...": Scan double (duplikat)</li>
          </ul>
        </div>
      </div>
      
      {/* Pending List Table */}
      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Package size={20} />
              Menunggu Verifikasi
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400 mb-1">Total:</span>
              <span className="px-3 py-1 bg-yellow-600 rounded-full text-sm font-semibold">
                {filteredList.length}
              </span>
            </div>
          </div>
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row gap-2 mb-2">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari resi, e-commerce, atau toko..."
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <input
              type="text"
              list="ecommerce-filter-list"
              value={searchEcommerce}
              onChange={e => setSearchEcommerce(e.target.value)}
              placeholder="Filter E-commerce"
              className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[120px]"
            />
            <datalist id="ecommerce-filter-list">
              {ecommerceOptions.map(opt => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
            <input
              type="text"
              list="toko-filter-list"
              value={searchToko}
              onChange={e => setSearchToko(e.target.value)}
              placeholder="Filter Toko"
              className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[120px]"
            />
            <datalist id="toko-filter-list">
              {tokoOptions.map(opt => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[120px]"
            >
              <option value="pending">Pending</option>
              <option value="stage2">Stage 2 (Checked)</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
        
        {/* Table Content */}
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
                  </td>
                </tr>
              ) : (
                filteredList.map((resi) => (
                  <tr key={resi.id} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      {new Date(resi.stage1_scanned_at || resi.created_at).toLocaleDateString('id-ID', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
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
                      {resi.stage2_verified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
                          <CheckCircle size={12} /> Stage 2
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-yellow-600 text-white rounded-full">
                          <AlertCircle size={12} /> Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Verify Modal (Verifikasi Masal) */}
      {showBulkVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-xl max-w-3xl w-full border border-gray-700 shadow-2xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <List size={24} className="text-purple-400" />
                Verifikasi Masal - Input Banyak Resi
              </h3>
              <button
                onClick={() => setShowBulkVerifyModal(false)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Paste from Excel Area */}
            <div className="px-4 py-3 border-b border-gray-700 bg-blue-900/20 flex-shrink-0">
              <label className="block text-sm font-medium mb-2 text-blue-300">📋 Paste dari Excel</label>
              <textarea
                onPaste={handlePasteFromExcel}
                placeholder="Klik di sini lalu Ctrl+V untuk paste banyak resi dari Excel..."
                className="w-full px-3 py-2 bg-gray-700 border border-blue-600/50 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={2}
              />
              <p className="text-[10px] text-gray-500 mt-1">Copy kolom resi dari Excel, lalu paste di sini. Setiap baris akan menjadi 1 resi.</p>
            </div>

            {/* Table Header */}
            <div className="px-4 py-2 bg-gray-700/50 border-b border-gray-600 flex items-center gap-4 text-sm font-medium text-gray-300 flex-shrink-0">
              <div className="w-12 text-center">#</div>
              <div className="flex-1">Nomor Resi</div>
              <div className="w-24 text-center">Status</div>
              <div className="w-16 text-center">Aksi</div>
            </div>

            {/* Scrollable Table Body */}
            <div className="flex-1 overflow-auto p-2">
              {bulkResiList.map((item, index) => (
                <div 
                  key={item.id} 
                  className={`flex items-center gap-4 px-2 py-1.5 rounded ${
                    item.isDuplicate ? 'bg-red-900/30' : 'hover:bg-gray-700/30'
                  }`}
                >
                  <div className="w-12 text-center text-sm text-gray-400 font-mono">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <input
                      ref={(el) => { bulkInputRefs.current[item.id] = el; }}
                      type="text"
                      value={item.resi}
                      onChange={(e) => handleBulkResiChange(item.id, e.target.value)}
                      onKeyDown={(e) => handleBulkResiKeyDown(e, item.id, index)}
                      onPaste={(e) => handleBulkInputPaste(e, item.id)}
                      placeholder="Scan atau ketik resi (bisa paste dari Excel)..."
                      className={`w-full px-3 py-2 bg-gray-700 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                        item.isDuplicate ? 'border-red-500 text-red-300' : 'border-gray-600'
                      }`}
                      autoFocus={index === 0}
                    />
                  </div>
                  <div className="w-24 text-center">
                    {item.isDuplicate ? (
                      <span className="px-2 py-1 bg-red-600/30 text-red-300 rounded text-xs flex items-center gap-1 justify-center">
                        <AlertTriangle size={12} /> Double
                      </span>
                    ) : item.resi.trim() ? (
                      <span className="px-2 py-1 bg-green-600/30 text-green-300 rounded text-xs flex items-center gap-1 justify-center">
                        <Check size={12} /> OK
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs">-</span>
                    )}
                  </div>
                  <div className="w-16 text-center">
                    <button
                      onClick={() => handleRemoveBulkRow(item.id)}
                      disabled={bulkResiList.length <= 1}
                      className="p-1.5 text-red-400 hover:bg-red-600/20 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">
                    Total: <span className="font-semibold text-white">{bulkResiList.filter(r => r.resi.trim()).length}</span>
                  </span>
                  <span className="text-green-400">
                    Valid: <span className="font-semibold">{validBulkCount}</span>
                  </span>
                  {duplicateBulkCount > 0 && (
                    <span className="text-red-400">
                      Duplikat: <span className="font-semibold">{duplicateBulkCount}</span>
                    </span>
                  )}
                </div>
                <button
                  onClick={handleAddBulkRow}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
                >
                  <Plus size={14} />
                  Tambah Baris
                </button>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={handleClearBulkList}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
                >
                  Bersihkan
                </button>
                <button
                  onClick={() => setShowBulkVerifyModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveBulkVerify}
                  disabled={bulkSaving || validBulkCount === 0}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {bulkSaving ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Memverifikasi...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Verifikasi {validBulkCount} Resi
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};