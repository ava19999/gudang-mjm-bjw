// FILE: src/components/shop/ShopPagination.tsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ShopPaginationProps {
    page: number;
    totalPages: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
}

export const ShopPagination: React.FC<ShopPaginationProps> = ({ page, totalPages, setPage }) => {
    return (
        <div className="flex justify-between items-center mt-8 bg-gray-800/90 backdrop-blur p-3 rounded-xl border border-gray-700 shadow-sm sticky bottom-20 md:bottom-4 z-20">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center gap-1 text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft size={16} /> Sebelumnya</button>
            <span className="text-xs font-medium text-gray-500">Halaman <span className="font-bold text-gray-200">{page}</span> dari {totalPages || 1}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="flex items-center gap-1 text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed">Selanjutnya <ChevronRight size={16} /></button>
        </div>
    );
};