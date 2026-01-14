// FILE: src/components/quickInput/QuickInputHeader.tsx
import React from 'react';
import { PackagePlus, Plus, Save, Loader2, PackageMinus } from 'lucide-react';

interface QuickInputHeaderProps {
    onAddRow: () => void;
    onSaveAll: () => void;
    isSaving: boolean;
    validCount: number;
    currentRowCount?: number;
    maxRows?: number;
    mode?: 'in' | 'out';
    onModeChange?: (mode: 'in' | 'out') => void;
}

export const QuickInputHeader: React.FC<QuickInputHeaderProps> = ({ 
    onAddRow, onSaveAll, isSaving, validCount, currentRowCount = 0, maxRows = 15, mode = 'in', onModeChange
}) => {
    const isMaxRows = currentRowCount >= maxRows;

    return (
        <div className="px-4 py-3 bg-gray-800 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-700">
            <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${mode === 'in' ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
                        {mode === 'in' ? (
                            <PackagePlus className="text-green-400" size={20} />
                        ) : (
                            <PackageMinus className="text-red-400" size={20} />
                        )}
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-100">Input Barang</h2>
                        <p className="text-[10px] text-gray-400">
                            {mode === 'in' ? 'Barang Masuk (Incoming Goods)' : 'Barang Keluar Offline (Outgoing Goods)'}
                        </p>
                    </div>
                </div>

                {/* Mode Toggle Switch */}
                {onModeChange && (
                    <div className="flex items-center gap-2 bg-gray-700/50 rounded-lg p-1">
                        <button
                            onClick={() => onModeChange('in')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                mode === 'in' 
                                    ? 'bg-green-600 text-white shadow-md' 
                                    : 'text-gray-400 hover:text-gray-200'
                            }`}
                        >
                            <div className="flex items-center gap-1">
                                <PackagePlus size={14} />
                                Masuk
                            </div>
                        </button>
                        <button
                            onClick={() => onModeChange('out')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                mode === 'out' 
                                    ? 'bg-red-600 text-white shadow-md' 
                                    : 'text-gray-400 hover:text-gray-200'
                            }`}
                        >
                            <div className="flex items-center gap-1">
                                <PackageMinus size={14} />
                                Keluar
                            </div>
                        </button>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                <button
                    onClick={onAddRow}
                    disabled={isMaxRows}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-bold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isMaxRows ? `Maksimal ${maxRows} baris` : 'Tambah baris baru'}
                >
                    <Plus size={14} /> Tambah Baris {isMaxRows && `(${currentRowCount}/${maxRows})`}
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