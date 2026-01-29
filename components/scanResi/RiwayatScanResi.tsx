// FILE: components/scanResi/RiwayatScanResi.tsx
// History view for all 3 stages of receipt scanning

import React, { useState, useEffect } from 'react';
import { useStore } from '../../context/StoreContext';
import { getResiHistory } from '../../services/resiScanService';
import { ResiScanStage, EcommercePlatform, ResiScanStatus, isInstantOrder } from '../../types';
import {
  History,
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  Circle,
  AlertCircle,
  Calendar,
  Package,
  ShoppingCart,
  ChevronRight,
  X,
  Check
} from 'lucide-react';

interface RiwayatScanResiProps {
  onRefresh?: () => void;
  refreshTrigger?: number;
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

export const RiwayatScanResi: React.FC<RiwayatScanResiProps> = ({ onRefresh, refreshTrigger }) => {
  const { selectedStore } = useStore();
  
  const [resiHistory, setResiHistory] = useState<ResiScanStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ResiScanStatus | 'all'>('all');
  const [ecommerceFilter, setEcommerceFilter] = useState<EcommercePlatform | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  
  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      setLoading(true);
      try {
        const filters: any = {};
        if (statusFilter !== 'all') filters.status = statusFilter;
        if (ecommerceFilter !== 'all') filters.ecommerce = ecommerceFilter;
        
        const data = await getResiHistory(selectedStore, filters);
        if (mounted) {
          setResiHistory(data);
        }
      } catch (err) {
        console.error('Load history error:', err);
        if (mounted) {
          showToast('Gagal memuat riwayat', 'error');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    
    loadData();
    
    return () => {
      mounted = false;
    };
  }, [selectedStore, statusFilter, ecommerceFilter, refreshTrigger]);
  
  const loadHistory = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (ecommerceFilter !== 'all') filters.ecommerce = ecommerceFilter;
      if (searchTerm) filters.search = searchTerm;
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;
      
      const data = await getResiHistory(selectedStore, filters);
      setResiHistory(data);
    } catch (err) {
      console.error('Load history error:', err);
      showToast('Gagal memuat riwayat', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSearch = () => {
    loadHistory();
  };
  
  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setEcommerceFilter('all');
    setDateFrom('');
    setDateTo('');
    loadHistory();
  };
  
  const getStatusBadge = (resi: ResiScanStage) => {
    if (resi.stage3_completed) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded-full font-semibold">
          <CheckCircle size={12} />
          Completed
        </span>
      );
    }
    if (resi.stage2_verified) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded-full font-semibold">
          <Circle size={12} />
          Stage 2
        </span>
      );
    }
    if (resi.stage1_scanned) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-yellow-600 text-white rounded-full font-semibold">
          <AlertCircle size={12} />
          Stage 1
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-gray-600 text-white rounded-full font-semibold">
        <Circle size={12} />
        Pending
      </span>
    );
  };
  
  const getStageProgressBar = (resi: ResiScanStage) => {
    const stages = [
      { name: 'Stage 1', completed: resi.stage1_scanned, date: resi.stage1_scanned_at, by: resi.stage1_scanned_by },
      { name: 'Stage 2', completed: resi.stage2_verified, date: resi.stage2_verified_at, by: resi.stage2_verified_by },
      { name: 'Stage 3', completed: resi.stage3_completed, date: resi.stage3_completed_at, by: null }
    ];
    
    return (
      <div className="flex items-center gap-2">
        {stages.map((stage, idx) => (
          <React.Fragment key={idx}>
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  stage.completed
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
                title={stage.date ? `${stage.name}\n${new Date(stage.date).toLocaleString('id-ID')}${stage.by ? `\nBy: ${stage.by}` : ''}` : stage.name}
              >
                {stage.completed ? <Check size={14} /> : idx + 1}
              </div>
              <span className="text-xs text-gray-400 mt-1 hidden sm:block">{stage.name}</span>
            </div>
            {idx < stages.length - 1 && (
              <div
                className={`flex-1 h-1 rounded ${
                  stage.completed && stages[idx + 1].completed
                    ? 'bg-green-600'
                    : stage.completed
                    ? 'bg-gradient-to-r from-green-600 to-gray-700'
                    : 'bg-gray-700'
                }`}
                style={{ minWidth: '40px' }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };
  
  const getEcommerceBadgeColor = (ecommerce: string) => {
    switch (ecommerce.toUpperCase()) {
      case 'SHOPEE': return 'bg-orange-600';
      case 'TIKTOK': return 'bg-blue-600';
      case 'KILAT': return 'bg-purple-600';
      case 'EKSPOR': return 'bg-green-600';
      case 'RESELLER': return 'bg-pink-600';
      default: return 'bg-gray-600';
    }
  };
  
  const filteredHistory = resiHistory;
  
  // Statistics
  const stats = {
    total: resiHistory.length,
    stage1: resiHistory.filter(r => r.stage1_scanned && !r.stage2_verified).length,
    stage2: resiHistory.filter(r => r.stage2_verified && !r.stage3_completed).length,
    completed: resiHistory.filter(r => r.stage3_completed).length
  };
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-xl">
              <History size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Riwayat Scan Resi</h1>
              <p className="text-sm text-gray-400">History dan tracking semua resi</p>
            </div>
          </div>
          <button
            onClick={loadHistory}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>
      
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Total Resi</p>
              <p className="text-3xl font-bold">{stats.total}</p>
            </div>
            <div className="p-3 bg-blue-600/20 rounded-xl">
              <Package size={24} className="text-blue-400" />
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Stage 1</p>
              <p className="text-3xl font-bold text-yellow-400">{stats.stage1}</p>
            </div>
            <div className="p-3 bg-yellow-600/20 rounded-xl">
              <AlertCircle size={24} className="text-yellow-400" />
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Stage 2</p>
              <p className="text-3xl font-bold text-blue-400">{stats.stage2}</p>
            </div>
            <div className="p-3 bg-blue-600/20 rounded-xl">
              <Circle size={24} className="text-blue-400" />
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Completed</p>
              <p className="text-3xl font-bold text-green-400">{stats.completed}</p>
            </div>
            <div className="p-3 bg-green-600/20 rounded-xl">
              <CheckCircle size={24} className="text-green-400" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6 shadow-lg border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Filter size={20} />
            Filter & Pencarian
          </h2>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            {showFilters ? 'Sembunyikan' : 'Tampilkan'}
          </button>
        </div>
        
        {showFilters && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ResiScanStatus | 'all')}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Semua Status</option>
                  <option value="pending">Pending</option>
                  <option value="stage1">Stage 1</option>
                  <option value="stage2">Stage 2</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              
              {/* E-commerce Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">E-commerce</label>
                <select
                  value={ecommerceFilter}
                  onChange={(e) => setEcommerceFilter(e.target.value as EcommercePlatform | 'all')}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Semua Platform</option>
                  <option value="SHOPEE">Shopee</option>
                  <option value="TIKTOK">TikTok</option>
                  <option value="KILAT">Kilat</option>
                  <option value="RESELLER">Reseller</option>
                  <option value="EKSPOR">Ekspor</option>
                </select>
              </div>
              
              {/* Date From */}
              <div>
                <label className="block text-sm font-medium mb-2">Dari Tanggal</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {/* Date To */}
              <div>
                <label className="block text-sm font-medium mb-2">Sampai Tanggal</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            {/* Search */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Cari resi atau customer..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
              >
                Cari
              </button>
              <button
                onClick={resetFilters}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* History Table */}
      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Riwayat Resi</h2>
            <div className="text-sm text-gray-400">
              Menampilkan: <span className="font-semibold text-blue-400">{filteredHistory.length}</span> resi
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Tanggal</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Resi</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">E-commerce</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Toko</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Customer</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Progress</th>
                <th className="px-4 py-3 text-center text-sm font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading && resiHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                    Memuat data...
                  </td>
                </tr>
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    <Package size={48} className="mx-auto mb-2 opacity-50" />
                    Tidak ada riwayat yang ditemukan
                  </td>
                </tr>
              ) : (
                filteredHistory.map((resi) => (
                  <tr key={resi.id} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      {new Date(resi.created_at).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-blue-400">
                      {resi.resi}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 ${getEcommerceBadgeColor(resi.ecommerce)} rounded text-xs font-semibold`}>
                        {resi.ecommerce}
                        {resi.negara_ekspor && !resi.ecommerce.includes(resi.negara_ekspor) && ` - ${resi.negara_ekspor}`}
                        {isInstantOrder(resi) && (
                          <span className="ml-1 px-1 py-0.5 bg-orange-500 text-white text-[9px] font-bold rounded">
                            INSTANT
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-semibold">
                        {resi.sub_toko}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {resi.customer || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-[250px]">
                        {getStageProgressBar(resi)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(resi)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
