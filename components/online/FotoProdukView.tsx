// FILE: components/online/FotoProdukView.tsx
import React, { useState, useEffect } from 'react';
import { Camera, Search, ChevronLeft, ChevronRight, Image, Loader2, RefreshCw, Upload, Download, Link2, Database } from 'lucide-react';
import { fetchFotoProduk, FotoProdukRow } from '../../services/supabaseService';
import { FotoUploadModal } from './FotoUploadModal';
import { FotoLinkManager } from './FotoLinkManager';

type TabType = 'foto' | 'foto_link';

export const FotoProdukView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('foto_link');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FotoProdukRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  
  const itemsPerPage = 50;
  
  // Load data saat pertama kali atau saat refresh - hanya untuk tab foto
  const loadData = async (searchTerm?: string) => {
    if (activeTab !== 'foto') return; // Skip loading if not on foto tab
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFotoProduk(searchTerm);
      setData(result || []);
    } catch (err: any) {
      console.error('Error loading foto produk:', err);
      setError(err?.message || 'Gagal memuat data foto produk');
      setData([]);
    } finally {
      setLoading(false);
    }
  };
  
  // Load data when tab changes to foto
  useEffect(() => {
    if (activeTab === 'foto') {
      loadData();
    }
  }, [activeTab]);
  
  // Debounce search - only for foto tab
  useEffect(() => {
    if (activeTab !== 'foto') return;
    const timer = setTimeout(() => {
      loadData(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, activeTab]);
  
  const totalPages = Math.ceil((data?.length || 0) / itemsPerPage) || 1;
  
  // Paginate data
  const paginatedData = (data || []).slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  // Render thumbnail foto
  const renderThumbnail = (url?: string) => {
    if (!url) {
      return (
        <div className="w-10 h-10 bg-gray-700 rounded flex items-center justify-center">
          <Image size={14} className="text-gray-500" />
        </div>
      );
    }
    return (
      <img 
        src={url} 
        alt="Foto" 
        className="w-10 h-10 object-cover rounded border border-gray-600 hover:scale-150 hover:z-10 transition-transform cursor-pointer"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  };

  return (
    <div className="p-4">
      {/* Header dengan Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-900/30 rounded-lg">
            <Camera size={24} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-100">Foto Produk</h1>
            <p className="text-xs text-gray-400">Kelola foto produk untuk online shop</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 mb-6 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('foto_link')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'foto_link'
              ? 'text-purple-400 border-purple-400'
              : 'text-gray-400 border-transparent hover:text-gray-200'
          }`}
        >
          <Link2 size={16} />
          Foto Link Manager
        </button>
        <button
          onClick={() => setActiveTab('foto')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'foto'
              ? 'text-cyan-400 border-cyan-400'
              : 'text-gray-400 border-transparent hover:text-gray-200'
          }`}
        >
          <Database size={16} />
          Database Foto (SKU)
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'foto_link' ? (
        <FotoLinkManager />
      ) : (
        <div>
          {/* Foto Table Controls */}
          <div className="flex items-center justify-end gap-2 mb-4">
            {/* Tombol Upload */}
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 rounded-lg transition-colors text-xs font-medium border border-green-900/50"
              title="Upload CSV/Excel"
            >
              <Upload size={16} />
              <span className="hidden sm:inline">Upload</span>
            </button>
            
            {/* Tombol Export */}
            <button
              onClick={() => {
                // TODO: Implementasi export
                console.log('Export clicked');
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 rounded-lg transition-colors text-xs font-medium border border-blue-900/50"
              title="Export CSV/Excel"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export</span>
            </button>
            
            {/* Tombol Refresh */}
            <button
              onClick={() => loadData(search)}
              disabled={loading}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin text-cyan-400' : 'text-gray-300'} />
            </button>
          </div>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Cari Part Number..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-200 focus:border-cyan-500 outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-300">
            <tr>
              <th className="px-3 py-3 text-left font-semibold sticky left-0 bg-gray-800 z-10">Part Number</th>
              <th className="px-2 py-3 text-center font-semibold">Foto 1</th>
              <th className="px-2 py-3 text-center font-semibold">Foto 2</th>
              <th className="px-2 py-3 text-center font-semibold">Foto 3</th>
              <th className="px-2 py-3 text-center font-semibold">Foto 4</th>
              <th className="px-2 py-3 text-center font-semibold">Foto 5</th>
              <th className="px-2 py-3 text-center font-semibold">Foto 6</th>
              <th className="px-2 py-3 text-center font-semibold">Foto 7</th>
              <th className="px-2 py-3 text-center font-semibold">Foto 8</th>
              <th className="px-2 py-3 text-center font-semibold">Foto 9</th>
              <th className="px-2 py-3 text-center font-semibold">Foto 10</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                  <Loader2 size={32} className="mx-auto mb-2 animate-spin text-cyan-400" />
                  <p className="text-sm">Memuat data...</p>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-red-400">
                  <Camera size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{error}</p>
                  <p className="text-xs text-gray-500 mt-1">Pastikan tabel 'foto' sudah ada di Supabase</p>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                  <Camera size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Belum ada data foto produk</p>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => (
                <tr key={row.id || idx} className="bg-gray-900 hover:bg-gray-800/50 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs text-gray-200 sticky left-0 bg-gray-900 z-10">
                    {row.part_number}
                  </td>
                  <td className="px-2 py-2 text-center">{renderThumbnail(row.foto_1)}</td>
                  <td className="px-2 py-2 text-center">{renderThumbnail(row.foto_2)}</td>
                  <td className="px-2 py-2 text-center">{renderThumbnail(row.foto_3)}</td>
                  <td className="px-2 py-2 text-center">{renderThumbnail(row.foto_4)}</td>
                  <td className="px-2 py-2 text-center">{renderThumbnail(row.foto_5)}</td>
                  <td className="px-2 py-2 text-center">{renderThumbnail(row.foto_6)}</td>
                  <td className="px-2 py-2 text-center">{renderThumbnail(row.foto_7)}</td>
                  <td className="px-2 py-2 text-center">{renderThumbnail(row.foto_8)}</td>
                  <td className="px-2 py-2 text-center">{renderThumbnail(row.foto_9)}</td>
                  <td className="px-2 py-2 text-center">{renderThumbnail(row.foto_10)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4 bg-gray-800 p-3 rounded-xl border border-gray-700">
        <button 
          onClick={() => setPage(p => Math.max(1, p - 1))} 
          disabled={page === 1}
          className="p-1.5 bg-gray-700 rounded disabled:opacity-30 hover:bg-gray-600 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-xs text-gray-400">
          Hal <b className="text-white">{page}</b> / {totalPages} ({data.length} item)
        </span>
        <button 
          onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
          disabled={page === totalPages}
          className="p-1.5 bg-gray-700 rounded disabled:opacity-30 hover:bg-gray-600 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Upload Modal */}
      <FotoUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={() => loadData(search)}
      />
        </div>
      )}
    </div>
  );
};
