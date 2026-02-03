// FILE: src/components/orders/OrderModals.tsx
import React from 'react';
import { FileText, Save, Loader, X, RotateCcw } from 'lucide-react';
import { Order } from '../../types';

interface NoteModalProps {
    isOpen: boolean;
    noteText: string;
    setNoteText: (text: string) => void;
    onClose: () => void;
    onSave: () => void;
    isSaving: boolean;
}

export const NoteModal: React.FC<NoteModalProps> = ({ isOpen, noteText, setNoteText, onClose, onSave, isSaving }) => {
    if (!isOpen) return null;
    return (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-700">
                <div className="bg-purple-900/30 px-4 py-3 border-b border-purple-800 flex justify-between items-center">
                    <h3 className="text-base font-bold text-purple-300 flex items-center gap-2"><FileText size={18}/> Edit Keterangan</h3>
                    <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-200"/></button>
                </div>
                <div className="p-4">
                    <textarea className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-900/50 outline-none text-sm min-h-[100px] text-gray-100 placeholder-gray-500" placeholder="Masukkan alasan atau catatan..." value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                </div>
                <div className="p-3 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:bg-gray-700 rounded-lg">Batal</button>
                    <button onClick={onSave} disabled={isSaving} className="px-4 py-1.5 text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-lg shadow flex items-center gap-2">
                        {isSaving ? <Loader size={14} className="animate-spin"/> : <Save size={14}/>} Simpan
                    </button>
                </div>
            </div>
        </div>
    );
};

interface ReturnModalProps {
    isOpen: boolean;
    order: Order | null;
    returnQuantities: Record<string, number>;
    setReturnQuantities: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    onClose: () => void;
    onProcess: () => void;
    isProcessing: boolean;
}

export const ReturnModal: React.FC<ReturnModalProps> = ({ isOpen, order, returnQuantities, setReturnQuantities, onClose, onProcess, isProcessing }) => {
    if (!isOpen || !order) return null;
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90%] border border-gray-700">
                <div className="bg-orange-900/30 px-4 py-3 border-b border-orange-800 flex justify-between items-center">
                    <h3 className="text-base font-bold text-orange-300 flex items-center gap-2"><RotateCcw size={18}/> Retur Barang</h3>
                    <button onClick={onClose}><X size={18} className="text-orange-400 hover:text-orange-200"/></button>
                </div>
                <div className="p-4 overflow-y-auto text-sm">
                    <div className="space-y-2">
                        {order.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-2 border border-gray-700 rounded-lg hover:border-orange-700/50">
                                <div className="flex-1">
                                    <div className="font-bold text-gray-200 text-xs">{item.name}</div>
                                    <div className="text-[10px] text-gray-500 font-mono">{item.partNumber}</div>
                                </div>
                                <div className="flex items-center gap-2 bg-gray-900 p-1 rounded-lg border border-gray-700">
                                    <button onClick={() => setReturnQuantities(prev => ({...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1)}))} className="w-6 h-6 flex items-center justify-center bg-gray-700 rounded shadow-sm hover:bg-red-900/50 text-gray-300 font-bold">-</button>
                                    <div className="w-6 text-center font-bold text-sm text-gray-200">{returnQuantities[item.id] || 0}</div>
                                    <button onClick={() => setReturnQuantities(prev => ({...prev, [item.id]: Math.min(item.cartQuantity || 0, (prev[item.id] || 0) + 1)}))} className="w-6 h-6 flex items-center justify-center bg-gray-700 rounded shadow-sm hover:bg-green-900/50 text-gray-300 font-bold">+</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="p-3 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:bg-gray-700 rounded-lg">Batal</button>
                    <button onClick={onProcess} disabled={isProcessing} className="px-4 py-1.5 text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 rounded-lg shadow flex items-center gap-2">
                        {isProcessing ? <Loader size={14} className="animate-spin"/> : <Save size={14}/>} Proses
                    </button>
                </div>
            </div>
        </div>
    );
};