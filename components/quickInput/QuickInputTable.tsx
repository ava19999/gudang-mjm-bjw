// FILE: src/components/quickInput/QuickInputTable.tsx
import React from 'react';
import { QuickInputRow } from './types';
import { InventoryItem } from '../../types';
import { QuickInputTableRow } from './QuickInputTableRow';

interface QuickInputTableProps {
    currentRows: QuickInputRow[];
    startIndex: number;
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

export const QuickInputTable: React.FC<QuickInputTableProps> = ({
    currentRows, startIndex, activeSearchIndex, suggestions, inputRefs,
    onPartNumberChange, onSelectItem, onUpdateRow, onRemoveRow, highlightedIndex, onSearchKeyDown, onGridKeyDown
}) => {
    return (
        <div className="flex-1 overflow-auto p-2">
            <div className="overflow-x-auto min-w-[1400px]">
                <table className="w-full text-left">
                    <thead className="bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700 sticky top-0 z-10">
                        <tr>
                            <th className="px-2 py-2 w-8 text-center">#</th>
                            <th className="px-2 py-2 w-28">Tanggal</th>
                            <th className="px-2 py-2 w-24">Tempo</th>
                            <th className="px-2 py-2 w-32">Customer</th>
                            <th className="px-2 py-2 w-48">Part Number</th>
                            <th className="px-2 py-2 w-16 text-right">Qty Masuk</th>
                            <th className="px-2 py-2 w-32 text-right">Total Harga</th>
                            <th className="px-2 py-2 w-28 text-right">Harga Satuan</th>
                            <th className="px-2 py-2 w-16 text-center">Status</th>
                            <th className="px-2 py-2 w-8 text-center"></th>
                        </tr>
                    </thead>
                    <tbody className="text-xs">
                        {currentRows.map((row, index) => (
                            <QuickInputTableRow
                                key={row.id}
                                row={row}
                                index={index}
                                globalIndex={startIndex + index}
                                activeSearchIndex={activeSearchIndex}
                                suggestions={suggestions}
                                inputRefs={inputRefs}
                                onPartNumberChange={onPartNumberChange}
                                onSelectItem={onSelectItem}
                                onUpdateRow={onUpdateRow}
                                onRemoveRow={onRemoveRow}
                                highlightedIndex={highlightedIndex}
                                onSearchKeyDown={onSearchKeyDown}
                                onGridKeyDown={onGridKeyDown}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};