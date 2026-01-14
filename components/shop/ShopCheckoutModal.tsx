// FILE: src/components/shop/ShopCheckoutModal.tsx
import React, { useState } from 'react';

interface ShopCheckoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (finalName: string, tempo: string, note: string) => void;
}

export const ShopCheckoutModal: React.FC<ShopCheckoutModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const [customerNameInput, setCustomerNameInput] = useState(''); 
    const [tempoInput, setTempoInput] = useState('');
    const [noteInput, setNoteInput] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(customerNameInput.trim()) { 
            let finalName = customerNameInput;
            if(tempoInput.trim()) finalName += ` (Tempo: ${tempoInput})`;
            if(noteInput.trim()) finalName += ` (Note: ${noteInput})`;
            
            onConfirm(finalName, tempoInput, noteInput);
            setCustomerNameInput(''); 
            setTempoInput('');
            setNoteInput('');
        } 
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-gray-800 rounded-3xl shadow-2xl w-full max-w-sm relative overflow-hidden animate-in zoom-in-95 border border-gray-700">
                <div className="bg-gray-900 px-6 py-4 border-b border-gray-700">
                    <h3 className="text-lg font-bold text-gray-100">Konfirmasi Pesanan</h3>
                </div>
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Nama Customer</label>
                            <input 
                                type="text" 
                                required 
                                autoFocus 
                                value={customerNameInput} 
                                onChange={(e) => setCustomerNameInput(e.target.value)} 
                                className="w-full p-3 border border-gray-600 bg-gray-700 rounded-xl mt-1 text-white placeholder-gray-500 outline-none focus:border-blue-500" 
                                placeholder="Nama customer..." 
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Tempo</label>
                            <input 
                                type="text" 
                                value={tempoInput} 
                                onChange={(e) => setTempoInput(e.target.value)} 
                                className="w-full p-3 border border-gray-600 bg-gray-700 rounded-xl mt-1 text-white placeholder-gray-500 outline-none focus:border-blue-500" 
                                placeholder="Contoh: 7 hari, 14 hari..." 
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Note</label>
                            <textarea 
                                value={noteInput} 
                                onChange={(e) => setNoteInput(e.target.value)} 
                                className="w-full p-3 border border-gray-600 bg-gray-700 rounded-xl mt-1 text-white placeholder-gray-500 outline-none focus:border-blue-500 resize-none" 
                                placeholder="Catatan tambahan..." 
                                rows={3}
                            />
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-3">
                        <button type="button" onClick={onClose} className="py-3 bg-gray-700 text-gray-300 font-bold rounded-xl hover:bg-gray-600">Batal</button>
                        <button type="submit" disabled={!customerNameInput.trim()} className="py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50">Kirim</button>
                    </div>
                </form>
            </div>
        </div>
    );
};