// FILE: src/components/quickInput/QuickInputTableRow.tsx
import React, { useEffect, useRef, useState } from 'react';
import { QuickInputRow } from './types';
import { InventoryItem } from '../../types';
import { checkIsRowComplete } from './quickInputUtils';
import { fetchPriceHistoryBySource } from '../../services/supabaseService'; // Import service history
import { formatRupiah } from '../../utils';
import { Loader2, AlertCircle, Check, Trash2, History, X } from 'lucide-react';

interface QuickInputTableRowProps {
    row: QuickInputRow & { totalModal?: number }; // Extend tipe lokal
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

    // State untuk History Popup
    const [showHistory, setShowHistory] = useState(false);
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Constants
    const COLS = 8;
    const baseRefIndex = globalIndex * COLS;

    // --- LOGIC CALCULASI TOTAL & UNIT ---
    
    // 1. Saat Qty Berubah -> Hitung Ulang Unit (Modal Satuan)
    // Rumus: Unit = TotalSaatIni / QtyBaru
    const handleQtyChange = (valStr: string) => {
        const cleanVal = valStr.replace(/[^0-9]/g, '');
        const newQty = cleanVal === '' ? 0 : parseInt(cleanVal, 10);
        
        // Ambil total modal saat ini (default 0)
        const currentTotal = row.totalModal || 0;
        
        // Hitung harga satuan baru
        const newUnitPrice = newQty > 0 ? (currentTotal / newQty) : 0;

        onUpdateRow(row.id, {
            quantity: newQty,
            hargaModal: newUnitPrice
        });
    };

    // 2. Saat Total Modal Berubah -> Hitung Ulang Unit (Modal Satuan)
    // Rumus: Unit = TotalBaru / QtySaatIni
    const handleTotalModalChange = (valStr: string) => {
        const cleanVal = valStr.replace(/[^0-9]/g, '');
        const newTotal = cleanVal === '' ? 0 : parseInt(cleanVal, 10);
        
        const currentQty = row.quantity > 0 ? row.quantity : 1;
        const newUnitPrice = newTotal / currentQty;

        onUpdateRow(row.id, {
            totalModal: newTotal,
            hargaModal: newUnitPrice
        });
    };

    // Helper umum
    const handleNumberChange = (field: keyof QuickInputRow, value: string) => {
        const cleanValue = value.replace(/[^0-9]/g, '');
        const numValue = cleanValue === '' ? 0 : parseInt(cleanValue, 10);
        onUpdateRow(row.id, field, numValue);
    };

    // --- LOGIC HISTORY ---
    const handleShowHistory = async () => {
        if (!row.partNumber) return;
        if (showHistory) {
            setShowHistory(false);
            return;
        }
        
        setShowHistory(true);
        setLoadingHistory(true);
        try {
            const data = await fetchPriceHistoryBySource(row.partNumber);
            setHistoryData(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleSelectHistory = (unitPrice: number) => {
        const qty = row.quantity > 0 ? row.quantity : 1;
        const newTotal = unitPrice * qty;
        
        onUpdateRow(row.id, {
            hargaModal: unitPrice,
            totalModal: newTotal
        });
        setShowHistory(false);
    };

    useEffect(() => {
        if (activeSearchIndex === index && activeItemRef.current) {
            activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [highlightedIndex, activeSearchIndex, index]);

    return (
        <tr className={`hover:bg-gray-700/20 border-b border-gray-700/50 ${row.error ? 'bg-red-900/10' : ''}`}>
            <td className="px-2 py-1.5 text-gray-500 font-mono text-center text-[10px]">
                {globalIndex + 1}
            </td>

            {/* KOLOM 0: Part Number */}
            <td className="px-2 py-1.5 relative">
                <div className="relative">
                    <input
                        ref={el => { inputRefs.current[baseRefIndex + 0] = el; }}
                        type="text"
                        className={`w-full bg-transparent px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:text-blue-400 font-bold placeholder-gray-600 ${row.error ? 'text-red-400' : ''}`}
                        value={row.partNumber}
                        onChange={(e) => onPartNumberChange(row.id, e.target.value)}
                        onKeyDown={(e) => onSearchKeyDown(e, row.id)}
                        placeholder="Cari..."
                        autoComplete="off"
                    />
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

            {/* KOLOM 1: Nama Barang */}
            <td className="px-2 py-1.5">
                <input
                    ref={el => { inputRefs.current[baseRefIndex + 1] = el; }}
                    type="text"
                    className="w-full bg-transparent px-1 py-1 text-xs text-gray-300 font-medium focus:outline-none focus:text-blue-400 placeholder-gray-600"
                    value={row.namaBarang}
                    onChange={(e) => onUpdateRow(row.id, 'namaBarang', e.target.value)}
                    onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 1)}
                    placeholder="Nama Barang"
                />
            </td>

            {/* KOLOM 2: Quantity (Logic Update) */}
            <td className="px-2 py-1.5">
                <input
                    ref={el => { inputRefs.current[baseRefIndex + 2] = el; }}
                    type="text"
                    inputMode="numeric"
                    className={`w-full bg-transparent px-1 py-1 text-xs font-bold text-right font-mono focus:outline-none ${row.operation === 'in' ? 'text-green-400' : 'text-red-400'} ${row.error ? 'text-red-400' : ''}`}
                    value={row.quantity || ''}
                    onChange={(e) => handleQtyChange(e.target.value)}
                    onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 2)}
                    placeholder="0"
                />
            </td>

            {/* KOLOM 3: Modal (INPUT TOTAL) + HISTORY ICON */}
            <td className="px-2 py-1.5 relative group/modal">
                <div className="flex items-center">
                    <input
                        ref={el => { inputRefs.current[baseRefIndex + 3] = el; }}
                        type="text"
                        inputMode="numeric"
                        // Tampilkan Total Modal. Jika undefined, fallback ke 0.
                        value={row.totalModal || ''} 
                        onChange={(e) => handleTotalModalChange(e.target.value)}
                        onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 3)}
                        className="w-full bg-transparent px-1 py-1 text-xs font-mono text-right text-orange-300 focus:outline-none focus:text-orange-400 placeholder-gray-600"
                        placeholder="Total..."
                        title={`Satuan: ${formatRupiah(row.hargaModal)}`}
                    />
                    <button 
                        onClick={handleShowHistory}
                        className="ml-1 p-1 text-gray-600 hover:text-orange-400 transition-colors opacity-0 group-hover/modal:opacity-100 focus:opacity-100"
                        title="Riwayat Harga"
                    >
                        <History size={10} />
                    </button>
                </div>

