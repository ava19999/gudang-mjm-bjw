// FILE: src/components/quickInput/QuickInputFooter.tsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface QuickInputFooterProps {
    totalRows: number;
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export const QuickInputFooter: React.FC<QuickInputFooterProps> = ({ totalRows, currentPage, totalPages, onPageChange }) => {
    if (totalRows === 0) return null;

    return (
        <div className="px-4 py-2 bg-gray-800 flex items-center justify-between text-[10px] text-gray-500 border-t border-gray-700 sticky bottom-0">
            <div>{totalRows} Baris Data</div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"
                >
                    <ChevronLeft size={14} />
                </button>
                <span>Hal {currentPage}</span>
                <button
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"
                >
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
};