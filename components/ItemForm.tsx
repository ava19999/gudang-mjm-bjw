// FILE: src/components/ItemForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import { InventoryFormData, InventoryItem } from '../types';
import { fetchPriceHistoryBySource, fetchSellPriceHistory, updateInventory, addInventory, saveItemImages } from '../services/supabaseService';
import { X, Save, Upload, Loader2, Package, Layers, DollarSign, History, AlertCircle, ArrowLeft, Plus, User, Calendar, Search } from 'lucide-react';
import { compressImage, formatRupiah } from '../utils';
import { useStore } from '../context/StoreContext';

interface ItemFormProps {
  initialData?: InventoryItem;
  onCancel: () => void;
  onSuccess: (item?: InventoryItem) => void;
}

export const ItemForm: React.FC<ItemFormProps> = ({ initialData, onCancel, onSuccess }) => {
  const isEditMode = !!initialData;
  const { selectedStore } = useStore();
  
  // Base Form State
  const [formData, setFormData] = useState<InventoryFormData>({
    partNumber: '', name: '', brand: '', application: '',
    quantity: 0, shelf: '', price: 0, costPrice: 0,
    ecommerce: '', imageUrl: '', 
    images: [], 
    initialStock: 0, qtyIn: 0, qtyOut: 0
  });

  // Stock Adjustment State
  const [stockAdjustmentType, setStockAdjustmentType] = useState<'none' | 'in' | 'out'>('none');
  const [adjustmentQty, setAdjustmentQty] = useState<string>('');
  const [adjustmentResiTempo, setAdjustmentResiTempo] = useState<string>('CASH');
  const [adjustmentCustomer, setAdjustmentCustomer] = useState<string>('');

  // UI State
  const [loading, setLoading] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPricePopup, setShowPricePopup] = useState(false);
  const [showSellPricePopup, setShowSellPricePopup] = useState(false);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [sellPriceHistory, setSellPriceHistory] = useState<any[]>([]);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [loadingSellPrice, setLoadingSellPrice] = useState(false);
  const [priceSearchQuery, setPriceSearchQuery] = useState('');
  const [sellPriceSearchQuery, setSellPriceSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      const images = initialData.images || [];
      setFormData({
        partNumber: initialData.partNumber, name: initialData.name, brand: initialData.brand,
        application: initialData.application, quantity: initialData.quantity, shelf: initialData.shelf,
        price: initialData.price, costPrice: initialData.costPrice, ecommerce: initialData.ecommerce || '',
        imageUrl: images[0] || '', 
        // SAFETY CHECK: Gunakan fallback ke array kosong
        images, 
        initialStock: initialData.initialStock,
        qtyIn: initialData.qtyIn, qtyOut: initialData.qtyOut
      });
      setActiveImageIndex(0);
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: (name === 'price' || name === 'costPrice' || name === 'quantity') 
        ? parseFloat(value) || 0 
        : value
    }));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setLoading(true);
      try {
        const newImages: string[] = [...formData.images];
        const slotsAvailable = 10 - newImages.length;
        if (slotsAvailable <= 0) {
            setError("Maksimal 10 foto.");
            setLoading(false);
            return;
        }

        const filesToProcess = Array.from(files).slice(0, slotsAvailable);

        for (const file of filesToProcess) {
            const compressed = await compressImage(file);
            newImages.push(compressed);
        }
        
        setFormData(prev => ({ 
            ...prev, 
            images: newImages, 
            imageUrl: newImages[0] || '' 
        }));
        setActiveImageIndex(prevIndex => newImages.length > 0 ? Math.min(prevIndex, newImages.length - 1) : 0);
        setError(null);
      } catch (err) {
        console.error(err);
        setError("Gagal memproses gambar.");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const removePhoto = (index: number) => {
      const newImages = formData.images.filter((_, i) => i !== index);
      setFormData(prev => ({
          ...prev,
          images: newImages,
          imageUrl: newImages[0] || ''
      }));
      setActiveImageIndex(prevIndex => {
        if (newImages.length === 0) return 0;
        if (index < prevIndex) return prevIndex - 1;
        if (index === prevIndex) return Math.max(0, prevIndex - 1);
        return prevIndex;
      });
  };

  const handleCheckPrices = async () => {
    if (!formData.partNumber) { alert("Isi Part Number terlebih dahulu!"); return; }
    setLoadingPrice(true);
    setShowPricePopup(true);
    setPriceSearchQuery('');
    try {
        const history = await fetchPriceHistoryBySource(formData.partNumber, selectedStore);
        setPriceHistory(history);
    } catch (error) { console.error(error); }
    setLoadingPrice(false);
  };

  const handleCheckSellPrices = async () => {
    if (!formData.partNumber) { alert("Isi Part Number terlebih dahulu!"); return; }
    setLoadingSellPrice(true);
    setShowSellPricePopup(true);
    setSellPriceSearchQuery('');
    try {
        const history = await fetchSellPriceHistory(formData.partNumber, selectedStore);
        setSellPriceHistory(history);
    } catch (error) { console.error(error); }
    setLoadingSellPrice(false);
  };

  const selectPrice = (unitPrice: number) => {
      setFormData(prev => ({ ...prev, costPrice: unitPrice }));
      setShowPricePopup(false);
  };

  const selectSellPrice = (unitPrice: number) => {
      setFormData(prev => ({ ...prev, price: unitPrice }));
      setShowSellPricePopup(false);
  };

  // Filter price history by search query
  const filteredPriceHistory = priceHistory.filter(ph => 
    !priceSearchQuery || ph.source.toLowerCase().includes(priceSearchQuery.toLowerCase())
  );

  const filteredSellPriceHistory = sellPriceHistory.filter(ph => 
    !sellPriceSearchQuery || ph.source.toLowerCase().includes(sellPriceSearchQuery.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isEditMode && initialData) {
        const qtyAdj = Number(adjustmentQty);
        if (stockAdjustmentType !== 'none' && qtyAdj <= 0) {
            setError(`Mohon isi jumlah stok yang valid (lebih dari 0).`);
            setLoading(false);
            return;
        }

        const transactionData = (stockAdjustmentType !== 'none' && qtyAdj > 0) ? {
            type: stockAdjustmentType === 'in' ? 'in' as const : 'out' as const,
            qty: qtyAdj,
            ecommerce: '-', // Via/Sumber removed, use default
            resiTempo: adjustmentResiTempo,
            customer: adjustmentCustomer,
            tempo: adjustmentResiTempo // Tempo for barang_masuk
        } : undefined;

        // Calculate new quantity based on adjustment type
        let newQuantity = formData.quantity;
        if (stockAdjustmentType === 'in') {
            newQuantity = formData.quantity + qtyAdj;
        } else if (stockAdjustmentType === 'out') {
            newQuantity = formData.quantity - qtyAdj;
        }

        const updated = await updateInventory({ 
            ...initialData, 
            ...formData, 
            quantity: newQuantity, // Use updated quantity
            images: formData.images 
        }, transactionData, selectedStore);
        
        if (updated) onSuccess(updated);
        else setError("Gagal update database.");

      } else {
        // Langsung tutup window, proses simpan di background
        onSuccess();
        
        // Proses simpan di background (fire and forget)
        addInventory(formData, selectedStore).then(newId => {
          if (!newId) {
            console.error("Gagal tambah barang.");
          }
        }).catch(err => {
          console.error("Error tambah barang:", err);
        });
        return; // Exit early, window sudah ditutup
      }
    } catch (error) {
      console.error(error);
      setError("Kesalahan Sistem.");
    } finally {
      setLoading(false);
    }
  };

  const projectedStock = isEditMode ? (
      stockAdjustmentType === 'in' ? (Number(formData.quantity) + (Number(adjustmentQty) || 0)) :
      stockAdjustmentType === 'out' ? (Number(formData.quantity) - (Number(adjustmentQty) || 0)) :
      formData.quantity
  ) : formData.quantity;

  const hasImages = formData.images.length > 0;
  const previewImage = hasImages ? (formData.images[activeImageIndex] || formData.images[0]) : null;
  const canAddMoreImages = formData.images.length < 10;

  let modalBorderClass = "border-gray-700";
  let modalHeaderClass = "bg-gray-900/80 border-gray-700";
  
  if (formData.quantity === 0) {
      modalBorderClass = "border-red-600";
      modalHeaderClass = "bg-red-900/90 border-red-700";
  } else if (formData.quantity < 4) {
      modalBorderClass = "border-yellow-600";
      modalHeaderClass = "bg-yellow-900/90 border-yellow-700";
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`bg-gray-800 w-full h-[95vh] md:h-auto md:max-h-[90vh] md:max-w-4xl rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden border ${modalBorderClass} transition-colors duration-300`}>
        
        <div className={`px-5 py-4 border-b flex justify-between items-center backdrop-blur-md sticky top-0 z-10 ${modalHeaderClass} transition-colors duration-300`}>
          <div className="flex items-center gap-3">
             <button onClick={onCancel} className="md:hidden p-2 -ml-2 hover:bg-gray-700 rounded-full text-gray-300">
                <ArrowLeft size={22} />
             </button>
             <div>
                <h2 className="text-lg font-extrabold text-gray-100 flex items-center gap-2">
                {initialData ? 'Edit Barang' : 'Tambah Barang Baru'}
                </h2>
                <p className="text-xs text-gray-200 hidden md:block">{initialData ? formData.name : 'Isi detail barang baru'}</p>
             </div>
          </div>
          <button onClick={onCancel} className="hidden md:block p-2 hover:bg-gray-700 rounded-full text-gray-200 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 custom-scrollbar pb-24 md:pb-6 bg-gray-800">
          {error && <div className="bg-red-900/30 text-red-400 p-3 rounded-xl flex items-center gap-2 text-xs border border-red-900/50 mb-5 font-bold"><AlertCircle size={16} />{error}</div>}

          <div className="flex flex-col lg:flex-row gap-6">
            
            <div className="w-full lg:w-1/3 flex flex-col gap-4">
              <div 
                className={`aspect-video lg:aspect-square w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all relative overflow-hidden group shadow-sm bg-gray-700 ${hasImages ? 'border-blue-500' : 'border-gray-600 hover:border-gray-500'}`}
              >
                {hasImages ? (
                  <>
                    {previewImage && <img src={previewImage} alt="Preview" className="w-full h-full object-cover" />}
                    <div 
                        className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                    >
                      <Plus size={32} className="text-white"/>
                      <span className="text-white text-xs font-bold mt-1">Tambah / Ganti</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-4 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-2 text-gray-400 shadow-sm border border-gray-500">
                      <Upload size={20} />
                    </div>
                    <span className="text-xs font-bold text-gray-400">Upload Foto</span>
                    <p className="text-[10px] text-gray-500 mt-1">Max 10 foto</p>
                  </div>
                )}
                <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" multiple className="hidden" />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || !canAddMoreImages}
                  className="flex-1 py-2 bg-gray-700 border border-gray-600 text-gray-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-600 disabled:opacity-60"
                >
                  <Plus size={14} /> Tambah Foto
                </button>
                {hasImages && (
                  <button
                    type="button"
                    onClick={() => removePhoto(activeImageIndex)}
                    disabled={loading}
                    className="flex-1 py-2 bg-red-900/40 border border-red-800 text-red-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-red-900/60 disabled:opacity-60"
                  >
                    <X size={14} /> Hapus Foto
                  </button>
                )}
              </div>

              {hasImages && (
                  <div className="grid grid-cols-5 gap-2">
                      {formData.images.map((img, idx) => (
                          <div
                            key={idx}
                            role="button"
                            tabIndex={0}
                            onClick={() => setActiveImageIndex(idx)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setActiveImageIndex(idx);
                              }
                            }}
                            className={`relative aspect-square rounded-lg overflow-hidden border ${idx === activeImageIndex ? 'border-blue-500 ring-2 ring-blue-500/60' : 'border-gray-600'} focus:outline-none cursor-pointer`}
                          >
                            <img src={img} className="w-full h-full object-cover" />
                            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-gray-200 font-bold">
                              {idx + 1}
                            </span>
                            <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                                className="absolute top-1 right-1 bg-red-600/90 hover:bg-red-600 text-white rounded-full p-1 shadow"
                                aria-label="Hapus foto"
                            >
                                <X size={12} />
                            </button>
                          </div>
                      ))}
                      {canAddMoreImages && (
                           <button
                             type="button"
                             onClick={() => fileInputRef.current?.click()}
                             className="aspect-square rounded-lg border border-dashed border-gray-600 flex items-center justify-center hover:bg-gray-700 cursor-pointer text-gray-500 hover:text-white transition-colors"
                           >
                               <Plus size={20} />
                           </button>
                      )}
                  </div>
              )}

              {/* Stock Table - Only in Edit Mode */}
              {isEditMode && (
                  <div className="bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden">
                      <div className="bg-gray-800 px-3 py-2 border-b border-gray-700">
                          <h4 className="text-xs font-bold text-gray-300 uppercase flex items-center gap-1.5">
                              <Layers size={12} className="text-blue-400"/>
                              Stok Saat Ini
                          </h4>
                      </div>
                      <div className="divide-y divide-gray-700">
                          <div className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs text-gray-400">Stok Awal</span>
                              <input 
                                  type="number" 
                                  min="0"
                                  value={formData.initialStock || 0}
                                  onChange={(e) => {
                                      const newInitialStock = parseInt(e.target.value) || 0;
                                      const newQuantity = newInitialStock + (formData.qtyIn || 0) - (formData.qtyOut || 0);
                                      setFormData(prev => ({ ...prev, initialStock: newInitialStock, quantity: newQuantity }));
                                  }}
                                  className="w-20 text-right text-sm font-mono font-bold text-gray-300 bg-gray-800 border border-gray-600 rounded px-2 py-1 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                              />
                          </div>
                          <div className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs text-gray-400">Total Masuk</span>
                              <div className="flex items-center gap-1">
                                  <span className="text-green-400 font-bold">+</span>
                                  <input 
                                      type="number" 
                                      min="0"
                                      value={formData.qtyIn || 0}
                                      onChange={(e) => {
                                          const newQtyIn = parseInt(e.target.value) || 0;
                                          const newQuantity = (formData.initialStock || 0) + newQtyIn - (formData.qtyOut || 0);
                                          setFormData(prev => ({ ...prev, qtyIn: newQtyIn, quantity: newQuantity }));
                                      }}
                                      className="w-20 text-right text-sm font-mono font-bold text-green-400 bg-gray-800 border border-gray-600 rounded px-2 py-1 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
                                  />
                              </div>
                          </div>
                          <div className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs text-gray-400">Total Keluar</span>
                              <div className="flex items-center gap-1">
                                  <span className="text-red-400 font-bold">-</span>
                                  <input 
                                      type="number" 
                                      min="0"
                                      value={formData.qtyOut || 0}
                                      onChange={(e) => {
                                          const newQtyOut = parseInt(e.target.value) || 0;
                                          const newQuantity = (formData.initialStock || 0) + (formData.qtyIn || 0) - newQtyOut;
                                          setFormData(prev => ({ ...prev, qtyOut: newQtyOut, quantity: newQuantity }));
                                      }}
                                      className="w-20 text-right text-sm font-mono font-bold text-red-400 bg-gray-800 border border-gray-600 rounded px-2 py-1 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                                  />
                              </div>
                          </div>
                          <div className="flex items-center justify-between px-3 py-2.5 bg-blue-900/20">
                              <span className="text-xs font-bold text-blue-300">STOK SEKARANG</span>
                              <span className={`text-lg font-mono font-extrabold ${
                                  formData.quantity === 0 ? 'text-red-400' : 
                                  formData.quantity < 4 ? 'text-yellow-400' : 'text-blue-400'
                              }`}>{formData.quantity}</span>
                          </div>
                      </div>
                  </div>
              )}
              
              {!isEditMode && (
                  <div className="bg-blue-900/20 p-4 rounded-xl border border-blue-900/40">
                    <label className="text-[10px] font-bold text-blue-300 uppercase mb-1 block flex items-center gap-1"><Layers size={12}/> Stok Awal</label>
                    <input type="number" name="quantity" min="0" className="w-full bg-gray-900 border border-blue-800 rounded-lg p-2.5 text-xl font-bold text-center text-blue-400 focus:ring-2 focus:ring-blue-800 outline-none" value={formData.quantity} onChange={handleChange} placeholder="0" />
                  </div>
              )}
            </div>

            <div className="flex-1 space-y-5">
               <div className="space-y-4">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-700 pb-1 mb-2">Info Produk</h3>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-400"><Package size={16}/></span>
                    <input type="text" name="name" required placeholder="Nama Barang" className="w-full pl-10 pr-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-sm font-bold text-gray-100 focus:bg-gray-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:font-normal placeholder-gray-400" value={formData.name} onChange={handleChange} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Part Number</label>
                        <input type="text" name="partNumber" required disabled={isEditMode} className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs font-mono font-medium focus:bg-gray-600 focus:border-blue-500 outline-none text-gray-200 disabled:opacity-50" value={formData.partNumber} onChange={handleChange} />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Brand</label>
                        <input type="text" name="brand" className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs font-medium focus:bg-gray-600 focus:border-blue-500 outline-none text-gray-200" value={formData.brand} onChange={handleChange} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Aplikasi</label>
                        <input type="text" name="application" className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs font-medium focus:bg-gray-600 focus:border-blue-500 outline-none text-gray-200" value={formData.application} onChange={handleChange} />
                     </div>
                     <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Rak</label>
                        <input type="text" name="shelf" className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs font-medium focus:bg-gray-600 focus:border-blue-500 outline-none text-gray-200" value={formData.shelf} onChange={handleChange} />
                     </div>
                  </div>
               </div>

               {isEditMode && (
                   <div className="bg-blue-900/20 p-4 rounded-2xl border border-blue-900/40">
                       <h3 className="text-sm font-bold text-blue-300 flex items-center gap-1.5 mb-3"><History size={16}/> Mutasi Stok</h3>
                       
                       <div className="flex bg-gray-900 p-1 rounded-xl border border-gray-700 shadow-sm mb-4">
                            <button type="button" onClick={() => setStockAdjustmentType('none')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${stockAdjustmentType === 'none' ? 'bg-gray-700 text-gray-200 shadow-sm' : 'text-gray-500 hover:bg-gray-800'}`}>Tetap</button>
                            <button type="button" onClick={() => setStockAdjustmentType('in')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${stockAdjustmentType === 'in' ? 'bg-green-600 text-white shadow-md shadow-green-900' : 'text-gray-500 hover:text-green-400 hover:bg-gray-800'}`}>+ Masuk</button>
                            <button type="button" onClick={() => setStockAdjustmentType('out')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${stockAdjustmentType === 'out' ? 'bg-red-600 text-white shadow-md shadow-red-900' : 'text-gray-500 hover:text-red-400 hover:bg-gray-800'}`}>- Keluar</button>
                       </div>
                       
                       {stockAdjustmentType !== 'none' && (
                           <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex gap-4 items-end">
                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                                            Jumlah {stockAdjustmentType === 'in' ? 'Masuk' : 'Keluar'}
                                        </label>
                                        <input type="number" required min="1" value={adjustmentQty} onChange={(e) => setAdjustmentQty(e.target.value)} className="w-full px-3 py-2.5 bg-gray-900 border-2 border-blue-900/50 rounded-xl text-lg font-bold text-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-900/20 outline-none transition-all placeholder-gray-600" placeholder="0"/>
                                    </div>
                                    <div className="pb-3 text-right">
                                        <span className="text-[10px] text-gray-500 font-bold uppercase block mb-0.5">Estimasi Akhir</span>
                                        <span className={`text-2xl font-extrabold ${stockAdjustmentType==='in'?'text-green-400':'text-red-400'}`}>{projectedStock}</span>
                                    </div>
                                </div>

                                {stockAdjustmentType === 'in' ? (
                                    <div className="grid grid-cols-2 gap-3 pt-1">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1 flex items-center gap-1"><User size={10}/> Customer</label>
                                            <input type="text" placeholder="Nama..." value={adjustmentCustomer} onChange={(e) => setAdjustmentCustomer(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none placeholder-gray-600" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1 flex items-center gap-1"><Calendar size={10}/> Tempo</label>
                                            <select value={adjustmentResiTempo} onChange={(e) => setAdjustmentResiTempo(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none">
                                                <option value="CASH">CASH</option>
                                                <option value="1 BLN">1 BLN</option>
                                                <option value="2 BLN">2 BLN</option>
                                                <option value="3 BLN">3 BLN</option>
                                                <option value="NADIR">NADIR</option>
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3 pt-1">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1 flex items-center gap-1"><User size={10}/> Penerima / Customer</label>
                                            <input type="text" placeholder="Nama Bengkel / Pembeli..." value={adjustmentCustomer} onChange={(e) => setAdjustmentCustomer(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none placeholder-gray-600" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1 flex items-center gap-1"><Calendar size={10}/> Tempo</label>
                                            <select value={adjustmentResiTempo} onChange={(e) => setAdjustmentResiTempo(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none">
                                                <option value="CASH">CASH</option>
                                                <option value="1 BLN">1 BLN</option>
                                                <option value="2 BLN">2 BLN</option>
                                                <option value="3 BLN">3 BLN</option>
                                                <option value="NADIR">NADIR</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                           </div>
                       )}
                   </div>
               )}

               <div className="bg-gray-700 p-4 rounded-2xl border border-gray-600 space-y-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><DollarSign size={12}/> Harga</h3>
                  
                  <div className="relative">
                      <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Harga Modal (Satuan)</label>
                      <div className="flex gap-2 mt-1">
                        <input 
                            type="number" 
                            name="costPrice"
                            value={formData.costPrice} 
                            onChange={handleChange} 
                            placeholder="0"
                            className="flex-1 px-3 py-2 bg-orange-900/20 text-orange-300 font-mono font-bold text-sm rounded-lg border border-orange-900/50 focus:ring-2 focus:ring-orange-800 focus:bg-orange-900/30 hover:bg-orange-900/30 outline-none placeholder-orange-800 cursor-text transition-colors" 
                        />
                        <button type="button" onClick={handleCheckPrices} className="px-3 py-2 bg-gray-800 border border-gray-600 text-gray-400 rounded-lg hover:bg-gray-600 hover:text-white"><History size={18}/></button>
                      </div>
                      
                      {showPricePopup && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 shadow-xl border border-gray-600 rounded-xl z-20 max-h-64 overflow-hidden flex flex-col">
                           {/* Search Input */}
                           <div className="p-2 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
                             <div className="relative">
                               <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                               <input 
                                 type="text" 
                                 placeholder="Cari customer..." 
                                 value={priceSearchQuery}
                                 onChange={(e) => setPriceSearchQuery(e.target.value)}
                                 className="w-full pl-8 pr-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:border-orange-500 outline-none"
                               />
                             </div>
                           </div>
                           
                           <div className="overflow-y-auto flex-1">
                             {loadingPrice ? (
                               <div className="p-4 text-center"><Loader2 size={20} className="animate-spin mx-auto text-orange-400" /></div>
                             ) : filteredPriceHistory.length > 0 ? (
                               filteredPriceHistory.map((ph, idx) => (
                                 <div key={idx} onClick={() => selectPrice(ph.price)} className="p-2.5 border-b border-gray-700 text-xs flex justify-between hover:bg-gray-700 cursor-pointer items-center">
                                   <div>
                                     <div className="font-bold text-orange-300 mb-0.5">{ph.source}</div>
                                     <div className="text-[10px] text-gray-500">{ph.date}</div>
                                   </div>
                                   <div className="font-mono font-bold text-gray-200">{formatRupiah(ph.price)}</div>
                                 </div>
                               ))
                             ) : (
                               <div className="p-3 text-center text-xs text-gray-500">
                                 {priceSearchQuery ? 'Tidak ditemukan' : 'Belum ada riwayat'}
                               </div>
                             )}
                           </div>
                           
                           <div className="p-2 sticky bottom-0 bg-gray-800/95 border-t border-gray-700">
                               <button type="button" onClick={() => setShowPricePopup(false)} className="w-full py-1.5 text-[10px] text-gray-400 hover:text-gray-200 font-bold uppercase">Tutup</button>
                           </div>
                        </div>
                      )}
                  </div>

                  <div className="relative">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Harga Jual</label>
                    <div className="flex gap-2 mt-1">
                      <input type="number" name="price" value={formData.price} onChange={handleChange} placeholder="0" className="flex-1 px-3 py-2 bg-blue-900/20 text-blue-300 font-mono font-bold text-sm rounded-lg border border-blue-900/50 focus:ring-2 focus:ring-blue-800 focus:bg-blue-900/30 hover:bg-blue-900/30 outline-none cursor-text transition-colors" />
                      <button type="button" onClick={handleCheckSellPrices} className="px-3 py-2 bg-gray-800 border border-gray-600 text-gray-400 rounded-lg hover:bg-gray-600 hover:text-white"><History size={18}/></button>
                    </div>
                    
                    {showSellPricePopup && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 shadow-xl border border-gray-600 rounded-xl z-20 max-h-64 overflow-hidden flex flex-col">
                         {/* Search Input */}
                         <div className="p-2 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
                           <div className="relative">
                             <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                             <input 
                               type="text" 
                               placeholder="Cari customer..." 
                               value={sellPriceSearchQuery}
                               onChange={(e) => setSellPriceSearchQuery(e.target.value)}
                               className="w-full pl-8 pr-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:border-blue-500 outline-none"
                             />
                           </div>
                         </div>
                         
                         <div className="overflow-y-auto flex-1">
                           {loadingSellPrice ? (
                             <div className="p-4 text-center"><Loader2 size={20} className="animate-spin mx-auto text-blue-400" /></div>
                           ) : filteredSellPriceHistory.length > 0 ? (
                             filteredSellPriceHistory.map((ph, idx) => (
                               <div 
                                 key={idx} 
                                 onClick={() => selectSellPrice(ph.price)} 
                                 className={`p-2.5 border-b text-xs flex justify-between hover:bg-gray-700 cursor-pointer items-center ${
                                   ph.isOfficial 
                                     ? 'bg-green-900/30 border-green-800 hover:bg-green-900/50' 
                                     : 'border-gray-700'
                                 }`}
                               >
                                 <div>
                                   <div className={`font-bold mb-0.5 flex items-center gap-1.5 ${ph.isOfficial ? 'text-green-400' : 'text-blue-300'}`}>
                                     {ph.isOfficial && <span className="px-1.5 py-0.5 bg-green-600 text-white text-[8px] rounded font-bold">RESMI</span>}
                                     {ph.source}
                                   </div>
                                   <div className="text-[10px] text-gray-500">{ph.date}</div>
                                 </div>
                                 <div className={`font-mono font-bold ${ph.isOfficial ? 'text-green-300' : 'text-gray-200'}`}>{formatRupiah(ph.price)}</div>
                               </div>
                             ))
                           ) : (
                             <div className="p-3 text-center text-xs text-gray-500">
                               {sellPriceSearchQuery ? 'Tidak ditemukan' : 'Belum ada riwayat'}
                             </div>
                           )}
                         </div>
                         
                         <div className="p-2 sticky bottom-0 bg-gray-800/95 border-t border-gray-700">
                             <button type="button" onClick={() => setShowSellPricePopup(false)} className="w-full py-1.5 text-[10px] text-gray-400 hover:text-gray-200 font-bold uppercase">Tutup</button>
                         </div>
                      </div>
                    )}
                  </div>
               </div>
            </div>
          </div>
        </form>

        <div className="p-4 bg-gray-800 border-t border-gray-700 flex gap-3 sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.2)] safe-area-bottom">
            <button onClick={onCancel} className="flex-1 py-3 bg-gray-700 border border-gray-600 text-gray-300 font-bold rounded-xl hover:bg-gray-600 text-sm">Batal</button>
            <button onClick={handleSubmit} disabled={loading} className="flex-[2] py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-70 text-sm shadow-lg shadow-blue-900/50">
                {loading ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} Simpan
            </button>
        </div>
      </div>
    </div>
  );
};
