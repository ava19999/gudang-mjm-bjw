// FILE: src/components/gudang/GudangMenu.tsx
import React, { useState } from 'react';
import { Package, ArrowRightLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { ActiveView } from '../../types/ui';

interface GudangMenuProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  isMobile?: boolean;
  isOpen?: boolean;
  onToggle?: (e: React.MouseEvent) => void;
}

export const GudangMenu: React.FC<GudangMenuProps> = ({ 
  activeView, 
  setActiveView,
  isMobile = false,
  isOpen: externalIsOpen,
  onToggle 
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  
  // Use external state for mobile, internal for desktop
  const isOpen = isMobile && externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  
  const isGudangActive = [
    'inventory',
    'kirim_barang',
  ].includes(activeView);

  const handleMainClick = (e: React.MouseEvent) => {
    if (isMobile && onToggle) {
      onToggle(e);
    } else {
      setInternalIsOpen(!internalIsOpen);
    }
  };

  if (isMobile) {
    return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={handleMainClick}
          className={`w-full flex flex-col items-center justify-center gap-0.5 transition-all duration-200 active:scale-95 ${
            isGudangActive ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {isGudangActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent rounded-full"></div>}
          <div className={`p-1.5 rounded-lg transition-all duration-200 ${isGudangActive ? 'bg-purple-900/30 shadow-lg shadow-purple-900/20' : 'bg-transparent'}`}>
            <Package size={18} className={`transition-all duration-200 ${isGudangActive ? 'fill-purple-900/50 drop-shadow-sm' : ''}`} />
          </div>
          <span className={`text-[9px] font-medium transition-all ${isGudangActive ? 'text-purple-300' : 'text-gray-500'}`}>Gudang</span>
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-xl shadow-2xl overflow-hidden min-w-[180px] animate-in slide-in-from-bottom-2 fade-in duration-200">
            <button
              onClick={() => {
                setActiveView('inventory');
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-2.5 active:scale-[0.98] ${
                activeView === 'inventory' ? 'bg-gradient-to-r from-purple-900/30 to-transparent text-purple-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeView === 'inventory' ? 'bg-purple-900/40' : 'bg-gray-700/50'}`}>
                <Package size={16} />
              </div>
              <span className="text-sm font-medium">Data Barang</span>
            </button>
            <button
              onClick={() => {
                setActiveView('kirim_barang');
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-2.5 border-t border-gray-700/50 active:scale-[0.98] ${
                activeView === 'kirim_barang' ? 'bg-gradient-to-r from-indigo-900/30 to-transparent text-indigo-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeView === 'kirim_barang' ? 'bg-indigo-900/40' : 'bg-gray-700/50'}`}>
                <ArrowRightLeft size={16} />
              </div>
              <span className="text-sm font-medium">Kirim Barang MJM BJW</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Desktop version - Click to toggle dropdown
  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!internalIsOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.gudang-menu-desktop')) {
        setInternalIsOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [internalIsOpen]);

  return (
    <div className="relative gudang-menu-desktop">
      <button 
        onClick={handleMainClick}
        className={`hidden md:flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full transition-all ${
          isGudangActive 
            ? 'bg-purple-900/30 text-purple-300 ring-1 ring-purple-800' 
            : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
        }`}
      >
        <Package size={18} />
        <span>Gudang</span>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-[220px] z-50">
          <button
            onClick={() => {
              setActiveView('inventory');
              setInternalIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'inventory' ? 'bg-gray-700 text-purple-400' : 'text-gray-300'
            }`}
          >
            <Package size={16} />
            <span className="text-sm font-medium">Data Barang</span>
          </button>
          <button
            onClick={() => {
              setActiveView('kirim_barang');
              setInternalIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 border-t border-gray-700 ${
              activeView === 'kirim_barang' ? 'bg-gray-700 text-indigo-400' : 'text-gray-300'
            }`}
          >
            <ArrowRightLeft size={16} />
            <span className="text-sm font-medium">Kirim Barang MJM ↔ BJW</span>
          </button>
        </div>
      )}
    </div>
  );
};
