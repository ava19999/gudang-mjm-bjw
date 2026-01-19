// FILE: components/scanResi/ScanResiStage1.tsx
// Stage 1: Scanner Gudang - Scan receipts with physical barcode scanner

import React, { useState, useEffect, useRef } from 'react';
// Komponen dropdown suggestion custom untuk sub toko reseller
const SubTokoResellerDropdown = ({ value, onChange, suggestions }: { value: string, onChange: (v: string) => void, suggestions: string[] }) => {
  const [show, setShow] = useState(false);
  const [input, setInput] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = suggestions.filter(s => s.toLowerCase().includes(input.toLowerCase()) && s !== input);

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={input}
        onChange={e => { setInput(e.target.value); onChange(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)}
        placeholder="Nama toko reseller (manual/dropdown)"
        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        autoComplete="off"
      />
      {show && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-auto animate-in fade-in slide-in-from-top-2">
          {filtered.map((s, i) => (
            <div
              key={s}
              className="px-4 py-2 cursor-pointer hover:bg-purple-600 hover:text-white transition-colors text-sm"
              onMouseDown={() => { onChange(s); setInput(s); setShow(false); }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
import { useStore } from '../../context/StoreContext';
import { 
  scanResiStage1, 
  deleteResiStage1, 
  getResiStage1List,
  getResellers,
  addReseller
} from '../../services/resiScanService';
import { 
  ResiScanStage, 
  EcommercePlatform, 
  SubToko, 
  NegaraEkspor 
} from '../../types';
import { 
  Package, 
  Scan, 
  Trash2, 
  RefreshCw, 
  Plus,
  X,
  Check,
  ShoppingCart,
  User
} from 'lucide-react';

interface ScanResiStage1Props {
  onRefresh?: () => void;
}

const Toast = ({ message, type, onClose }: any) => (
  <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-xl flex items-center gap-2 text-white text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${
    type === 'success' ? 'bg-green-600' : 'bg-red-600'
  }`}>
    {type === 'success' ? <Check size={16} /> : <X size={16} />}
    {message}
    <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
      <X size={14}/>
    </button>
  </div>
);

export const ScanResiStage1: React.FC<ScanResiStage1Props> = ({ onRefresh }) => {
  const { selectedStore, userName } = useStore();
  
  // State untuk scanning
  const [ecommerce, setEcommerce] = useState<EcommercePlatform>('SHOPEE');
  const [subToko, setSubToko] = useState<SubToko>('MJM');
  const [negaraEkspor, setNegaraEkspor] = useState<NegaraEkspor>('PH');
  const [resiInput, setResiInput] = useState('');
  const [selectedReseller, setSelectedReseller] = useState('');
  const [loading, setLoading] = useState(false);
  const [resiList, setResiList] = useState<ResiScanStage[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchEcommerce, setSearchEcommerce] = useState('');
  const [searchToko, setSearchToko] = useState('');

  // Ambil unique e-commerce dan toko dari data
  const ecommerceOptions = Array.from(new Set(resiList.map(r => r.ecommerce))).filter(Boolean);
  const tokoOptions = Array.from(new Set(resiList.map(r => r.sub_toko))).filter(Boolean);
  
  // State untuk Reseller
  const [showResellerForm, setShowResellerForm] = useState(false);
  const [resellers, setResellers] = useState<any[]>([]);
  // Untuk subToko suggestion dari data resi yang sudah pernah diinput
  const resellerTokoList: string[] = Array.from(new Set(resiList.filter(r => r.ecommerce === 'RESELLER').map(r => r.sub_toko)))
    .filter(Boolean)
    .map(String);
  const [newResellerName, setNewResellerName] = useState('');
  
  const resiInputRef = useRef<HTMLInputElement>(null);
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  
  // Load data on mount
  useEffect(() => {
    loadResiList();
    loadResellers();
  }, [selectedStore]);
  
  // Auto focus on resi input
  useEffect(() => {
    if (resiInputRef.current && !showResellerForm) {
      resiInputRef.current.focus();
    }
  }, [showResellerForm]);
  
  const loadResiList = async () => {
    setLoading(true);
    const data = await getResiStage1List(selectedStore);
    setResiList(data);
    setLoading(false);
  };
  
  const loadResellers = async () => {
    const data = await getResellers();
    setResellers(data);
  };
  
  const handleScanResi = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resiInput.trim()) {
      showToast('Resi tidak boleh kosong!', 'error');
      return;
    }
    
    setLoading(true);
    
    const now = new Date().toISOString(); // atau gunakan format sesuai kebutuhan

    const payload = {
      resi: resiInput.trim(),
      ecommerce,
      sub_toko: subToko,
      negara_ekspor: ecommerce === 'EKSPOR' ? negaraEkspor : undefined,
      scanned_by: userName || 'Admin',
      tanggal: now,
      reseller: selectedReseller || null,
    };
    
    const result = await scanResiStage1(payload, selectedStore);
    
    if (result.success) {
      showToast('Resi berhasil di-scan!');
      setResiInput('');
      await loadResiList();
      if (onRefresh) onRefresh();
      // Scroll/focus ke input resi agar siap scan berikutnya
      setTimeout(() => {
        if (resiInputRef.current) {
          resiInputRef.current.focus();
          resiInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } else {
      showToast(result.message, 'error');
      setResiInput(''); // KOSONGKAN INPUT JIKA DOUBLE/ERROR
      // Mainkan audio sudah di scan.mp3 jika error/double
      try {
        const audio = new Audio(require('./sudah di scan.mp3'));
        audio.volume = 1.0;
        audio.play().catch(() => {});
      } catch {}
      // Tetap fokus ke input jika error
      setTimeout(() => {
        if (resiInputRef.current) {
          resiInputRef.current.focus();
          resiInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
    setLoading(false);
  };
  
  const handleDeleteResi = async (resiId: string) => {
    if (!confirm('Yakin ingin menghapus resi ini?')) return;
    
    setLoading(true);
    const result = await deleteResiStage1(resiId, selectedStore);
    
    if (result.success) {
      showToast('Resi berhasil dihapus');
      await loadResiList();
      if (onRefresh) onRefresh();
    } else {
      showToast(result.message, 'error');
    }
    
    setLoading(false);
  };
  
  const handleAddReseller = async () => {
    if (!newResellerName.trim()) {
      showToast('Nama reseller tidak boleh kosong!', 'error');
      return;
    }
    
    const result = await addReseller(newResellerName.trim());
    
    if (result.success) {
      showToast('Reseller berhasil ditambahkan');
      setNewResellerName('');
      await loadResellers();
    } else {
      showToast(result.message, 'error');
    }
  };
  
  const filteredResiList = resiList.filter(resi => {
    const matchSearch =
      resi.resi.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resi.ecommerce.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resi.sub_toko.toLowerCase().includes(searchTerm.toLowerCase());
    const matchEcommerce = !searchEcommerce || resi.ecommerce === searchEcommerce;
    const matchToko = !searchToko || resi.sub_toko === searchToko;
    return matchSearch && matchEcommerce && matchToko;
  });
  
  const getStatusBadge = (resi: ResiScanStage) => {
    if (resi.stage3_completed) {
      return <span className="px-2 py-1 text-xs bg-green-600 text-white rounded-full">Selesai</span>;
    }
    if (resi.stage2_verified) {
      return <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded-full">Stage 2</span>;
    }
    if (resi.stage1_scanned) {
      return <span className="px-2 py-1 text-xs bg-yellow-600 text-white rounded-full">Stage 1</span>;
    }
    return <span className="px-2 py-1 text-xs bg-gray-600 text-white rounded-full">Pending</span>;
  };
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-xl">
              <Scan size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Stage 1: Scanner Gudang</h1>
              <p className="text-sm text-gray-400">Scan resi dengan barcode scanner</p>
            </div>
          </div>
          <button
            onClick={loadResiList}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>
      
      {/* Scan Form */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6 shadow-lg border border-gray-700">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Package size={20} />
          Scan Resi Baru
        </h2>
        
        <form onSubmit={handleScanResi} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* E-commerce Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">E-commerce</label>
              <select
                value={ecommerce}
                onChange={(e) => setEcommerce(e.target.value as EcommercePlatform)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="SHOPEE">Shopee</option>
                <option value="TIKTOK">TikTok</option>
                <option value="KILAT">Kilat</option>
                <option value="RESELLER">Reseller</option>
                <option value="EKSPOR">Ekspor</option>
              </select>
            </div>
            {/* Sub Toko: jika RESELLER, input manual + dropdown suggestion, jika bukan, dropdown biasa */}
            <div>
              <label className="block text-sm font-medium mb-2">Sub Toko</label>
              {ecommerce === 'RESELLER' ? (
                <SubTokoResellerDropdown
                  value={subToko}
                  onChange={setSubToko}
                  suggestions={resellerTokoList}
                />
              ) : (
                <select
                  value={subToko}
                  onChange={(e) => setSubToko(e.target.value as SubToko)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="MJM">MJM</option>
                  <option value="BJW">BJW</option>
                  <option value="LARIS">LARIS</option>
                </select>
              )}
            </div>
            {/* Negara Ekspor (shown only for EKSPOR) */}
            {ecommerce === 'EKSPOR' && (
              <div>
                <label className="block text-sm font-medium mb-2">Negara</label>
                <select
                  value={negaraEkspor}
                  onChange={(e) => setNegaraEkspor(e.target.value as NegaraEkspor)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="PH">Philippines (PH)</option>
                  <option value="MY">Malaysia (MY)</option>
                  <option value="SG">Singapore (SG)</option>
                  <option value="HK">Hong Kong (HK)</option>
                </select>
              </div>
            )}
            {/* Input reseller hanya jika ecommerce RESELLER */}
            {ecommerce === 'RESELLER' && (
              <div>
                <label className="block text-sm font-medium mb-2">Reseller</label>
                <input
                  type="text"
                  value={selectedReseller}
                  onChange={e => setSelectedReseller(e.target.value)}
                  placeholder="Nama reseller (opsional)"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            )}
          </div>
          
          {/* Resi Input: selalu tampil, baik reseller maupun non-reseller */}
          <div>
            <label className="block text-sm font-medium mb-2">Nomor Resi</label>
            <div className="flex gap-2">
              <input
                ref={resiInputRef}
                type="text"
                value={resiInput}
                onChange={(e) => setResiInput(e.target.value)}
                placeholder="Scan atau ketik nomor resi..."
                className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-mono"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !resiInput.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <Scan size={20} />
                Scan
              </button>
            </div>
          </div>
        </form>
      </div>
      
      {/* Resi List */}
      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Daftar Resi Stage 1</h2>
            <div className="text-sm text-gray-400">
              Total: <span className="font-semibold text-blue-400">{filteredResiList.length}</span>
            </div>
          </div>
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row gap-2 mb-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari resi, e-commerce, atau toko..."
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex gap-2">
              <input
                type="text"
                list="ecommerce-filter-list"
                value={searchEcommerce}
                onChange={e => setSearchEcommerce(e.target.value)}
                placeholder="Filter E-commerce"
                className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[140px]"
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
                className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[140px]"
              />
              <datalist id="toko-filter-list">
                {tokoOptions.map(opt => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
        
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Tanggal</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Resi</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">E-commerce</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Toko</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Di-scan oleh</th>
                <th className="px-4 py-3 text-center text-sm font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading && resiList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                    Memuat data...
                  </td>
                </tr>
              ) : filteredResiList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Belum ada resi yang di-scan
                  </td>
                </tr>
              ) : (
                filteredResiList.map((resi) => (
                  <tr key={resi.id} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      {new Date(resi.tanggal).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-blue-400">
                      {resi.resi}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-gray-700 rounded text-xs">
                        {resi.ecommerce}
                        {resi.negara_ekspor && ` - ${resi.negara_ekspor}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-semibold">
                        {resi.sub_toko}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getStatusBadge(resi)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {resi.stage1_scanned_by || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteResi(resi.id)}
                        disabled={resi.stage2_verified || resi.stage3_completed}
                        className="p-2 text-red-400 hover:bg-red-600/20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={resi.stage2_verified || resi.stage3_completed ? 'Tidak bisa dihapus (sudah diproses)' : 'Hapus'}
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
      
      {/* Reseller Form Modal */}
      {showResellerForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-2xl w-full border border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <User size={24} />
                Input Order Reseller
              </h3>
              <button
                onClick={() => setShowResellerForm(false)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Fitur ini akan menginput order langsung ke barang keluar tanpa melalui stage 2 & 3.
              </p>
              
              {/* Add Reseller */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newResellerName}
                  onChange={(e) => setNewResellerName(e.target.value)}
                  placeholder="Nama reseller baru..."
                  className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddReseller}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors flex items-center gap-2"
                >
                  <Plus size={16} />
                  Tambah
                </button>
              </div>
              
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
                <button
                  onClick={() => setShowResellerForm(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
