// FILE: src/components/online/OnlineMenu.tsx
import React, { useState } from 'react';
import { Globe, ChevronDown, ChevronUp, Database, Camera, Package } from 'lucide-react';
import { ActiveView } from '../../types/ui';

interface OnlineMenuProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  isMobile?: boolean;
}

export const OnlineMenu: React.FC<OnlineMenuProps> = ({ 
  activeView, 
  setActiveView,
  isMobile = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const isOnlineActive = activeView === 'data_agung' || activeView === 'scan_resi' || activeView === 'packing_confirm';

  const handleMainClick = () => {
    setIsOpen(!isOpen);
  };

  if (isMobile) {
    return (
      <div className="relative">
        <button 
          onClick={handleMainClick}
          className={`w-full flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${
            isOnlineActive ? 'text-cyan-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {isOnlineActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent rounded-full"></div>}
          <div className={`p-2 rounded-xl transition-all duration-200 ${isOnlineActive ? 'bg-cyan-900/30 shadow-lg shadow-cyan-900/20' : 'bg-transparent'}`}>
            <Globe size={22} className={`transition-all duration-200 ${isOnlineActive ? 'fill-cyan-900/50 drop-shadow-sm' : ''}`} />
          </div>
          <span className={`text-[10px] font-semibold transition-all ${isOnlineActive ? 'text-cyan-300' : 'text-gray-500'}`}>Online</span>
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl shadow-2xl overflow-hidden min-w-[220px] animate-in slide-in-from-bottom-2 fade-in duration-200">
            <button
              onClick={() => {
                setActiveView('data_agung');
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-3 active:scale-[0.98] ${
                activeView === 'data_agung' ? 'bg-gradient-to-r from-cyan-900/30 to-transparent text-cyan-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1.5 rounded-lg ${activeView === 'data_agung' ? 'bg-cyan-900/40' : 'bg-gray-700/50'}`}>
                <Database size={18} />
              </div>
              <span className="text-sm font-semibold">Data Agung</span>
            </button>
            
            <button
              onClick={() => {
                setActiveView('scan_resi');
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-3 active:scale-[0.98] ${
                activeView === 'scan_resi' ? 'bg-gradient-to-r from-cyan-900/30 to-transparent text-cyan-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1.5 rounded-lg ${activeView === 'scan_resi' ? 'bg-cyan-900/40' : 'bg-gray-700/50'}`}>
                <Camera size={18} />
              </div>
              <span className="text-sm font-semibold">Scan Resi</span>
            </button>
            
            <button
              onClick={() => {
                setActiveView('packing_confirm');
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-3 active:scale-[0.98] ${
                activeView === 'packing_confirm' ? 'bg-gradient-to-r from-cyan-900/30 to-transparent text-cyan-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1.5 rounded-lg ${activeView === 'packing_confirm' ? 'bg-cyan-900/40' : 'bg-gray-700/50'}`}>
                <Package size={18} />
              </div>
              <span className="text-sm font-semibold">Packing</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Desktop version
  return (
    <div className="relative">
      <button 
        onClick={handleMainClick}
        className={`hidden md:flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full transition-all ${
          isOnlineActive 
            ? 'bg-cyan-900/30 text-cyan-300 ring-1 ring-cyan-800' 
            : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
        }`}
      >
        <Globe size={18} />
        <span>Online</span>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-[220px] z-50">
          <button
            onClick={() => {
              setActiveView('data_agung');
              setIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'data_agung' ? 'bg-gray-700 text-cyan-400' : 'text-gray-300'
            }`}
          >
            <Database size={16} />
            <div>
              <div className="text-sm font-medium">Data Agung</div>
              <div className="text-xs text-gray-500">Produk online</div>
            </div>
          </button>
          
          <div className="h-px bg-gray-700"></div>
          
          <button
            onClick={() => {
              setActiveView('scan_resi');
              setIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'scan_resi' ? 'bg-gray-700 text-cyan-400' : 'text-gray-300'
            }`}
          >
            <Camera size={16} />
            <div>
              <div className="text-sm font-medium">Scan Resi</div>
              <div className="text-xs text-gray-500">Input pesanan</div>
            </div>
          </button>
          
          <div className="h-px bg-gray-700"></div>
          
          <button
            onClick={() => {
              setActiveView('packing_confirm');
              setIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'packing_confirm' ? 'bg-gray-700 text-cyan-400' : 'text-gray-300'
            }`}
          >
            <Package size={16} />
            <div>
              <div className="text-sm font-medium">Konfirmasi Packing</div>
              <div className="text-xs text-gray-500">Scan untuk packing</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
