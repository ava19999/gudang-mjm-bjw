// FILE: src/components/common/ImageViewer.tsx
import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageViewerProps {
  images: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ images, initialIndex = 0, isOpen, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Jika tidak ada gambar atau modal tertutup, return null
  if (!isOpen || !images || images.length === 0) return null;

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      
      {/* Close Button */}
      <button 
        onClick={onClose} 
        className="absolute top-4 right-4 p-2 bg-gray-800/50 hover:bg-gray-700 text-white rounded-full z-20 transition-colors border border-gray-600"
      >
        <X size={24} />
      </button>

      {/* Main Image Container */}
      <div className="relative w-full h-full max-w-5xl max-h-[85vh] flex items-center justify-center p-4">
        <img 
          src={images[currentIndex]} 
          alt={`View ${currentIndex + 1}`} 
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-transform duration-300"
          onClick={(e) => e.stopPropagation()} 
        />

        {/* Navigation Buttons (Show only if multiple images) */}
        {images.length > 1 && (
          <>
            <button 
              onClick={handlePrev}
              className="absolute left-2 md:left-4 p-3 bg-black/40 hover:bg-black/70 text-white rounded-full transition-colors backdrop-blur-sm border border-white/10"
            >
              <ChevronLeft size={32} />
            </button>
            <button 
              onClick={handleNext}
              className="absolute right-2 md:right-4 p-3 bg-black/40 hover:bg-black/70 text-white rounded-full transition-colors backdrop-blur-sm border border-white/10"
            >
              <ChevronRight size={32} />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails Indicator (Bottom) */}
      {images.length > 1 && (
        <div className="absolute bottom-6 flex gap-2 overflow-x-auto max-w-[95vw] p-2 bg-black/50 rounded-xl backdrop-blur-md border border-white/10" onClick={(e) => e.stopPropagation()}>
          {images.map((img, idx) => (
            <button 
              key={idx} 
              onClick={() => setCurrentIndex(idx)}
              className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${idx === currentIndex ? 'border-blue-500 scale-105 opacity-100' : 'border-transparent opacity-50 hover:opacity-100'}`}
            >
              <img src={img} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
      
      {/* Counter */}
      <div className="absolute top-4 left-4 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold border border-white/10">
          {currentIndex + 1} / {images.length}
      </div>
    </div>
  );
};