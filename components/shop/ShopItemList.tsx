// FILE: src/components/shop/ShopItemList.tsx
import React, { useState } from 'react';
import { InventoryItem } from '../../types';
import { ShoppingCart, Package, Layers } from 'lucide-react'; 
import { formatCompactNumber } from '../../utils/dashboardHelpers';
import { ImageViewer } from '../common/ImageViewer'; 

interface ShopItemListProps {
  items: InventoryItem[];
  loading: boolean;
  onAddToCart: (item: InventoryItem) => void;
  // Props opsional untuk kompatibilitas
  shopItems?: InventoryItem[];
  viewMode?: 'grid' | 'list';
  isAdmin?: boolean;
  isKingFano?: boolean;
  adminPriceMode?: string;
}

export const ShopItemList: React.FC<ShopItemListProps> = ({ 
  items, 
  shopItems, 
  loading, 
  viewMode = 'grid',
  onAddToCart 
}) => {
  // Gunakan 'items' atau 'shopItems' (fallback agar tidak error)
  const dataToShow = items || shopItems || [];

  // State untuk Image Viewer
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Handler saat gambar diklik dengan Safety Check
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="bg-gray-800 rounded-2xl p-3 h-64 animate-pulse">
            <div className="w-full aspect-square bg-gray-700 rounded-xl mb-3"></div>
            <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!dataToShow || dataToShow.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <Package size={48} className="mb-2 opacity-50"/>
        <p>Barang tidak ditemukan</p>
      </div>
    );
  }

  return (
    <>
      {/* COMPONENT IMAGE VIEWER */}
      <ImageViewer 
        isOpen={isViewerOpen} 
        images={viewerImages} 
        onClose={() => setIsViewerOpen(false)} 
      />

      {viewMode === 'grid' ? (
        // GRID VIEW
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {dataToShow.map((item) => (
            <div key={item.id} className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden flex flex-col hover:border-gray-600 transition-all shadow-sm group">
              
              {/* AREA FOTO */}
              <div className="aspect-[4/3] relative bg-gray-700 cursor-pointer overflow-hidden">
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
                  <div className="w-full h-full flex items-center justify-center text-gray-600">
                    <Package size={24}/>
                  </div>
                )}

                {/* PERBAIKAN: Stok Netral (Tanpa Warna Merah/Kuning) */}
                <div className="absolute top-2 left-2 pointer-events-none">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm border bg-black/60 text-white backdrop-blur border-white/10">
                      {item.quantity} Unit
                  </span>
                </div>

                {/* Indikator Banyak Foto */}
                {item.images && item.images.length > 1 && (
                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur text-white px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1">
                        <Layers size={10} /> {item.images.length}
                    </div>
                )}
              </div>

              {/* INFO BARANG */}
              <div className="p-3 flex flex-col flex-1">
                <div className="mb-1">
                  <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] md:text-xs font-bold text-gray-500 font-mono bg-gray-900 px-1 rounded border border-gray-800">
                          {item.partNumber}
                      </span>
                      {item.brand && <span className="text-[9px] md:text-[10px] bg-gray-700 text-gray-300 px-1 rounded border border-gray-600">{item.brand}</span>}
                  </div>
                  <h3 className="text-xs md:text-sm font-bold text-gray-200 line-clamp-2 leading-relaxed min-h-[2.5em]" title={item.name}>
                    {item.name}
                  </h3>
                  {item.application && (
                    <div className="mt-1">
                      <span className="text-[9px] md:text-[10px] bg-blue-900/30 text-blue-300 px-1.5 py-0.5 rounded border border-blue-900/50 inline-block">
                        {item.application}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-3 border-t border-gray-700 flex items-center justify-between">
                  <div className="text-sm md:text-base font-extrabold text-blue-400">
                    {formatCompactNumber(item.price)}
                  </div>
                  
                  <button 
                    onClick={() => onAddToCart(item)}
                    disabled={item.quantity === 0}
                    className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-500 active:scale-95 transition-all disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30"
                  >
                    <ShoppingCart size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // LIST VIEW
        <div className="flex flex-col gap-3">
          {dataToShow.map((item) => (
            <div key={item.id} className="bg-gray-800 border border-gray-700 rounded-xl p-3 flex items-center gap-3 hover:border-gray-600 transition-all shadow-sm">
              
              {/* AREA FOTO */}
              <div className="w-20 h-20 bg-gray-700 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer relative group">
                {item.imageUrl ? (
                  <img 
                    src={item.imageUrl} 
                    alt={item.name} 
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 cursor-zoom-in"
                    referrerPolicy="no-referrer"
                    onClick={(e) => handleImageClick(e, item)} 
                    onError={(e)=>{(e.target as HTMLImageElement).style.display='none'}}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600">
                    <Package size={20}/>
                  </div>
                )}

                {/* Indikator Banyak Foto */}
                {item.images && item.images.length > 1 && (
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[8px] px-1 rounded flex items-center gap-0.5">
                        <Layers size={8}/> {item.images.length}
                    </div>
                )}
              </div>

              {/* INFO BARANG */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] md:text-xs font-bold text-gray-500 font-mono bg-gray-900 px-1.5 py-0.5 rounded border border-gray-800">
                    {item.partNumber}
                  </span>
                  <span className="text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white border border-white/10">
                    {item.quantity} Unit
                  </span>
                </div>
                <h3 className="text-sm md:text-base font-bold text-gray-200 truncate mb-1" title={item.name}>
                  {item.name}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {item.brand && (
                    <span className="text-[9px] md:text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded border border-gray-600 inline-block">
                      {item.brand}
                    </span>
                  )}
                  {item.application && (
                    <span className="text-[9px] md:text-[10px] bg-blue-900/30 text-blue-300 px-1.5 py-0.5 rounded border border-blue-900/50 inline-block">
                      {item.application}
                    </span>
                  )}
                </div>
              </div>

              {/* HARGA & TOMBOL */}
              <div className="flex flex-col items-end gap-2 pl-2">
                <div className="text-base md:text-lg font-extrabold text-blue-400">
                  {formatCompactNumber(item.price)}
                </div>
                <button 
                  onClick={() => onAddToCart(item)}
                  disabled={item.quantity === 0}
                  className="px-4 py-2 flex items-center gap-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 active:scale-95 transition-all disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30 text-xs font-bold"
                >
                  <ShoppingCart size={14} />
                  Beli
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};