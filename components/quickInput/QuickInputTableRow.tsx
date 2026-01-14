// FILE: src/components/quickInput/QuickInputTableRow.tsx
import React, { useEffect, useRef, useState } from 'react';
import { QuickInputRow } from './types';
import { InventoryItem } from '../../types';
import { checkIsRowComplete } from './quickInputUtils';
import { formatRupiah } from '../../utils';
import { Loader2, AlertCircle, Check, Trash2, Info } from 'lucide-react';

interface QuickInputTableRowProps {
    row: QuickInputRow;
    index: number;
    globalIndex: number;
    activeSearchIndex: number | null;
    suggestions: InventoryItem[];
    inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
    onPartNumberChange: (id: number, val: string) => void;
    onSelectItem: (id: number, item: InventoryItem) => void;
    onUpdateRow: (id: number, updates: any, value?: any) => void;
    onRemoveRow: (id: number) => void;
    highlightedIndex: number;
    onSearchKeyDown: (e: React.KeyboardEvent, id: number) => void;
    onGridKeyDown: (e: React.KeyboardEvent, globalRefIndex: number) => void;
}

export const QuickInputTableRow: React.FC<QuickInputTableRowProps> = ({
    row, index, globalIndex, activeSearchIndex, suggestions, inputRefs,
    onPartNumberChange, onSelectItem, onUpdateRow, onRemoveRow, highlightedIndex, onSearchKeyDown, onGridKeyDown
}) => {
    const isComplete = checkIsRowComplete(row);
    const activeItemRef = useRef<HTMLDivElement>(null);
    const [showItemDetails, setShowItemDetails] = useState(false);

    // Constants - Now 8 input columns
    const COLS = 8;
    const baseRefIndex = globalIndex * COLS;

    // Payment terms options
    const tempoOptions = ['CASH', '3 BLN', '2 BLN', '1 BLN'];

    // --- CALCULATION LOGIC ---
    
    // When Qty Masuk changes -> recalculate Harga Satuan
    const handleQtyMasukChange = (valStr: string) => {
        const cleanVal = valStr.replace(/[^0-9]/g, '');
        const newQty = cleanVal === '' ? 0 : parseInt(cleanVal, 10);
        
        const currentTotal = row.totalHarga || 0;
        const newUnitPrice = newQty > 0 ? (currentTotal / newQty) : 0;

        onUpdateRow(row.id, {
            qtyMasuk: newQty,
            hargaSatuan: newUnitPrice
        });
    };

    // When Total Harga changes -> recalculate Harga Satuan
    const handleTotalHargaChange = (valStr: string) => {
        const cleanVal = valStr.replace(/[^0-9]/g, '');
        const newTotal = cleanVal === '' ? 0 : parseInt(cleanVal, 10);
        
        // Only calculate if qtyMasuk > 0 to avoid division by zero
        if (row.qtyMasuk > 0) {
            const newUnitPrice = newTotal / row.qtyMasuk;
            onUpdateRow(row.id, {
                totalHarga: newTotal,
                hargaSatuan: newUnitPrice
            });
        } else {
            // If qtyMasuk is 0, just update totalHarga
            onUpdateRow(row.id, {
                totalHarga: newTotal,
                hargaSatuan: 0
            });
        }
    };

    useEffect(() => {
        if (activeSearchIndex === index && activeItemRef.current) {
            activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [highlightedIndex, activeSearchIndex, index]);

    return (
        <>
            <tr className={`hover:bg-gray-700/20 border-b border-gray-700/50 ${row.error ? 'bg-red-900/10' : ''}`}>
                {/* Row Number */}
                <td className="px-2 py-1.5 text-gray-500 font-mono text-center text-[10px]">
                    {globalIndex + 1}
                </td>

                {/* COL 0: Tanggal */}
                <td className="px-2 py-1.5">
                    <input
                        ref={el => { inputRefs.current[baseRefIndex + 0] = el; }}
                        type="date"
                        className="w-full bg-transparent px-2 py-1 text-xs text-gray-200 focus:outline-none focus:text-blue-400 placeholder-gray-600"
                        value={row.tanggal}
                        onChange={(e) => onUpdateRow(row.id, 'tanggal', e.target.value)}
                        onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 0)}
                    />
                </td>

                {/* COL 1: Tempo (Dropdown) */}
                <td className="px-2 py-1.5">
                    <select
                        ref={el => { inputRefs.current[baseRefIndex + 1] = el as any; }}
                        className="w-full bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:text-blue-400 rounded border border-gray-600"
                        value={row.tempo}
                        onChange={(e) => onUpdateRow(row.id, 'tempo', e.target.value)}
                        onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 1)}
                    >
                        {tempoOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                </td>

                {/* COL 2: Customer */}
                <td className="px-2 py-1.5">
                    <input
                        ref={el => { inputRefs.current[baseRefIndex + 2] = el; }}
                        type="text"
                        className="w-full bg-transparent px-2 py-1 text-xs text-gray-300 focus:outline-none focus:text-blue-400 placeholder-gray-600"
                        value={row.customer}
                        onChange={(e) => onUpdateRow(row.id, 'customer', e.target.value)}
                        onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 2)}
                        placeholder="Customer"
                    />
                </td>

                {/* COL 3: Part Number (with suggestions) */}
                <td className="px-2 py-1.5 relative">
                    <div className="relative flex items-center gap-1">
                        <input
                            ref={el => { inputRefs.current[baseRefIndex + 3] = el; }}
                            type="text"
                            className={`flex-1 bg-transparent px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:text-blue-400 font-bold placeholder-gray-600 ${row.error ? 'text-red-400' : ''}`}
                            value={row.partNumber}
                            onChange={(e) => onPartNumberChange(row.id, e.target.value)}
                            onKeyDown={(e) => onSearchKeyDown(e, row.id)}
                            placeholder="Part Number..."
                            autoComplete="off"
                        />
                        {/* Show info icon when item details are available */}
                        {(row.namaBarang || row.brand || row.aplikasi || row.qtySaatIni) && (
                            <button
                                onClick={() => setShowItemDetails(!showItemDetails)}
                                className="text-blue-400 hover:text-blue-300 transition-colors"
                                title="Show item details"
                            >
                                <Info size={12} />
                            </button>
                        )}
                        {activeSearchIndex === index && suggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto border border-gray-600">
                                {suggestions.map((item, idx) => (
                                    <div
                                        key={idx}
                                        ref={idx === highlightedIndex ? activeItemRef : null}
                                        className={`px-3 py-2 cursor-pointer border-b border-gray-700 last:border-0 transition-colors ${
                                            idx === highlightedIndex 
                                            ? 'bg-gray-700 border-l-2 border-orange-400' 
                                            : 'hover:bg-gray-700'
                                        }`}
                                        onClick={() => onSelectItem(row.id, item)}
                                    >
                                        <div className="font-bold text-orange-400 font-mono text-xs">{item.partNumber}</div>
                                        <div className="text-gray-400 text-[10px] truncate">{item.name}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </td>

                {/* COL 4: Qty Masuk */}
                <td className="px-2 py-1.5">
                    <input
                        ref={el => { inputRefs.current[baseRefIndex + 4] = el; }}
                        type="text"
                        inputMode="numeric"
                        className="w-full bg-transparent px-1 py-1 text-xs font-bold text-right font-mono text-green-400 focus:outline-none focus:text-green-300 placeholder-gray-600"
                        value={row.qtyMasuk || ''}
                        onChange={(e) => handleQtyMasukChange(e.target.value)}
                        onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 4)}
                        placeholder="0"
                    />
                </td>

                {/* COL 5: Total Harga */}
                <td className="px-2 py-1.5">
                    <input
                        ref={el => { inputRefs.current[baseRefIndex + 5] = el; }}
                        type="text"
                        inputMode="numeric"
                        className="w-full bg-transparent px-1 py-1 text-xs font-mono text-right text-orange-300 focus:outline-none focus:text-orange-400 placeholder-gray-600"
                        value={row.totalHarga || ''}
                        onChange={(e) => handleTotalHargaChange(e.target.value)}
                        onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 5)}
                        placeholder="Total..."
                    />
                </td>

                {/* COL 6: Harga Satuan (Read-only, calculated) */}
                <td className="px-2 py-1.5">
                    <div className="px-1 py-1 text-xs font-mono text-right text-blue-300 opacity-70" title="Auto-calculated: Total / Qty">
                        {formatRupiah(row.hargaSatuan)}
                    </div>
                </td>

                {/* Status */}
                <td className="px-2 py-1.5 text-center">
                    <div className="flex items-center justify-center">
                        {row.isLoading ? (
                            <Loader2 size={12} className="animate-spin text-blue-400" />
                        ) : row.error ? (
                            <div className="relative group">
                                <AlertCircle size={12} className="text-red-400 cursor-help" />
                                <div className="absolute right-full top-0 mr-2 w-32 p-1.5 bg-red-900 text-red-100 text-[9px] rounded shadow-lg z-50 hidden group-hover:block">
                                    {row.error}
                                </div>
                            </div>
                        ) : isComplete ? (
                            <Check size={12} className="text-green-400" />
                        ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-700" title="Belum Lengkap"></div>
                        )}
                    </div>
                </td>

                {/* Delete Button */}
                <td className="px-2 py-1.5 text-center">
                    <button
                        onClick={() => onRemoveRow(row.id)}
                        className="p-1 hover:text-red-300 text-red-400 transition-colors opacity-50 hover:opacity-100"
                    >
                        <Trash2 size={12} />
                    </button>
                </td>
            </tr>

            {/* Item Details Row (expandable) */}
            {showItemDetails && (row.namaBarang || row.brand || row.aplikasi || row.qtySaatIni !== undefined) && (
                <tr className="bg-blue-900/10 border-b border-gray-700/50">
                    <td colSpan={10} className="px-4 py-2">
                        <div className="text-xs text-gray-300 grid grid-cols-4 gap-2">
                            {row.namaBarang && (
                                <div>
                                    <span className="text-gray-500 text-[10px]">Nama Barang:</span>
                                    <div className="font-medium text-gray-200">{row.namaBarang}</div>
                                </div>
                            )}
                            {row.brand && (
                                <div>
                                    <span className="text-gray-500 text-[10px]">Brand:</span>
                                    <div className="font-medium text-gray-200">{row.brand}</div>
                                </div>
                            )}
                            {row.aplikasi && (
                                <div>
                                    <span className="text-gray-500 text-[10px]">Aplikasi:</span>
                                    <div className="font-medium text-gray-200">{row.aplikasi}</div>
                                </div>
                            )}
                            {row.qtySaatIni !== undefined && (
                                <div>
                                    <span className="text-gray-500 text-[10px]">Qty Saat Ini:</span>
                                    <div className="font-medium text-green-400">{row.qtySaatIni}</div>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};
