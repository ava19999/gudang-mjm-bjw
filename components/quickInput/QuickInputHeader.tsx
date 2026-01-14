// FILE: src/components/quickInput/QuickInputHeader.tsx
import React from 'react';
import { PackagePlus, Plus, Save, Loader2 } from 'lucide-react';

interface QuickInputHeaderProps {
    onAddRow: () => void;
    onSaveAll: () => void;
    isSaving: boolean;
    validCount: number;
}

export const QuickInputHeader: React.FC<QuickInputHeaderProps> = ({ 
    onAddRow, onSaveAll, isSaving, validCount
}) => {
    return (
        <div className="px-4 py-3 bg-gray-800 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-700">
            <div className="flex items-center gap-2">
                <div className="p-2 bg-green-900/30 rounded-lg">
                    <PackagePlus className="text-green-400" size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-gray-100">Input Barang</h2>
                    <p className="text-[10px] text-gray-400">Barang Masuk (Incoming Goods)</p>
                </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                <button
                    onClick={onAddRow}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-bold rounded-lg flex items-center gap-2 transition-colors"
                >
                    <Plus size={14} /> Tambah Baris
                </button>
                <button
                    onClick={onSaveAll}
                    disabled={isSaving || validCount === 0}
                    className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg shadow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Simpan ({validCount})
                </button>
            </div>
        </div>
    );
};