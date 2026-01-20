// FILE: src/components/finance/FinanceMenu.tsx
import React, { useState } from 'react';
import { Wallet, PackageX, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { ActiveView } from '../../types/ui';

interface FinanceMenuProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  isMobile?: boolean;
  isOpen?: boolean;
  onToggle?: (e: React.MouseEvent) => void;
}

export const FinanceMenu: React.FC<FinanceMenuProps> = ({ 
  activeView, 
  setActiveView,
  isMobile = false,
  isOpen: externalIsOpen,
  onToggle 
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  
  // Use external state for mobile, internal for desktop
  const isOpen = isMobile && externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  
  const isFinanceActive = activeView === 'petty_cash' || activeView === 'barang_kosong' || activeView === 'closing';

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
            isFinanceActive ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {isFinanceActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded-full"></div>}
          <div className={`p-1.5 rounded-lg transition-all duration-200 ${isFinanceActive ? 'bg-yellow-900/30 shadow-lg shadow-yellow-900/20' : 'bg-transparent'}`}>
            <Wallet size={18} className={`transition-all duration-200 ${isFinanceActive ? 'fill-yellow-900/50 drop-shadow-sm' : ''}`} />
          </div>
          <span className={`text-[9px] font-medium transition-all ${isFinanceActive ? 'text-yellow-300' : 'text-gray-500'}`}>Keuangan</span>
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-xl shadow-2xl overflow-hidden min-w-[180px] animate-in slide-in-from-bottom-2 fade-in duration-200">
            <button
              onClick={() => {
                setActiveView('petty_cash');
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-2.5 active:scale-[0.98] ${
                activeView === 'petty_cash' ? 'bg-gradient-to-r from-green-900/30 to-transparent text-green-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeView === 'petty_cash' ? 'bg-green-900/40' : 'bg-gray-700/50'}`}>
                <Wallet size={16} />
              </div>
              <span className="text-sm font-medium">Petty Cash</span>
            </button>
            <button
              onClick={() => {
                setActiveView('barang_kosong');
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-2.5 border-t border-gray-700/50 active:scale-[0.98] ${
                activeView === 'barang_kosong' ? 'bg-gradient-to-r from-yellow-900/30 to-transparent text-yellow-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeView === 'barang_kosong' ? 'bg-yellow-900/40' : 'bg-gray-700/50'}`}>
                <PackageX size={16} />
              </div>
              <span className="text-sm font-medium">Barang Kosong</span>
            </button>
            <button
              onClick={() => {
                setActiveView('closing');
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-2.5 border-t border-gray-700/50 active:scale-[0.98] ${
                activeView === 'closing' ? 'bg-gradient-to-r from-blue-900/30 to-transparent text-blue-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeView === 'closing' ? 'bg-blue-900/40' : 'bg-gray-700/50'}`}>
                <Calendar size={16} />
              </div>
              <span className="text-sm font-medium">Closing</span>
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
          isFinanceActive 
            ? 'bg-yellow-900/30 text-yellow-300 ring-1 ring-yellow-800' 
            : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
        }`}
      >
        <Wallet size={18} />
        <span>Keuangan</span>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-[200px] z-50">
          <button
            onClick={() => {
              setActiveView('petty_cash');
              setIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'petty_cash' ? 'bg-gray-700 text-green-400' : 'text-gray-300'
            }`}
          >
            <Wallet size={16} />
            <span className="text-sm font-medium">Petty Cash</span>
          </button>
          <button
            onClick={() => {
              setActiveView('barang_kosong');
              setIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 border-t border-gray-700 ${
              activeView === 'barang_kosong' ? 'bg-gray-700 text-yellow-400' : 'text-gray-300'
            }`}
          >
            <PackageX size={16} />
            <span className="text-sm font-medium">Barang Kosong</span>
          </button>
          <button
            onClick={() => {
              setActiveView('closing');
              setIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 border-t border-gray-700 ${
              activeView === 'closing' ? 'bg-gray-700 text-blue-400' : 'text-gray-300'
            }`}
          >
            <Calendar size={16} />
            <span className="text-sm font-medium">Closing</span>
          </button>
        </div>
      )}
    </div>
  );
};
