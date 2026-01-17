// FILE: src/components/online/OnlineMenu.tsx
import React, { useState } from 'react';
import { Globe, ChevronDown, ChevronUp, Scan, Zap, Users, Upload, Trash2 } from 'lucide-react';
import { ActiveView } from '../../types/ui';

interface OnlineMenuProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  isMobile?: boolean;
}

const ONLINE_MENU_ITEMS = [
  { view: 'scan_resi' as ActiveView, label: 'Scan Resi', icon: Scan, color: 'cyan' },
  { view: 'kilat' as ActiveView, label: 'KILAT', icon: Zap, color: 'yellow' },
  { view: 'reseller' as ActiveView, label: 'Reseller', icon: Users, color: 'purple' },
  { view: 'import_export' as ActiveView, label: 'Import Export', icon: Upload, color: 'blue' },
  { view: 'scan_correction' as ActiveView, label: 'Koreksi Scan', icon: Trash2, color: 'red' },
  { view: 'data_agung' as ActiveView, label: 'Data Agung', icon: Globe, color: 'cyan' },
];

export const OnlineMenu: React.FC<OnlineMenuProps> = ({ 
  activeView, 
  setActiveView,
  isMobile = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const isOnlineActive = ONLINE_MENU_ITEMS.some(item => item.view === activeView);

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
            {ONLINE_MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.view;
              
              return (
                <button
                  key={item.view}
                  onClick={() => {
                    setActiveView(item.view);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-3.5 text-left hover:bg-gray-700/80 transition-all duration-150 flex items-center gap-3 active:scale-[0.98] ${
                    isActive ? `bg-gradient-to-r from-${item.color}-900/30 to-transparent text-${item.color}-400 shadow-inner` : 'text-gray-300'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${isActive ? `bg-${item.color}-900/40` : 'bg-gray-700/50'}`}>
                    <Icon size={18} />
                  </div>
                  <span className="text-sm font-semibold">{item.label}</span>
                </button>
              );
            })}
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
          {ONLINE_MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.view;
            
            return (
              <button
                key={item.view}
                onClick={() => {
                  setActiveView(item.view);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${
                  isActive ? `bg-gray-700 text-${item.color}-400` : 'text-gray-300'
                }`}
              >
                <Icon size={16} />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
