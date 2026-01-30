// FILE: src/components/ShopView.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { InventoryItem, CartItem } from '../types';
import { fetchShopItems, fetchSearchSuggestions } from '../services/supabaseService'; 
import { compressImage } from '../utils';
import { ShoppingCart } from 'lucide-react';
import { useStore } from '../context/StoreContext';

import { ImageCropper } from './shop/ImageCropper';
import { ShopFilterBar } from './shop/ShopFilterBar';
import { ShopItemList } from './shop/ShopItemList';
import { ShopPagination } from './shop/ShopPagination';
import { ShopCartModal } from './shop/ShopCartModal';
import { ShopCheckoutModal } from './shop/ShopCheckoutModal';
import { ReceiptModal } from './shop/ReceiptModal';

interface ShopViewProps { 
    items: InventoryItem[]; 
    cart: CartItem[]; 
    isAdmin: boolean;
    isKingFano: boolean; 
    bannerUrl: string; 
    onAddToCart: (item: InventoryItem) => void; 
    onRemoveFromCart: (itemId: string) => void; 
    onUpdateCartItem: (itemId: string, changes: Partial<CartItem>) => void; 
    onCheckout: (customerName: string) => void; 
    onUpdateBanner: (base64: string) => Promise<void>; 
}

export const ShopView: React.FC<ShopViewProps> = ({ 
    cart = [], 
    isAdmin,
    isKingFano, 
    bannerUrl, 
    onAddToCart, 
    onRemoveFromCart, 
    onUpdateCartItem, 
    onCheckout, 
    onUpdateBanner 
}) => {
  const { selectedStore } = useStore();
  
  // State Data
  const [shopItems, setShopItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  // State Filter & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(''); // Anti-kedip
  const [partNumberSearch, setPartNumberSearch] = useState('');
  const [debouncedPartNumber, setDebouncedPartNumber] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [debouncedBrand, setDebouncedBrand] = useState('');
  const [applicationSearch, setApplicationSearch] = useState('');
  const [debouncedApplication, setDebouncedApplication] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [category, setCategory] = useState('All'); // Default 'All' agar tidak error filter
  
  // State Modal & Upload
  const [isCartOpen, setIsCartOpen] = useState(false); 
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false); 
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<{customerName: string; tempo: string; note: string; finalName?: string} | null>(null);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false); 
  const [tempBannerImg, setTempBannerImg] = useState<string | null>(null);
  
  const bannerInputRef = useRef<HTMLInputElement>(null); 
  const cartItemCount = cart.reduce((sum, item) => sum + item.cartQuantity, 0);
  
  // PERBAIKAN 1: Limit 50 Item
  const limit = 50; 

  // State untuk Search Suggestions (dropdown autocomplete)
  const [partNumberOptions, setPartNumberOptions] = useState<string[]>([]);
  const [nameOptions, setNameOptions] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [applicationOptions, setApplicationOptions] = useState<string[]>([]);

  // Fetch suggestions dynamically based on search input
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (partNumberSearch.length >= 1) {
        const suggestions = await fetchSearchSuggestions(selectedStore, 'part_number', partNumberSearch);
        setPartNumberOptions(suggestions);
      } else {
        setPartNumberOptions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [partNumberSearch, selectedStore]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (nameSearch.length >= 1) {
        const suggestions = await fetchSearchSuggestions(selectedStore, 'name', nameSearch);
        setNameOptions(suggestions);
      } else {
        setNameOptions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [nameSearch, selectedStore]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (brandSearch.length >= 1) {
        // Brand di UI = merek spare part = kolom brand di DB
        const suggestions = await fetchSearchSuggestions(selectedStore, 'brand', brandSearch);
        setBrandOptions(suggestions);
      } else {
        setBrandOptions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [brandSearch, selectedStore]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (applicationSearch.length >= 1) {
        // Aplikasi di UI = jenis mobil = kolom application di DB
        const suggestions = await fetchSearchSuggestions(selectedStore, 'application', applicationSearch);
        setApplicationOptions(suggestions);
      } else {
        setApplicationOptions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [applicationSearch, selectedStore]);

  // PERBAIKAN 2: Debounce Search (Mencegah Kedip / Loop)
  useEffect(() => {
    const timer = setTimeout(() => {
        setPage(1); // Reset ke halaman 1 saat search berubah
        setDebouncedSearch(searchTerm);
        setDebouncedPartNumber(partNumberSearch);
        setDebouncedName(nameSearch);
        setDebouncedBrand(brandSearch);
        setDebouncedApplication(applicationSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, partNumberSearch, nameSearch, brandSearch, applicationSearch]);

  // PERBAIKAN 3: Load Data Stable
  useEffect(() => {
    const loadData = async () => {
        setLoading(true);
        try {
            // PERBAIKAN 4: Ganti 'Semua' jadi 'All' agar filter berjalan dengan baik
            const safeCategory = category === 'Semua' ? 'All' : category; 
            
            // Group filters into an object
            const filters = {
                searchTerm: debouncedSearch,
                category: safeCategory,
                partNumberSearch: debouncedPartNumber,
                nameSearch: debouncedName,
                brandSearch: debouncedBrand,
                applicationSearch: debouncedApplication
            };
            
            console.log('[ShopView] Fetching shop items with params:', {
                page, 
                limit,
                filters,
                selectedStore
            });
            
            const result = await fetchShopItems(
                page, 
                limit, 
                filters,
                selectedStore
            );
            
            console.log('[ShopView] Received data:', result);
            
            setShopItems(result.data || []);
            const safeCount = result.count || 0;
            setTotalPages(safeCount > 0 ? Math.ceil(safeCount / limit) : 1);
            
            console.log('[ShopView] Set shop items:', result.data?.length, 'Total pages:', Math.ceil(safeCount / limit));
        } catch (err) {
            console.error("[ShopView] Gagal load shop items:", err);
            setShopItems([]);
        } finally {
            setLoading(false);
        }
    };

    loadData();
  }, [page, debouncedSearch, category, debouncedPartNumber, debouncedName, debouncedBrand, debouncedApplication, selectedStore]); // Hanya jalan jika ini berubah

  // --- Banner Upload Handlers ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { 
      const file = e.target.files?.[0]; 
      if (!file) return; 
      const reader = new FileReader(); 
      reader.onloadend = () => { 
          setTempBannerImg(reader.result as string); 
          if (bannerInputRef.current) bannerInputRef.current.value = ''; 
      }; 
      reader.readAsDataURL(file); 
  };

  const handleCropConfirm = async (base64: string) => { 
      setTempBannerImg(null); 
      setIsUploadingBanner(true); 
      try { 
          const compressed = await compressImage(base64, 1280, 0.90); 
          await onUpdateBanner(compressed); 
      } catch (error) { 
          console.error("Gagal upload banner", error); 
          alert("Gagal memproses gambar banner"); 
      } finally { 
          setIsUploadingBanner(false); 
      } 
  };

  const handleCheckoutConfirm = (finalName: string, tempo: string, note: string) => {
      // Extract customer name from finalName (it's the first part before any parentheses)
      const customerName = finalName.split(' (')[0];
      
      // Save receipt data
      setReceiptData({ customerName, tempo, note });
      
      // DO NOT process the order yet - wait until receipt is closed
      // Store the finalName for later processing
      setReceiptData({ customerName, tempo, note, finalName });
      
      // Close checkout modal and open receipt modal
      setIsCheckoutModalOpen(false);
      setIsReceiptModalOpen(true);
  };

  const handleReceiptClose = () => {
      // Process the order when receipt is closed
      if (receiptData?.finalName) {
          onCheckout(receiptData.finalName);
      }
      setIsReceiptModalOpen(false);
  };

  return (
    <div className="relative min-h-full pb-24 md:pb-4 bg-gray-900 text-gray-100 flex flex-col h-full overflow-hidden">
      {/* Crop Modal */}
      {tempBannerImg && <ImageCropper imageSrc={tempBannerImg} onConfirm={handleCropConfirm} onCancel={() => setTempBannerImg(null)} />}
      
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">

          {/* FILTER BAR */}
          <div className="sticky top-0 z-10 bg-gray-900 px-4 py-2 border-b border-gray-800 shadow-md">
            <ShopFilterBar 
                searchTerm={searchTerm} 
                setSearchTerm={setSearchTerm}
                partNumberSearch={partNumberSearch}
                setPartNumberSearch={setPartNumberSearch}
                partNumberOptions={partNumberOptions}
                nameSearch={nameSearch}
                setNameSearch={setNameSearch}
                nameOptions={nameOptions}
                brandSearch={brandSearch}
                setBrandSearch={setBrandSearch}
                brandOptions={brandOptions}
                applicationSearch={applicationSearch}
                setApplicationSearch={setApplicationSearch}
                applicationOptions={applicationOptions}
                isAdmin={isAdmin}
                viewMode={viewMode}
                setViewMode={setViewMode}
            />
          </div>

          {/* LIST BARANG */}
          <div className="p-4 pb-24">
            <ShopItemList 
                loading={loading}
                // PERBAIKAN 5: Kirim 'items' (bukan shopItems) agar sesuai komponen ShopItemList yang baru
                items={shopItems} 
                // Kompatibilitas jika komponen masih pakai prop lama 'shopItems'
                // @ts-ignore
                shopItems={shopItems}
                
                viewMode={viewMode}
                isAdmin={isAdmin}
                isKingFano={isKingFano}
                // @ts-ignore
                adminPriceMode={'retail'} 
                onAddToCart={onAddToCart}
            />

            {!loading && shopItems.length > 0 && (
                <div className="mt-8 flex justify-center">
                    {/* PERBAIKAN 6: Pagination menggunakan setPage */}
                    <ShopPagination 
                        page={page} 
                        totalPages={totalPages} 
                        setPage={setPage} 
                    />
                </div>
            )}
          </div>
      </div>

      {/* Floating Cart Button */}
      <button onClick={() => setIsCartOpen(true)} className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 bg-blue-600 text-white p-4 rounded-full shadow-2xl hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all z-40 flex items-center justify-center group border-2 border-blue-400">
        <ShoppingCart size={24} />
        {cartItemCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-gray-900 shadow-sm">{cartItemCount}</span>}
      </button>
      
      {/* Modals */}
      <ShopCartModal 
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onRemoveFromCart={onRemoveFromCart}
        onUpdateCartItem={onUpdateCartItem}
        onCheckoutClick={() => { setIsCartOpen(false); setIsCheckoutModalOpen(true); }}
      />

      <ShopCheckoutModal 
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        onConfirm={handleCheckoutConfirm}
      />

      <ReceiptModal 
        isOpen={isReceiptModalOpen}
        onClose={handleReceiptClose}
        cart={cart}
        customerName={receiptData?.customerName || ''}
        tempo={receiptData?.tempo || ''}
        note={receiptData?.note || ''}
      />
    </div>
  );
};