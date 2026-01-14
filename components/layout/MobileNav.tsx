// FILE: src/components/layout/MobileNav.tsx
import React from 'react';
import { ShoppingCart, Package, Plus, ClipboardList, Home } from 'lucide-react';
import { ActiveView } from '../../types/ui';

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
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 pb-safe z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.2)]">
      <div className={`grid ${isAdmin ? 'grid-cols-4' : 'grid-cols-2'} h-16`}>
          {isAdmin ? (
              <>
                  <button onClick={()=>setActiveView('shop')} className={`flex flex-col items-center justify-center gap-1 ${activeView==='shop'?'text-purple-400':'text-gray-500 hover:text-gray-300'}`}><ShoppingCart size={22} className={activeView==='shop'?'fill-purple-900/50':''} /><span className="text-[10px] font-medium">Beranda</span></button>
                  <button onClick={()=>setActiveView('inventory')} className={`flex flex-col items-center justify-center gap-1 ${activeView==='inventory'?'text-purple-400':'text-gray-500 hover:text-gray-300'}`}><Package size={22} className={activeView==='inventory'?'fill-purple-900/50':''} /><span className="text-[10px] font-medium">Gudang</span></button>
                  <button onClick={()=>setActiveView('quick_input')} className={`relative flex flex-col items-center justify-center gap-1 ${activeView==='quick_input'?'text-green-400':'text-gray-500 hover:text-gray-300'}`}><div className="relative"><Plus size={22} className={activeView==='quick_input'?'fill-green-900/50':''} /></div><span className="text-[10px] font-medium">Input</span></button>
                  <button onClick={()=>setActiveView('orders')} className={`relative flex flex-col items-center justify-center gap-1 ${activeView==='orders'?'text-purple-400':'text-gray-500 hover:text-gray-300'}`}><div className="relative"><ClipboardList size={22} className={activeView==='orders'?'fill-purple-900/50':''} />{pendingOrdersCount>0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-gray-900"></span>}</div><span className="text-[10px] font-medium">Pesanan</span></button>
              </>
          ) : (
              <>
                  <button onClick={()=>setActiveView('shop')} className={`flex flex-col items-center justify-center gap-1 ${activeView==='shop'?'text-blue-400':'text-gray-500 hover:text-gray-300'}`}><Home size={22} className={activeView==='shop'?'fill-blue-900/50':''} /><span className="text-[10px] font-medium">Belanja</span></button>
                  <button onClick={()=>setActiveView('orders')} className={`relative flex flex-col items-center justify-center gap-1 ${activeView==='orders'?'text-blue-400':'text-gray-500 hover:text-gray-300'}`}>
                      <div className="relative"><ClipboardList size={22} className={activeView==='orders'?'fill-blue-900/50':''} />{myPendingOrdersCount > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-orange-500 rounded-full border border-gray-900"></span>}</div>
                      <span className="text-[10px] font-medium">Pesanan</span></button>
              </>
          )}
      </div>
    </div>
  );
};