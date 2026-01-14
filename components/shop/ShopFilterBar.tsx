// FILE: src/components/shop/ShopFilterBar.tsx
import React from 'react';
import { Search, LayoutGrid, List, Package, Tag, PenTool } from 'lucide-react';

interface ShopFilterBarProps {
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    partNumberSearch: string;
    setPartNumberSearch: (val: string) => void;
    nameSearch: string;
    setNameSearch: (val: string) => void;
    brandSearch: string;
    setBrandSearch: (val: string) => void;
    applicationSearch: string;
    setApplicationSearch: (val: string) => void;
    isAdmin: boolean;
    viewMode: 'grid' | 'list';
    setViewMode: (mode: 'grid' | 'list') => void;
}

export const ShopFilterBar: React.FC<ShopFilterBarProps> = ({
    searchTerm, setSearchTerm,
    partNumberSearch, setPartNumberSearch,
    nameSearch, setNameSearch,
    brandSearch, setBrandSearch,
    applicationSearch, setApplicationSearch,
    isAdmin, viewMode, setViewMode
}) => {
    return (
        <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur-sm pt-2 pb-2 -mx-2 px-2 md:mx-0 md:px-0 space-y-3 border-b border-gray-800">
            {/* Main Search Box - Search All Fields */}
            <div className="flex gap-2">
                <div className="relative w-full group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Search size={18} className="text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Cari semua..." 
                        className="pl-10 pr-4 py-3 w-full bg-gray-800 border border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none shadow-sm transition-all text-white placeholder-gray-500" 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="bg-gray-800 rounded-xl p-1 flex shadow-sm border border-gray-700">
                    <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}><LayoutGrid size={18}/></button>
                    <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}><List size={18}/></button>
                </div>
            </div>

            {/* Individual Search Boxes */}
            <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                    <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input 
                        type="text" 
                        placeholder="Part Number..." 
                        value={partNumberSearch} 
                        onChange={(e) => setPartNumberSearch(e.target.value)} 
                        className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/50 outline-none text-white placeholder-gray-500" 
                    />
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input 
                        type="text" 
                        placeholder="Nama Barang..." 
                        value={nameSearch} 
                        onChange={(e) => setNameSearch(e.target.value)} 
                        className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/50 outline-none text-white placeholder-gray-500" 
                    />
                </div>
                <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input 
                        type="text" 
                        placeholder="Brand..." 
                        value={brandSearch} 
                        onChange={(e) => setBrandSearch(e.target.value)} 
                        className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/50 outline-none text-white placeholder-gray-500" 
                    />
                </div>
                <div className="relative">
                    <PenTool className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input 
                        type="text" 
                        placeholder="Aplikasi..." 
                        value={applicationSearch} 
                        onChange={(e) => setApplicationSearch(e.target.value)} 
                        className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/50 outline-none text-white placeholder-gray-500" 
                    />
                </div>
            </div>
        </div>
    );
};