// FILE: src/components/shop/ShopBanner.tsx
import React from 'react';
import { Sparkles, Camera, Loader2 } from 'lucide-react';

interface ShopBannerProps {
    bannerUrl: string;
    isAdmin: boolean;
    isUploading: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    onUploadClick: () => void;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const ShopBanner: React.FC<ShopBannerProps> = ({ 
    bannerUrl, isAdmin, isUploading, fileInputRef, onUploadClick, onFileSelect 
}) => {
    return (
        // FIX: Mengubah aspect-[21/9] menjadi aspect-[32/9] agar konsisten mobile & desktop
        <div className="relative w-full aspect-[32/9] bg-gray-800 rounded-2xl overflow-hidden shadow-lg mb-6 group select-none border border-gray-700">
            {bannerUrl ? (
                <img 
                    src={bannerUrl} 
                    alt="Promo Banner" 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                />
            ) : (
                <div className="w-full h-full bg-gradient-to-r from-gray-800 to-gray-900 flex flex-col items-center justify-center text-white p-6 text-center border border-gray-700">
                    <Sparkles className="mb-3 text-yellow-500 opacity-80" size={32} />
                    <h2 className="text-xl md:text-3xl font-bold mb-1 text-gray-100">Promo Spesial Hari Ini</h2>
                    <p className="text-gray-400 text-xs md:text-sm">Temukan sparepart terbaik untuk mobil Anda</p>
                </div>
            )}
            
            {isAdmin && (
                <div className="absolute top-3 right-3 z-10">
                    <button onClick={onUploadClick} disabled={isUploading} className="bg-black/60 backdrop-blur text-white px-3 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-black/80 flex items-center gap-2 transition-all active:scale-95 border border-white/10">
                        {isUploading ? <Loader2 size={14} className="animate-spin"/> : <Camera size={14}/>}
                        {isUploading ? 'Upload...' : 'Ganti Banner'}
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onFileSelect} />
                </div>
            )}
        </div>
    );
};