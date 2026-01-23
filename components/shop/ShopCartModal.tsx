// FILE: src/components/shop/ShopCartModal.tsx
import React from 'react';
import { CartItem } from '../../types';
import { formatRupiah } from '../../utils';
import { X, Package, Minus, Plus, ShoppingCart } from 'lucide-react';

interface ShopCartModalProps {
    isOpen: boolean;
    onClose: () => void;
    cart: CartItem[];
    onRemoveFromCart: (id: string) => void;
    onUpdateCartItem: (id: string, changes: Partial<CartItem>) => void;
    onCheckoutClick: () => void;
}

export const ShopCartModal: React.FC<ShopCartModalProps> = ({ 
    isOpen, onClose, cart, onRemoveFromCart, onUpdateCartItem, onCheckoutClick 
}) => {
    if (!isOpen) return null;

    const cartTotal = cart.reduce((sum, item) => sum + ((item.customPrice ?? item.price) * item.cartQuantity), 0);

    return (
        <div className="fixed inset-0 z-[60] flex justify-end">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-md bg-gray-800 h-full shadow-2xl flex flex-col animate-in slide-in-from-right border-l border-gray-700">
                <div className="px-5 py-4 border-b border-gray-700 flex justify-between items-center bg-gray-800">
                    <h2 className="text-lg font-bold text-gray-100">Keranjang</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20}/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900">
                    {cart.map(item => (
                        <div key={item.id} className="bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-700 relative group">
                            <button onClick={() => onRemoveFromCart(item.id)} className="absolute top-2 right-2 text-gray-600 hover:text-red-500 transition-colors">
                                <X size={16}/>
                            </button>

                            <div className="flex gap-3 mb-3">
                                <div className="w-14 h-14 bg-gray-700 rounded-lg overflow-hidden flex-shrink-0">
                                    {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer"/> : <div className="h-full flex items-center justify-center text-gray-500"><Package size={16}/></div>}
                                </div>
                                <div className="flex-1 pr-4">
                                    <h4 className="text-sm font-bold line-clamp-2 leading-snug text-gray-200">{item.name}</h4>
                                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">{item.partNumber}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                                <div className="flex items-center gap-2 bg-gray-700 rounded-lg p-1">
                                    <button onClick={() => onUpdateCartItem(item.id, { cartQuantity: Math.max(0, item.cartQuantity - 1) })} className="w-6 h-6 flex items-center justify-center bg-gray-600 rounded text-gray-300 shadow-sm hover:bg-gray-500 active:scale-95"><Minus size={12}/></button>
                                    <span className="text-xs font-bold w-4 text-center text-gray-200">{item.cartQuantity}</span>
                                    <button onClick={() => onUpdateCartItem(item.id, { cartQuantity: item.cartQuantity + 1 })} className="w-6 h-6 flex items-center justify-center bg-gray-600 rounded text-gray-300 shadow-sm hover:bg-gray-500 active:scale-95"><Plus size={12}/></button>
                                </div>

                                <div className="text-right">
                                    <div className="flex flex-col items-end">
                                        <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-300 font-bold">Rp</span>
                                            <input 
                                                type="number"
                                                className="w-24 pl-6 pr-2 py-1 text-right text-xs font-bold border border-blue-900 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-blue-900/20 text-blue-200 placeholder-blue-500/50"
                                                placeholder={item.price.toString()}
                                                value={item.customPrice ?? ''}
                                                onChange={(e) => onUpdateCartItem(item.id, { customPrice: e.target.value ? Number(e.target.value) : undefined })}
                                            />
                                        </div>
                                        <span className="text-[9px] text-gray-500 mt-0.5">Harga Tawar</span>
                                        {item.customPrice && <span className="text-[9px] text-gray-600 line-through mr-1">{formatRupiah(item.price)}</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {cart.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <ShoppingCart size={48} className="mb-2 opacity-20"/>
                            <p>Keranjang kosong</p>
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-gray-700 bg-gray-800 safe-area-bottom">
                    <div className="flex justify-between mb-4">
                        <span className="font-bold text-gray-400">Total</span>
                        <span className="font-extrabold text-xl text-gray-100">{formatRupiah(cartTotal)}</span>
                    </div>
                    <button onClick={onCheckoutClick} disabled={cart.length===0} className="w-full bg-gray-100 text-gray-900 py-3.5 rounded-xl font-bold hover:bg-white disabled:opacity-50">Lanjut Bayar</button>
                </div>
            </div>
        </div>
    );
};