// FILE: src/components/layout/Header.tsx
import React, { useState } from 'react';
import { 
  ShieldCheck, Package, CloudLightning, ShoppingCart, Plus, 
  ClipboardList, Home, LogOut 
} from 'lucide-react';
import { ActiveView } from '../../types/ui';
import { StoreConfig } from '../../types/store';
import { FinanceMenu } from '../finance/FinanceMenu';
import { OnlineMenu } from '../online/OnlineMenu';
import { ScanResiMenu } from '../scanResi/ScanResiMenu';
import { GudangMenu } from '../gudang/GudangMenu';

interface HeaderProps {
  isAdmin: boolean;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  loading: boolean;
  onRefresh: () => void;
  loginName: string;
  onLogout: () => void;
  pendingOrdersCount: number;
  myPendingOrdersCount: number;
  storeConfig: StoreConfig;
}

export const Header: React.FC<HeaderProps> = ({
  isAdmin, activeView, setActiveView, loading, onRefresh,
  loginName, onLogout, pendingOrdersCount, myPendingOrdersCount, storeConfig
}) => {
  const [logoError, setLogoError] = useState(false);
  return (
    <div className="bg-gradient-to-b from-gray-800 via-gray-800 to-gray-800/95 border-b border-gray-700/80 px-3 py-3 md:px-4 flex justify-between items-center sticky top-0 z-50 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2.5 cursor-pointer group" onClick={() => setActiveView(isAdmin ? 'inventory' : 'shop')}>
            <div className={`${isAdmin ? 'bg-gradient-to-br from-purple-600 to-purple-700' : 'bg-gradient-to-br from-blue-600 to-blue-700'} text-white p-2.5 md:p-3 rounded-xl shadow-lg group-hover:scale-105 group-active:scale-95 transition-transform duration-200 flex items-center justify-center ring-2 ${isAdmin ? 'ring-purple-500/30' : 'ring-blue-500/30'}`}>
                {!logoError ? (
                    <img 
                        src={storeConfig.logo} 
                        alt={storeConfig.name}
                        className="w-5 h-5 md:w-6 md:h-6 object-contain drop-shadow-sm"
                        onError={() => setLogoError(true)}
                    />
                ) : (
                    isAdmin ? <ShieldCheck size={20} /> : <Package size={20} />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-extrabold leading-none text-gray-100 text-base md:text-lg tracking-tight">{storeConfig.name}</div>
                <div className="text-[9px] md:text-[10px] font-bold text-gray-400 leading-tight mt-0.5 uppercase tracking-wide">Autopart</div>
                <div className="text-[8px] md:text-[9px] text-gray-500 leading-tight hidden sm:block">{storeConfig.subtitle}</div>
                <div className={`text-[8px] md:text-[9px] font-bold mt-1 px-2 py-0.5 rounded-md inline-block ${isAdmin ? 'bg-gradient-to-r from-purple-900/40 to-purple-800/30 text-purple-300 border border-purple-800/60 shadow-inner' : 'bg-gradient-to-r from-blue-900/40 to-blue-800/30 text-blue-300 border border-blue-800/60 shadow-inner'}`}>
                    {isAdmin ? 'ADMIN' : 'GUEST'}
                </div>
            </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
            <button 
                onClick={onRefresh} 
                className="p-2 md:p-2.5 hover:bg-gray-700/80 rounded-xl transition-all duration-200 active:scale-90 group shadow-sm"
                aria-label="Refresh data"
            >
                <CloudLightning 
                    size={20} 
                    className={`transition-all duration-300 ${loading ? 'animate-spin text-blue-400' : 'text-gray-400 group-hover:text-blue-400'}`}
                />
            </button>
            
            {/* NAVIGASI DESKTOP */}
            {isAdmin ? (
                <>
                  <button onClick={() => setActiveView('shop')} className={`hidden md:flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-all ${activeView==='shop'?'bg-purple-900/40 text-purple-300 ring-1 ring-purple-800/60 shadow-lg':'text-gray-400 hover:bg-gray-700/80 hover:text-gray-200'}`}><ShoppingCart size={18}/> Beranda</button>
                  <GudangMenu activeView={activeView} setActiveView={setActiveView} />
                  <button onClick={() => setActiveView('quick_input')} className={`hidden md:flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-all ${activeView==='quick_input'?'bg-green-900/40 text-green-300 ring-1 ring-green-800/60 shadow-lg':'text-gray-400 hover:bg-gray-700/80 hover:text-gray-200'}`}><Plus size={18}/> Input Barang</button>
                  <FinanceMenu activeView={activeView} setActiveView={setActiveView} />
                  <OnlineMenu activeView={activeView} setActiveView={setActiveView} />
                  <ScanResiMenu activeView={activeView} setActiveView={setActiveView} />
                  <button onClick={() => setActiveView('orders')} className={`hidden md:flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-all ${activeView==='orders'?'bg-purple-900/40 text-purple-300 ring-1 ring-purple-800/60 shadow-lg':'text-gray-400 hover:bg-gray-700/80 hover:text-gray-200'}`}>
                    <ClipboardList size={18}/> Pesanan {pendingOrdersCount > 0 && <span className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full ml-1 font-bold shadow-lg">{pendingOrdersCount}</span>}
                  </button>
                </>
            ) : (
                <>
                  <button onClick={() => setActiveView('shop')} className={`hidden md:flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-all ${activeView==='shop'?'bg-blue-900/40 text-blue-300 ring-1 ring-blue-800/60 shadow-lg':'text-gray-400 hover:bg-gray-700/80 hover:text-gray-200'}`}><Home size={18}/> Belanja</button>
                  <button onClick={() => setActiveView('orders')} className={`hidden md:flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-all relative ${activeView==='orders'?'bg-blue-900/40 text-blue-300 ring-1 ring-blue-800/60 shadow-lg':'text-gray-400 hover:bg-gray-700/80 hover:text-gray-200'}`}>
                    <ClipboardList size={18}/> Pesanan {myPendingOrdersCount > 0 && <span className="bg-orange-500 text-white text-[10px] h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full ml-1 font-bold shadow-lg animate-pulse">{myPendingOrdersCount}</span>}
                  </button>
                </>
            )}

            <div className="h-6 w-px bg-gray-700 mx-1 hidden md:block"></div>
            <button 
                onClick={onLogout} 
                className="flex items-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-3 md:py-2 text-gray-400 hover:bg-red-900/30 hover:text-red-400 rounded-xl transition-all duration-200 active:scale-95 shadow-sm" 
                title="Keluar"
            >
                <span className="text-xs font-semibold hidden lg:inline truncate max-w-[100px]">{loginName}</span>
                <LogOut size={18} />
            </button>
        </div>
    </div>
  );
};