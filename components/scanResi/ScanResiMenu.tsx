// FILE: components/scanResi/ScanResiMenu.tsx
import React, { useState } from 'react';
import { Scan, ChevronDown, ChevronUp, Camera, FileEdit, History, Users, Zap } from 'lucide-react';
import { ActiveView } from '../../types/ui';

interface ScanResiMenuProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  isMobile?: boolean;
  isOpen?: boolean;
  onToggle?: (e: React.MouseEvent) => void;
}

export const ScanResiMenu: React.FC<ScanResiMenuProps> = ({ 
  activeView, 
  setActiveView,
  isMobile = false,
  isOpen: externalIsOpen,
  onToggle 
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  
  // Use external state for mobile, internal for desktop
  const isOpen = isMobile && externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  
  const isScanResiActive = ['scan_resi_stage1', 'scan_resi_stage2', 'scan_resi_stage3', 'scan_resi_reseller', 'scan_resi_history', 'kilat_management'].includes(activeView);

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
            isScanResiActive ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {isScanResiActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent rounded-full"></div>}
          <div className={`p-1.5 rounded-lg transition-all duration-200 ${isScanResiActive ? 'bg-green-900/30 shadow-lg shadow-green-900/20' : 'bg-transparent'}`}>
            <Scan size={18} className={`transition-all duration-200 ${isScanResiActive ? 'fill-green-900/50 drop-shadow-sm' : ''}`} />
          </div>
          <span className={`text-[9px] font-medium transition-all ${isScanResiActive ? 'text-green-300' : 'text-gray-500'}`}>Scan Resi</span>
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-xl shadow-2xl overflow-hidden min-w-[180px] animate-in slide-in-from-bottom-2 fade-in duration-200">
            <button
              onClick={() => {
                setActiveView('scan_resi_stage1');
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-2.5 active:scale-[0.98] ${
                activeView === 'scan_resi_stage1' ? 'bg-gradient-to-r from-green-900/30 to-transparent text-green-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeView === 'scan_resi_stage1' ? 'bg-green-900/40' : 'bg-gray-700/50'}`}>
                <Scan size={16} />
              </div>
              <span className="text-sm font-medium">Stage 1: Scanner</span>
            </button>
            
            <button
              onClick={() => {
                setActiveView('scan_resi_stage2');
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-2.5 active:scale-[0.98] ${
                activeView === 'scan_resi_stage2' ? 'bg-gradient-to-r from-green-900/30 to-transparent text-green-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeView === 'scan_resi_stage2' ? 'bg-green-900/40' : 'bg-gray-700/50'}`}>
                <Camera size={16} />
              </div>
              <span className="text-sm font-medium">Stage 2: Verifikasi</span>
            </button>
            
            <button
              onClick={() => {
                setActiveView('scan_resi_stage3');
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-2.5 active:scale-[0.98] ${
                activeView === 'scan_resi_stage3' ? 'bg-gradient-to-r from-green-900/30 to-transparent text-green-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeView === 'scan_resi_stage3' ? 'bg-green-900/40' : 'bg-gray-700/50'}`}>
                <FileEdit size={16} />
              </div>
              <span className="text-sm font-medium">Stage 3: Data Entry</span>
            </button>
            
            <button
              onClick={() => {
                setActiveView('scan_resi_reseller');
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-2.5 active:scale-[0.98] ${
                activeView === 'scan_resi_reseller' ? 'bg-gradient-to-r from-green-900/30 to-transparent text-green-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeView === 'scan_resi_reseller' ? 'bg-green-900/40' : 'bg-gray-700/50'}`}>
                <Users size={16} />
              </div>
              <span className="text-sm font-medium">Reseller</span>
            </button>
            
            <button
              onClick={() => {
                setActiveView('kilat_management');
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-2.5 active:scale-[0.98] ${
                activeView === 'kilat_management' ? 'bg-gradient-to-r from-yellow-900/30 to-transparent text-yellow-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeView === 'kilat_management' ? 'bg-yellow-900/40' : 'bg-gray-700/50'}`}>
                <Zap size={16} />
              </div>
              <span className="text-sm font-medium">KILAT</span>
            </button>
            
            <button
              onClick={() => {
                setActiveView('scan_resi_history');
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-2.5 active:scale-[0.98] ${
                activeView === 'scan_resi_history' ? 'bg-gradient-to-r from-green-900/30 to-transparent text-green-400 shadow-inner' : 'text-gray-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeView === 'scan_resi_history' ? 'bg-green-900/40' : 'bg-gray-700/50'}`}>
                <History size={16} />
              </div>
              <span className="text-sm font-medium">Riwayat</span>
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
      if (!target.closest('.scan-resi-menu-desktop')) {
        setInternalIsOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [internalIsOpen]);

  return (
    <div className="relative scan-resi-menu-desktop">
      <button 
        onClick={handleMainClick}
        className={`hidden md:flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full transition-all ${
          isScanResiActive 
            ? 'bg-green-900/30 text-green-300 ring-1 ring-green-800' 
            : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
        }`}
      >
        <Scan size={18} />
        <span>Scan Resi</span>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-[220px] z-50">
          <button
            onClick={() => {
              setActiveView('scan_resi_stage1');
              setInternalIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'scan_resi_stage1' ? 'bg-gray-700 text-green-400' : 'text-gray-300'
            }`}
          >
            <Scan size={16} />
            <span className="text-sm font-medium">Stage 1: Scanner</span>
          </button>
          
          <button
            onClick={() => {
              setActiveView('scan_resi_stage2');
              setInternalIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'scan_resi_stage2' ? 'bg-gray-700 text-green-400' : 'text-gray-300'
            }`}
          >
            <Camera size={16} />
            <span className="text-sm font-medium">Stage 2: Verifikasi</span>
          </button>
          
          <button
            onClick={() => {
              setActiveView('scan_resi_stage3');
              setInternalIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'scan_resi_stage3' ? 'bg-gray-700 text-green-400' : 'text-gray-300'
            }`}
          >
            <FileEdit size={16} />
            <span className="text-sm font-medium">Stage 3: Data Entry</span>
          </button>
          
          <button
            onClick={() => {
              setActiveView('scan_resi_reseller');
              setInternalIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'scan_resi_reseller' ? 'bg-gray-700 text-green-400' : 'text-gray-300'
            }`}
          >
            <Users size={16} />
            <span className="text-sm font-medium">Reseller</span>
          </button>
          
          <button
            onClick={() => {
              setActiveView('kilat_management');
              setInternalIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'kilat_management' ? 'bg-gray-700 text-yellow-400' : 'text-gray-300'
            }`}
          >
            <Zap size={16} />
            <span className="text-sm font-medium">KILAT Management</span>
          </button>
          
          <button
            onClick={() => {
              setActiveView('scan_resi_history');
              setInternalIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'scan_resi_history' ? 'bg-gray-700 text-green-400' : 'text-gray-300'
            }`}
          >
            <History size={16} />
            <span className="text-sm font-medium">Riwayat</span>
          </button>
        </div>
      )}
    </div>
  );
};
