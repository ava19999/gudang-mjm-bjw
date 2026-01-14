// FILE: src/components/online/OnlineMenu.tsx
import React, { useState } from 'react';
import { Globe, ChevronDown, ChevronUp } from 'lucide-react';
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
  
  const isOnlineActive = activeView === 'data_agung';

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
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl shadow-2xl overflow-hidden min-w-[200px] animate-in slide-in-from-bottom-2 fade-in duration-200">
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
                <Globe size={18} />
              </div>
              <span className="text-sm font-semibold">Data Agung</span>
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
        <div className="absolute top-full mt-2 right-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-[200px] z-50">
          <button
            onClick={() => {
              setActiveView('data_agung');
              setIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              activeView === 'data_agung' ? 'bg-gray-700 text-cyan-400' : 'text-gray-300'
            }`}
          >
            <Globe size={16} />
            <span className="text-sm font-medium">Data Agung</span>
          </button>
        </div>
      )}
    </div>
  );
};
