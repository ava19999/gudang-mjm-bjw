// FILE: src/components/auth/StoreSelector.tsx
import React, { useState } from 'react';
import { Store, Loader2 } from 'lucide-react';
import { StoreType, STORE_CONFIGS } from '../../types/store';

interface StoreSelectorProps {
  onSelectStore: (store: StoreType) => void;
}

const TRANSITION_DELAY_MS = 1500;

export const StoreSelector: React.FC<StoreSelectorProps> = ({ onSelectStore }) => {
  const [selectedStore, setSelectedStore] = useState<StoreType>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleStoreClick = (storeId: 'mjm' | 'bjw') => {
    setSelectedStore(storeId);
    setIsTransitioning(true);
    
    // Simulate loading and transition
    setTimeout(() => {
      onSelectStore(storeId);
    }, TRANSITION_DELAY_MS);
  };

  const stores = Object.values(STORE_CONFIGS);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] animate-pulse delay-75"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-cyan-500/5 to-transparent rounded-full blur-3xl"></div>

      <div className="relative z-10 w-full max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12 animate-in fade-in slide-in-from-top duration-700">
          <div className="flex justify-center mb-6">
            <div className="bg-gray-800/80 backdrop-blur-xl p-5 rounded-3xl shadow-2xl border border-gray-700/50">
              <Store size={48} className="text-blue-400" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white tracking-tight mb-4">
            Pilih Toko
          </h1>
          <p className="text-gray-400 text-lg md:text-xl">
            Silakan pilih gudang atau toko yang ingin Anda akses
          </p>
        </div>

        {/* Loading State */}
        {isTransitioning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="text-center space-y-6">
              <Loader2 size={64} className="text-blue-400 animate-spin mx-auto" />
              <div className="space-y-2">
                <p className="text-2xl font-bold text-white">Memuat...</p>
                <p className="text-gray-400">Menghubungkan ke {selectedStore === 'mjm' ? 'MJM86' : 'BJW'} AUTOPART</p>
              </div>
            </div>
          </div>
        )}

        {/* Store Cards */}
        <div className="grid md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom duration-700 delay-200">
          {stores.map((store, index) => {
            const isSelected = selectedStore === store.id;
            const isOther = selectedStore && selectedStore !== store.id;

            return (
              <button
                key={store.id}
                onClick={() => handleStoreClick(store.id)}
                disabled={isTransitioning}
                className={`
                  group relative overflow-hidden rounded-3xl p-8 
                  bg-gray-800/60 backdrop-blur-xl border-2 
                  transition-all duration-500 ease-out
                  ${isSelected ? 'scale-110 border-' + store.theme.primary : 'border-gray-700/50'}
                  ${isOther ? 'scale-90 opacity-30' : 'hover:scale-105 hover:border-' + store.theme.primary + '/50'}
                  ${!selectedStore && !isTransitioning ? 'hover:shadow-2xl hover:shadow-' + store.theme.glow : ''}
                  disabled:cursor-not-allowed
                  animate-in fade-in slide-in-from-${index === 0 ? 'left' : 'right'} 
                  duration-700 delay-${300 + index * 100}
                `}
                style={{
                  animationDelay: `${300 + index * 100}ms`,
                }}
              >
                {/* Gradient Background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${store.theme.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

                {/* Glow Effect */}
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 blur-xl bg-gradient-to-br from-${store.theme.primary} to-${store.theme.secondary}`}></div>

                <div className="relative z-10 flex flex-col items-center space-y-6">
                  {/* Logo */}
                  <div className={`
                    w-40 h-40 rounded-2xl overflow-hidden 
                    bg-gray-700/50 flex items-center justify-center
                    transition-all duration-500
                    ${isSelected ? 'animate-bounce' : 'group-hover:scale-110 group-hover:rotate-3'}
                    border-2 border-gray-600/50 group-hover:border-${store.theme.primary}/50
                  `}>
                    <img 
                      src={store.logo} 
                      alt={store.fullName}
                      className="w-full h-full object-contain p-4"
                      onError={(e) => {
                        // Fallback if image fails to load - use textContent instead of innerHTML
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const fallbackText = document.createElement('span');
                          fallbackText.className = `text-4xl font-bold text-${store.theme.primary}`;
                          fallbackText.textContent = store.name;
                          parent.appendChild(fallbackText);
                        }
                      }}
                    />
                  </div>

                  {/* Store Name */}
                  <div className="text-center space-y-2">
                    <h2 className={`text-3xl font-extrabold text-white transition-colors duration-300 group-hover:text-${store.theme.primary}`}>
                      {store.name}
                    </h2>
                    <p className="text-xl font-bold text-gray-400 uppercase tracking-wider">
                      AUTOPART
                    </p>
                    <p className="text-sm text-gray-500">
                      Klik untuk masuk
                    </p>
                  </div>

                  {/* Theme Color Indicators */}
                  <div className="flex gap-2">
                    <div className={`w-8 h-2 rounded-full bg-${store.theme.primary}`}></div>
                    <div className={`w-8 h-2 rounded-full bg-${store.theme.secondary}`}></div>
                  </div>
                </div>

                {/* Shine Effect on Hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center animate-in fade-in duration-700 delay-500">
          <p className="text-gray-500 text-sm">
            Sistem Manajemen Inventory Otomatis
          </p>
        </div>
      </div>
    </div>
  );
};
