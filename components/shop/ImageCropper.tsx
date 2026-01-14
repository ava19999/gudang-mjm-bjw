// FILE: src/components/shop/ImageCropper.tsx
import React, { useState, useRef } from 'react';
import { Move, X, ZoomIn, Check } from 'lucide-react';

interface ImageCropperProps { 
    imageSrc: string; 
    onConfirm: (croppedBase64: string) => void; 
    onCancel: () => void; 
}

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, onConfirm, onCancel }) => {
  const [zoom, setZoom] = useState(1); 
  const [crop, setCrop] = useState({ x: 0, y: 0 }); 
  const [isDragging, setIsDragging] = useState(false); 
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); 
  const imgRef = useRef<HTMLImageElement>(null); 
  const containerRef = useRef<HTMLDivElement>(null); 
  
  // FIX: Menggunakan rasio 32:9 yang konsisten
  const ASPECT_RATIO = 32 / 9;

  const onPointerDown = (e: React.MouseEvent | React.TouchEvent) => { e.preventDefault(); setIsDragging(true); const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY; setDragStart({ x: clientX - crop.x, y: clientY - crop.y }); };
  const onPointerMove = (e: React.MouseEvent | React.TouchEvent) => { if (!isDragging) return; e.preventDefault(); const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY; setCrop({ x: clientX - dragStart.x, y: clientY - dragStart.y }); };
  const onPointerUp = () => setIsDragging(false);
  
  const handleCrop = () => { const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const img = imgRef.current; const container = containerRef.current; if (!ctx || !img || !container) return; const OUTPUT_WIDTH = 1280; const OUTPUT_HEIGHT = OUTPUT_WIDTH / ASPECT_RATIO; canvas.width = OUTPUT_WIDTH; canvas.height = OUTPUT_HEIGHT; const containerRect = container.getBoundingClientRect(); const imgRect = img.getBoundingClientRect(); const scaleX = OUTPUT_WIDTH / containerRect.width; const scaleY = OUTPUT_HEIGHT / containerRect.height; const drawX = (imgRect.left - containerRect.left) * scaleX; const drawY = (imgRect.top - containerRect.top) * scaleY; const drawW = imgRect.width * scaleX; const drawH = imgRect.height * scaleY; ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, drawX, drawY, drawW, drawH); const base64 = canvas.toDataURL('image/jpeg', 0.9); onConfirm(base64); };

  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col items-center justify-center p-4 animate-in fade-in">
        <div className="w-full max-w-3xl flex justify-between items-center text-white mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2"><Move size={20}/> Sesuaikan Posisi</h3>
            <button onClick={onCancel} className="p-2 hover:bg-white/20 rounded-full"><X size={24}/></button>
        </div>
        
        <div 
            ref={containerRef} 
            className="relative w-full max-w-4xl bg-gray-800 overflow-hidden shadow-2xl border-2 border-white/20 cursor-move rounded-lg touch-none" 
            style={{ aspectRatio: `${ASPECT_RATIO}` }} 
            onMouseDown={onPointerDown} 
            onMouseMove={onPointerMove} 
            onMouseUp={onPointerUp} 
            onMouseLeave={onPointerUp} 
            onTouchStart={onPointerDown} 
            onTouchMove={onPointerMove} 
            onTouchEnd={onPointerUp}
        >
            <img 
                ref={imgRef} 
                src={imageSrc} 
                alt="Crop Target" 
                draggable={false} 
                // FIX: Menghapus 'max-w-none' dan menambahkan 'w-full' agar gambar pas di layar kecil
                className="absolute origin-center pointer-events-none transition-transform duration-75" 
                style={{ 
                    left: '50%', 
                    top: '50%', 
                    // FIX: width 100% memaksa gambar selebar container (fit width)
                    width: '100%',
                    height: 'auto',
                    minHeight: '100%',
                    transform: `translate(-50%, -50%) translate(${crop.x}px, ${crop.y}px) scale(${zoom})`, 
                }} 
            />
            
            {/* Grid Helper */}
            <div className="absolute inset-0 pointer-events-none opacity-30">
                <div className="w-full h-full border border-white/50 flex">
                    <div className="flex-1 border-r border-white/30"></div>
                    <div className="flex-1 border-r border-white/30"></div>
                    <div className="flex-1"></div>
                </div>
            </div>
        </div>

        <div className="w-full max-w-md mt-6 space-y-4">
            <div className="flex items-center gap-4 text-white">
                <ZoomIn size={20} />
                <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                <span className="text-xs font-mono w-8">{zoom.toFixed(1)}x</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <button onClick={onCancel} className="py-3 bg-gray-700 text-white rounded-xl font-bold hover:bg-gray-600">Batal</button>
                <button onClick={handleCrop} className="py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 flex items-center justify-center gap-2"><Check size={18}/> Simpan & Upload</button>
            </div>
            <p className="text-center text-gray-400 text-xs">Geser gambar untuk mengatur posisi. Gunakan slider untuk zoom.</p>
        </div>
    </div>
  );
};