// FILE: src/components/layout/MobileNav.tsx
import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, Plus, ClipboardList, Home } from 'lucide-react';
import { ActiveView } from '../../types/ui';
import { FinanceMenu } from '../finance/FinanceMenu';
import { OnlineMenu } from '../online/OnlineMenu';
import { NotificationBadge } from '../common/NotificationBadge';

interface MobileNavProps {
  isAdmin: boolean;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  pendingOrdersCount: number;
  myPendingOrdersCount: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  isAdmin, activeView, setActiveView, pendingOrdersCount, myPendingOrdersCount
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Show nav when scrolling up or at the top
      if (currentScrollY < lastScrollY || currentScrollY < 50) {
        setIsVisible(true);
      } 
      // Hide nav when scrolling down (and not at the top)
      else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  return (
    <div 
      className={`md:hidden fixed bottom-0 left-0 right-0 bg-gradient-to-t from-gray-800 via-gray-800 to-gray-800/95 border-t border-gray-700 pb-safe z-40 shadow-[0_-4px_24px_rgba(0,0,0,0.3)] backdrop-blur-sm transition-transform duration-300 ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className={`grid ${isAdmin ? 'grid-cols-6' : 'grid-cols-2'} h-[68px]`}>
          {isAdmin ? (
              <>
                  <button 
                      onClick={()=>setActiveView('shop')} 
                      className={`flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 relative ${activeView==='shop'?'text-purple-400':'text-gray-500 hover:text-gray-300'}`}
                  >
                      {activeView==='shop' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-transparent via-purple-400 to-transparent rounded-full"></div>}
                      <div className={`p-2 rounded-xl transition-all duration-200 ${activeView==='shop'?'bg-purple-900/30 shadow-lg shadow-purple-900/20':'bg-transparent'}`}>
                          <ShoppingCart size={22} className={`transition-all duration-200 ${activeView==='shop'?'fill-purple-900/50 drop-shadow-sm':''}`} />
                      </div>
                      <span className={`text-[10px] font-semibold transition-all ${activeView==='shop'?'text-purple-300':'text-gray-500'}`}>Beranda</span>
                  </button>
                  
                  <button 
                      onClick={()=>setActiveView('inventory')} 
                      className={`flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 relative ${activeView==='inventory'?'text-purple-400':'text-gray-500 hover:text-gray-300'}`}
                  >
                      {activeView==='inventory' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-transparent via-purple-400 to-transparent rounded-full"></div>}
                      <div className={`p-2 rounded-xl transition-all duration-200 ${activeView==='inventory'?'bg-purple-900/30 shadow-lg shadow-purple-900/20':'bg-transparent'}`}>
                          <Package size={22} className={`transition-all duration-200 ${activeView==='inventory'?'fill-purple-900/50 drop-shadow-sm':''}`} />
                      </div>
                      <span className={`text-[10px] font-semibold transition-all ${activeView==='inventory'?'text-purple-300':'text-gray-500'}`}>Gudang</span>
                  </button>
                  
                  <button 
                      onClick={()=>setActiveView('quick_input')} 
                      className={`relative flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${activeView==='quick_input'?'text-green-400':'text-gray-500 hover:text-gray-300'}`}
                  >
                      {activeView==='quick_input' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent rounded-full"></div>}
                      <div className={`p-2 rounded-xl transition-all duration-200 ${activeView==='quick_input'?'bg-green-900/30 shadow-lg shadow-green-900/20':'bg-transparent'}`}>
                          <Plus size={22} className={`transition-all duration-200 ${activeView==='quick_input'?'fill-green-900/50 drop-shadow-sm':''}`} />
                      </div>
                      <span className={`text-[10px] font-semibold transition-all ${activeView==='quick_input'?'text-green-300':'text-gray-500'}`}>Input</span>
                  </button>
                  
                  <FinanceMenu activeView={activeView} setActiveView={setActiveView} isMobile={true} />
                  
                  <OnlineMenu activeView={activeView} setActiveView={setActiveView} isMobile={true} />
                  
                  <button 
                      onClick={()=>setActiveView('orders')} 
                      className={`relative flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${activeView==='orders'?'text-purple-400':'text-gray-500 hover:text-gray-300'}`}
                  >
                      {activeView==='orders' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-transparent via-purple-400 to-transparent rounded-full"></div>}
                      <div className="relative">
                          <div className={`p-2 rounded-xl transition-all duration-200 ${activeView==='orders'?'bg-purple-900/30 shadow-lg shadow-purple-900/20':'bg-transparent'}`}>
                              <ClipboardList size={22} className={`transition-all duration-200 ${activeView==='orders'?'fill-purple-900/50 drop-shadow-sm':''}`} />
                          </div>
                          <NotificationBadge count={pendingOrdersCount} color="red" />
                      </div>
                      <span className={`text-[10px] font-semibold transition-all ${activeView==='orders'?'text-purple-300':'text-gray-500'}`}>Pesanan</span>
                  </button>
              </>
          ) : (
              <>
                  <button 
                      onClick={()=>setActiveView('shop')} 
                      className={`flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 relative ${activeView==='shop'?'text-blue-400':'text-gray-500 hover:text-gray-300'}`}
                  >
                      {activeView==='shop' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent rounded-full"></div>}
                      <div className={`p-2.5 rounded-xl transition-all duration-200 ${activeView==='shop'?'bg-blue-900/30 shadow-lg shadow-blue-900/20':'bg-transparent'}`}>
                          <Home size={24} className={`transition-all duration-200 ${activeView==='shop'?'fill-blue-900/50 drop-shadow-sm':''}`} />
                      </div>
                      <span className={`text-[11px] font-semibold transition-all ${activeView==='shop'?'text-blue-300':'text-gray-500'}`}>Belanja</span>
                  </button>
                  
                  <button 
                      onClick={()=>setActiveView('orders')} 
                      className={`relative flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${activeView==='orders'?'text-blue-400':'text-gray-500 hover:text-gray-300'}`}
                  >
                      {activeView==='orders' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent rounded-full"></div>}
                      <div className="relative">
                          <div className={`p-2.5 rounded-xl transition-all duration-200 ${activeView==='orders'?'bg-blue-900/30 shadow-lg shadow-blue-900/20':'bg-transparent'}`}>
                              <ClipboardList size={24} className={`transition-all duration-200 ${activeView==='orders'?'fill-blue-900/50 drop-shadow-sm':''}`} />
                          </div>
                          <NotificationBadge count={myPendingOrdersCount} color="orange" animate={true} />
                      </div>
                      <span className={`text-[11px] font-semibold transition-all ${activeView==='orders'?'text-blue-300':'text-gray-500'}`}>Pesanan</span>
                  </button>
              </>
          )}
      </div>
    </div>
  );
};