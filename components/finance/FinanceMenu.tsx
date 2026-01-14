// FILE: src/components/finance/FinanceMenu.tsx
import React, { useState } from 'react';
import { Wallet, PackageX, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { ActiveView } from '../../types/ui';

interface FinanceMenuProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  isMobile?: boolean;
}

export const FinanceMenu: React.FC<FinanceMenuProps> = ({ 
  activeView, 
  setActiveView,
  isMobile = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const isFinanceActive = activeView === 'petty_cash' || activeView === 'barang_kosong' || activeView === 'closing';

  const handleMainClick = () => {
    if (isMobile) {
      setIsOpen(!isOpen);
    } else {
      // On desktop, toggle dropdown
      setIsOpen(!isOpen);
    }
  };

  if (isMobile) {
    return (
      <div className="relative">
        <button 
          onClick={handleMainClick}
          className={`w-full flex flex-col items-center justify-center gap-1 ${
            isFinanceActive ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Wallet size={22} className={isFinanceActive ? 'fill-yellow-900/50' : ''} />
          <span className="text-[10px] font-medium">Keuangan</span>
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
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