                {/* DROPDOWN HISTORY */}
                {showHistory && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-30 overflow-hidden">
                        <div className="flex justify-between items-center p-2 bg-gray-900 border-b border-gray-700">
                            <span className="text-[9px] font-bold text-gray-400 uppercase">Riwayat Harga</span>
                            <button onClick={() => setShowHistory(false)}><X size={10} className="text-gray-500 hover:text-white"/></button>
                        </div>
                        <div className="max-h-32 overflow-y-auto">
                            {loadingHistory ? (
                                <div className="p-2 text-center text-gray-500"><Loader2 size={12} className="animate-spin inline"/></div>
                            ) : historyData.length === 0 ? (
                                <div className="p-2 text-center text-[10px] text-gray-500">Kosong</div>
                            ) : (
                                historyData.map((h, i) => (
                                    <div key={i} onClick={() => handleSelectHistory(h.price)} className="px-2 py-1.5 hover:bg-gray-700 cursor-pointer flex justify-between items-center border-b border-gray-700/50 last:border-0">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-blue-300 font-bold">{h.source}</span>
                                            <span className="text-[8px] text-gray-500">{h.date}</span>
                                        </div>
                                        <span className="text-[10px] font-mono font-bold text-gray-200">{formatRupiah(h.price)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </td>

            {/* KOLOM 4: Harga Jual */}
            <td className="px-2 py-1.5">
                <input
                    ref={el => { inputRefs.current[baseRefIndex + 4] = el; }}
                    type="text"
                    inputMode="numeric"
                    className="w-full bg-transparent px-1 py-1 text-xs font-mono text-right text-blue-300 focus:outline-none focus:text-blue-400 placeholder-gray-600"
                    value={row.hargaJual || ''}
                    onChange={(e) => handleNumberChange('hargaJual', e.target.value)}
                    onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 4)}
                    placeholder="0"
                />
            </td>

            {/* KOLOM 5: Via */}
            <td className="px-2 py-1.5">
                <input
                    ref={el => { inputRefs.current[baseRefIndex + 5] = el; }}
                    type="text"
                    className="w-full bg-transparent px-1 py-1 text-xs text-gray-300 focus:outline-none focus:text-blue-400 placeholder-gray-600"
                    value={row.via}
                    onChange={(e) => onUpdateRow(row.id, 'via', e.target.value)}
                    onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 5)}
                    placeholder="Via"
                />
            </td>

            {/* KOLOM 6: Customer */}
            <td className="px-2 py-1.5">
                <input
                    ref={el => { inputRefs.current[baseRefIndex + 6] = el; }}
                    type="text"
                    className="w-full bg-transparent px-1 py-1 text-xs text-gray-300 focus:outline-none focus:text-blue-400 placeholder-gray-600"
                    value={row.customer}
                    onChange={(e) => onUpdateRow(row.id, 'customer', e.target.value)}
                    onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 6)}
                    placeholder="Customer"
                />
            </td>

            {/* KOLOM 7: Resi/Tempo */}
            <td className="px-2 py-1.5">
                <input
                    ref={el => { inputRefs.current[baseRefIndex + 7] = el; }}
                    type="text"
                    className="w-full bg-transparent px-1 py-1 text-xs text-gray-300 focus:outline-none focus:text-blue-400 placeholder-gray-600"
                    value={row.resiTempo}
                    onChange={(e) => onUpdateRow(row.id, 'resiTempo', e.target.value)}
                    onKeyDown={(e) => onGridKeyDown(e, baseRefIndex + 7)}
                    placeholder="Ket..."
                />
            </td>

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

            <td className="px-2 py-1.5 text-center">
                <button
                    onClick={() => onRemoveRow(row.id)}
                    className="p-1 hover:text-red-300 text-red-400 transition-colors opacity-50 hover:opacity-100"
                >
                    <Trash2 size={12} />
                </button>
            </td>
        </tr>
    );
};