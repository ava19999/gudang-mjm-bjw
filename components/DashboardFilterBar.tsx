// FILE: src/components/DashboardFilterBar.tsx
import React from 'react';
import { Search, Plus, Tag, PenTool, AlertTriangle, AlertCircle, LayoutGrid, List, ArrowUpDown } from 'lucide-react';

interface DashboardFilterBarProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  brandSearch: string;
  setBrandSearch: (val: string) => void;
  appSearch: string;
  setAppSearch: (val: string) => void;
  filterType: 'all' | 'low' | 'empty';
  setFilterType: (val: 'all' | 'low' | 'empty') => void;
  viewMode: 'grid' | 'list';
  setViewMode: (val: 'grid' | 'list') => void;
  priceSort: 'none' | 'asc' | 'desc';
  setPriceSort: (val: 'none' | 'asc' | 'desc') => void;
  onAddNew: () => void;
}

export const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({
  searchTerm, setSearchTerm,
  brandSearch, setBrandSearch,
  appSearch, setAppSearch,
  filterType, setFilterType,
  viewMode, setViewMode,
  priceSort, setPriceSort,
  onAddNew
}) => {
  return (
    <div className="bg-gray-800 border-b border-gray-700 shadow-md">
      <div className="px-4 pb-3 pt-2">
        {/* Main Search & Add Button */}
        <div className="flex gap-2 items-center mb-2">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Cari nama / part number..." 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/50 outline-none text-white placeholder-gray-400" 
                />
            </div>
            <button onClick={onAddNew} className="bg-blue-600 text-white p-2.5 rounded-xl shadow-md hover:bg-blue-700 active:scale-95 transition-all">
              <Plus size={20} />
            </button>
        </div>
        
        {/* Secondary Filters */}
        <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input type="text" placeholder="Filter Brand..." value={brandSearch} onChange={(e) => setBrandSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/50 outline-none text-white placeholder-gray-500" />
            </div>
            <div className="relative">
                <PenTool className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input type="text" placeholder="Filter Aplikasi..." value={appSearch} onChange={(e) => setAppSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/50 outline-none text-white placeholder-gray-500" />
            </div>
        </div>

        {/* Filter Harga (BARU) */}
        <div className="relative mb-2">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <select 
                value={priceSort} 
                onChange={(e) => setPriceSort(e.target.value as 'none' | 'asc' | 'desc')} 
                className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/50 outline-none text-white appearance-none cursor-pointer"
            >
                <option value="none">Urutkan Harga...</option>
                <option value="asc">Harga: Termurah ke Termahal</option>
                <option value="desc">Harga: Termahal ke Termurah</option>
            </select>
        </div>

        {/* Filter Buttons & View Mode */}
        <div className="flex justify-between items-center">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
                <button onClick={() => setFilterType('all')} className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all border whitespace-nowrap ${filterType === 'all' ? 'bg-gray-700 text-white border-gray-600' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}>Semua</button>
                <button onClick={() => setFilterType('low')} className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all border whitespace-nowrap flex items-center gap-1 ${filterType === 'low' ? 'bg-yellow-400 text-black border-yellow-500' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}><AlertTriangle size={12}/> Menipis</button>
                <button onClick={() => setFilterType('empty')} className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all border whitespace-nowrap flex items-center gap-1 ${filterType === 'empty' ? 'bg-red-900/30 text-red-400 border-red-900/50' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}><AlertCircle size={12}/> Habis</button>
            </div>
            <div className="flex bg-gray-800 p-1 rounded-lg ml-2 border border-gray-700">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-gray-700 shadow-sm text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}><LayoutGrid size={16}/></button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-gray-700 shadow-sm text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}><List size={16}/></button>
            </div>
        </div>
      </div>
    </div>
  );
};