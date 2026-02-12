// FILE: src/components/shop/ReceiptModal.tsx
import React, { useRef } from 'react';
import { CartItem } from '../../types';
import { formatRupiah } from '../../utils';
import { X, Printer, Share2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useStore } from '../../context/StoreContext';

interface ReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    cart: CartItem[];
    customerName: string;
    tempo: string;
    note: string;
    transactionDate?: string;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ 
    isOpen, onClose, cart, customerName, tempo, note, transactionDate
}) => {
    const receiptRef = useRef<HTMLDivElement>(null);
    const { selectedStore } = useStore();
    const storeLabel = selectedStore === 'mjm' ? 'MJMAUTOPART' : 'BJWAUTOPART';

    if (!isOpen) return null;

    const cartTotal = cart.reduce((sum, item) => sum + ((item.customPrice ?? item.price) * item.cartQuantity), 0);
    const dateSource = transactionDate ? new Date(transactionDate) : new Date();
    const safeDate = Number.isNaN(dateSource.getTime()) ? new Date() : dateSource;
    const currentDate = safeDate.toLocaleDateString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        day: '2-digit', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const generateImage = async () => {
        if (!receiptRef.current) return null;
        
        try {
            const canvas = await html2canvas(receiptRef.current, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
            });
            return canvas.toDataURL('image/jpeg', 0.95);
        } catch (error) {
            console.error('Error generating receipt image:', error);
            return null;
        }
    };

    const handleDownload = async () => {
        const imageData = await generateImage();
        if (!imageData) return;

        const link = document.createElement('a');
        link.download = `resi-${customerName.replace(/\s+/g, '-')}-${Date.now()}.jpg`;
        link.href = imageData;
        link.click();
    };

    const handlePrint = () => {
        // Create a new window with the receipt content
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow || !receiptRef.current) return;

        // Get the receipt HTML
        const receiptHTML = receiptRef.current.innerHTML;
        
        // Write the HTML to the new window with print styles
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${storeLabel} - Resi ${customerName}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                        background: white;
                    }
                    @media print {
                        body { margin: 0; }
                    }
                </style>
            </head>
            <body>
                ${receiptHTML}
                <script>
                    window.onload = function() {
                        window.print();
                        // Optionally close after printing
                        // window.onafterprint = function() { window.close(); };
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleShare = async () => {
        const imageData = await generateImage();
        if (!imageData) return;

        // Convert base64 to blob
        const response = await fetch(imageData);
        const blob = await response.blob();
        const file = new File([blob], `${storeLabel}-${customerName}.jpg`, { type: 'image/jpeg' });

        if (navigator.share && navigator.canShare?.({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: `${storeLabel} - Resi Pesanan`,
                    text: `Resi pesanan ${storeLabel} untuk ${customerName}`,
                });
            } catch (error) {
                console.log('Share cancelled or failed:', error);
            }
        } else {
            // Fallback: copy to clipboard or open WhatsApp Web
            const whatsappText = encodeURIComponent(`${storeLabel} - Resi Pesanan\nCustomer: ${customerName}\nTotal: ${formatRupiah(cartTotal)}`);
            window.open(`https://wa.me/?text=${whatsappText}`, '_blank');
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden animate-in zoom-in-95 border border-gray-700 max-h-[90vh] overflow-y-auto">
                <div className="bg-gray-900 px-6 py-4 border-b border-gray-700 flex justify-between items-center sticky top-0 z-10">
                    <h3 className="text-lg font-bold text-gray-100">{storeLabel} - Resi Pesanan</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={20}/>
                    </button>
                </div>

                {/* Receipt Content */}
                <div ref={receiptRef} className="bg-white p-6">
                    {/* Header */}
                    <div className="text-center mb-4 border-b-2 border-gray-800 pb-3">
                        <h1 className="text-xl font-bold text-gray-900 mb-0.5">{storeLabel}</h1>
                        <p className="text-xs text-gray-600">{currentDate}</p>
                    </div>

                    {/* Customer Info */}
                    <div className="mb-4 bg-gray-50 p-3 rounded">
                        <div className="flex justify-between gap-4 text-xs">
                            <div className="flex-1">
                                <p className="text-gray-600 font-semibold mb-0.5">Customer:</p>
                                <p className="text-gray-900 font-bold">{customerName}</p>
                            </div>
                            {tempo && (
                                <div className="flex-1">
                                    <p className="text-gray-600 font-semibold mb-0.5">Tempo:</p>
                                    <p className="text-gray-900 font-bold">{tempo}</p>
                                </div>
                            )}
                        </div>
                        {note && (
                            <div className="mt-2 pt-2 border-t border-gray-300">
                                <p className="text-gray-600 font-semibold text-xs mb-0.5">Note:</p>
                                <p className="text-gray-900 text-xs">{note}</p>
                            </div>
                        )}
                    </div>

                    {/* Items Table */}
                    <div className="mb-4">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b-2 border-gray-800">
                                    <th className="text-left py-1.5 font-bold text-gray-900 w-16">Part#</th>
                                    <th className="text-left py-1.5 font-bold text-gray-900">Keterangan</th>
                                    <th className="text-center py-1.5 font-bold text-gray-900 w-10">Qty</th>
                                    <th className="text-right py-1.5 font-bold text-gray-900 w-20">Harga</th>
                                    <th className="text-right py-1.5 font-bold text-gray-900 w-20">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cart.map((item, index) => {
                                    const itemPrice = item.customPrice ?? item.price;
                                    const itemTotal = itemPrice * item.cartQuantity;
                                    return (
                                        <tr key={item.id} className="border-b border-gray-300">
                                            <td className="py-2 align-top">
                                                <p className="text-gray-900 font-mono text-[10px] leading-tight">{item.partNumber}</p>
                                            </td>
                                            <td className="py-2 align-top">
                                                <p className="font-semibold text-gray-900 leading-tight">{item.name}</p>
                                                {item.brand && <p className="text-[10px] text-gray-600 leading-tight">Brand: {item.brand}</p>}
                                                {item.application && <p className="text-[10px] text-gray-600 leading-tight">Aplikasi: {item.application}</p>}
                                            </td>
                                            <td className="text-center font-bold text-gray-900 align-top py-2">{item.cartQuantity}</td>
                                            <td className="text-right text-gray-900 align-top py-2">{formatRupiah(itemPrice)}</td>
                                            <td className="text-right font-bold text-gray-900 align-top py-2">{formatRupiah(itemTotal)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Total */}
                    <div className="border-t-2 border-gray-800 pt-3">
                        <div className="flex justify-between items-center">
                            <span className="text-base font-bold text-gray-900">TOTAL:</span>
                            <span className="text-lg font-bold text-gray-900">{formatRupiah(cartTotal)}</span>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-4 text-center text-[10px] text-gray-600 border-t border-gray-300 pt-3">
                        <p>Terima kasih atas pesanan Anda</p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="p-6 bg-gray-900 border-t border-gray-700 grid grid-cols-2 gap-3">
                    <button 
                        onClick={handlePrint}
                        className="py-3 px-4 bg-gray-700 text-gray-100 font-bold rounded-xl hover:bg-gray-600 flex items-center justify-center gap-2"
                    >
                        <Printer size={18} />
                        Cetak
                    </button>
                    <button 
                        onClick={handleShare}
                        className="py-3 px-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 flex items-center justify-center gap-2"
                    >
                        <Share2 size={18} />
                        Share WhatsApp
                    </button>
                </div>
            </div>
        </div>
    );
};
