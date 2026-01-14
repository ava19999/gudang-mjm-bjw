// FILE: src/components/InventoryList.tsx
import React, { useState } from 'react';
import { InventoryItem } from '../types';
import { formatCompactNumber, getItemCardStyle } from '../utils/dashboardHelpers';
import { Package, History, MapPin, Edit, Trash2, ChevronLeft, ChevronRight, Loader2, Layers } from 'lucide-react';
import { ImageViewer } from './common/ImageViewer'; 

interface InventoryListProps {
  loading: boolean;
  items: InventoryItem[];
  viewMode: 'grid' | 'list';
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onShowHistory: (item: InventoryItem) => void;
}

export const InventoryList: React.FC<InventoryListProps> = ({
  loading, items, viewMode, page, totalPages, setPage, onEdit, onDelete, onShowHistory
}) => {
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const handleImageClick = (e: React.MouseEvent, item: InventoryItem) => {
    e.stopPropagation(); 
    // SAFETY CHECK: Gunakan tanda tanya (?) dan fallback ke array kosong
    const imagesToShow = (item.images && item.images.length > 0) 
        ? item.images 
        : (item.imageUrl ? [item.imageUrl] : []);
    
    if (imagesToShow.length > 0) {
        setViewerImages(imagesToShow);
        setIsViewerOpen(true);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <Loader2 size={32} className="animate-spin mb-3 text-blue-500"/><p className="text-xs font-medium">Memuat Data Gudang...</p>
      </div>
    );
  }

  // SAFETY CHECK: Pastikan items adalah array sebelum dicek length
  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500 border-2 border-dashed border-gray-700 rounded-2xl bg-gray-800/50">
        <Package size={40} className="opacity-20 mb-3"/><p className="text-sm">Tidak ada barang ditemukan</p>
      </div>
    );
  }

  return (
    <>
      <ImageViewer 
        isOpen={isViewerOpen} 
        images={viewerImages} 
        onClose={() => setIsViewerOpen(false)} 
      />

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map(item => (
            <div key={item.id} className={`rounded-xl shadow-none border overflow-hidden flex flex-col transition-all ${getItemCardStyle(item.quantity)}`}>
              <div className="aspect-[4/3] relative bg-gray-700 cursor-pointer group" onClick={() => onShowHistory(item)}>
                {item.imageUrl ? ( 
                  <img 
                    src={item.imageUrl} 
                    alt={item.name} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 cursor-zoom-in" 
                    referrerPolicy="no-referrer" 
                    onClick={(e) => handleImageClick(e, item)}
                    onError={(e)=>{(e.target as HTMLImageElement).style.display='none'}}
                  /> 
                ) : ( 
                  <div className="w-full h-full flex items-center justify-center text-gray-600"><Package size={24}/></div> 
                )}
                
                <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold shadow-sm border ${item.quantity === 0 ? 'bg-red-600 text-white border-red-700' : item.quantity < 4 ? 'bg-yellow-400 text-black border-yellow-500' : 'bg-gray-900/90 text-white backdrop-blur border-gray-700'}`}>
                    {item.quantity === 0 ? 'HABIS' : `${item.quantity} Unit`}
                  </span>
                </div>
                
                {/* SAFETY CHECK: Gunakan item.images?.length */}
                {item.images && item.images.length > 1 && (
                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur text-white px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1">
                        <Layers size={10} /> {item.images.length}
                    </div>
                )}

                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur text-white px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><History size={10} /> Riwayat</div>
              </div>

              <div className="p-3 flex-1 flex flex-col">
                <div className="mb-2">
                  <div className="flex justify-between items-start mb-1"><span className="text-xs font-bold text-white bg-black px-1.5 py-0.5 rounded border border-black">{item.partNumber}</span><span className="text-[9px] font-bold text-gray-500 flex items-center gap-0.5"><MapPin size={8}/> {item.shelf}</span></div>
                  <h3 className="font-bold text-gray-200 text-xs leading-snug line-clamp-2 min-h-[2.5em]">{item.name}</h3>
                  <div className="flex flex-wrap gap-1 mt-1.5 mb-2">{item.brand && <span className="text-[9px] px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded font-medium border border-gray-600">{item.brand}</span>}{item.application && <span className="text-[9px] px-1.5 py-0.5 bg-blue-900/30 text-blue-300 rounded font-medium border border-blue-900/50">{item.application}</span>}</div>
                </div>
                <div className="mt-auto border-t border-gray-700 pt-2"><div className="text-sm font-extrabold text-blue-400 mb-2">{formatCompactNumber(item.price)}</div><div className="grid grid-cols-2 gap-2"><button onClick={() => onEdit(item)} className="py-1.5 bg-blue-900/20 text-blue-400 rounded-lg text-[10px] font-bold hover:bg-blue-900/40 transition-colors border border-blue-900/30">Edit</button><button onClick={() => onDelete(item.id)} className="py-1.5 bg-red-900/20 text-red-400 rounded-lg text-[10px] font-bold hover:bg-red-900/40 transition-colors border border-red-900/30">Hapus</button></div></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(item => (
            <div key={item.id} className={`rounded-xl p-3 border shadow-none flex items-center gap-3 ${getItemCardStyle(item.quantity)}`}>
              <div 
                className="w-16 h-16 bg-gray-700 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer relative group" 
                onClick={(e) => handleImageClick(e, item)}
              >
                {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-600"><Package size={20}/></div>}
                
                {/* SAFETY CHECK: Gunakan item.images?.length */}
                {item.images && item.images.length > 1 && (
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[8px] px-1 rounded flex items-center gap-0.5"><Layers size={8}/> {item.images.length}</div>
                )}
              </div>
              
              <div className="flex-1 min-w-0" onClick={() => onShowHistory(item)}>
                  <div className="flex items-center gap-2 mb-0.5"><span className="text-xs font-bold text-white bg-black px-1.5 py-0.5 rounded border border-black">{item.partNumber}</span><span className={`text-[9px] font-bold px-1.5 rounded ${item.quantity === 0 ? 'bg-red-900/40 text-red-400 border border-red-900/50' : item.quantity < 4 ? 'bg-yellow-400 text-black border-yellow-500' : 'bg-green-900/30 text-green-400 border border-green-900/50'}`}>{item.quantity} Unit</span></div><h3 className="font-bold text-sm text-gray-200 truncate">{item.name}</h3><div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-gray-400">{item.brand && <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded border border-gray-600 font-medium">{item.brand}</span>}{item.application && <span className="bg-blue-900/30 text-blue-300 px-1.5 py-0.5 rounded border border-blue-900/50 font-medium">{item.application}</span>}<span className="flex items-center gap-1 ml-1"><MapPin size={10}/> Rak: <b>{item.shelf || '-'}</b></span></div>
              </div>
              
              <div className="flex flex-col items-end gap-2 pl-2">
                  <div className="font-extrabold text-blue-400 text-sm">{formatCompactNumber(item.price)}</div>
                  <div className="flex gap-1"><button onClick={() => onEdit(item)} className="p-1.5 bg-gray-700 rounded text-gray-400 hover:text-blue-400 hover:bg-gray-600 border border-gray-600"><Edit size={16}/></button><button onClick={() => onDelete(item.id)} className="p-1.5 bg-gray-700 rounded text-gray-400 hover:text-red-400 hover:bg-gray-600 border border-gray-600"><Trash2 size={16}/></button></div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div className="flex justify-between items-center mt-6 bg-gray-800/90 backdrop-blur p-3 rounded-2xl shadow-lg border border-gray-700 sticky bottom-4 z-10 max-w-sm mx-auto">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-30 disabled:hover:bg-gray-700"><ChevronLeft size={18} /></button>
        <span className="text-xs font-medium text-gray-400">Hal <b className="text-white">{page}</b> / {totalPages}</span>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-30 disabled:hover:bg-gray-700"><ChevronRight size={18} /></button>
      </div>
    </>
  );
};