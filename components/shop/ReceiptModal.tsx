// FILE: src/components/shop/ReceiptModal.tsx
import React, { useRef } from 'react';
import { CartItem } from '../../types';
import { formatRupiah } from '../../utils';
import { Download, Printer, Share2, X } from 'lucide-react';
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
    const isBJWStore = selectedStore === 'bjw';
    const storeLabel = selectedStore === 'mjm' ? 'MJMAUTOPART' : 'BJWAUTOPART';
    const logoSrc = isBJWStore ? '/assets/bjw-logo.png' : '/assets/mjm-logo.png';
    const paymentLabel = (tempo || 'CASH').trim() || 'CASH';

    if (!isOpen) return null;

    const cartTotal = cart.reduce((sum, item) => sum + ((item.customPrice ?? item.price) * item.cartQuantity), 0);
    const totalQuantity = cart.reduce((sum, item) => sum + item.cartQuantity, 0);
    const dateSource = transactionDate ? new Date(transactionDate) : new Date();
    const safeDate = Number.isNaN(dateSource.getTime()) ? new Date() : dateSource;
    const currentDate = safeDate.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
    const receiptTheme = isBJWStore
        ? {
            glowPrimary: 'rgba(59, 130, 246, 0.24)',
            glowSecondary: 'rgba(245, 158, 11, 0.16)',
            chipBackground: 'rgba(251, 191, 36, 0.18)',
            chipBorder: 'rgba(251, 191, 36, 0.26)',
            chipText: '#fde68a',
            highlightBackground: 'rgba(30, 64, 175, 0.08)',
            highlightText: '#1e3a8a',
            highlightSubtle: '#3b82f6',
            totalBadgeBackground: 'rgba(255, 255, 255, 0.08)',
        }
        : {
            glowPrimary: 'rgba(16, 185, 129, 0.24)',
            glowSecondary: 'rgba(251, 191, 36, 0.16)',
            chipBackground: 'rgba(16, 185, 129, 0.18)',
            chipBorder: 'rgba(16, 185, 129, 0.26)',
            chipText: '#a7f3d0',
            highlightBackground: 'rgba(5, 150, 105, 0.08)',
            highlightText: '#065f46',
            highlightSubtle: '#10b981',
            totalBadgeBackground: 'rgba(255, 255, 255, 0.08)',
        };

    const renderReceiptCanvas = async () => {
        if (!receiptRef.current) return null;

        const sourceNode = receiptRef.current;
        const sourceWidth = Math.ceil(sourceNode.getBoundingClientRect().width);
        const sourceHeight = Math.ceil(sourceNode.scrollHeight);
        const cloneHost = document.createElement('div');
        cloneHost.style.position = 'fixed';
        cloneHost.style.left = '-10000px';
        cloneHost.style.top = '0';
        cloneHost.style.width = `${sourceWidth}px`;
        cloneHost.style.padding = '0';
        cloneHost.style.margin = '0';
        cloneHost.style.background = '#f8fafc';
        cloneHost.style.pointerEvents = 'none';
        cloneHost.style.opacity = '0';
        cloneHost.style.zIndex = '-1';
        cloneHost.style.overflow = 'visible';

        const cloneNode = sourceNode.cloneNode(true) as HTMLDivElement;
        cloneNode.style.width = `${sourceWidth}px`;
        cloneNode.style.maxWidth = 'none';
        cloneNode.style.height = 'auto';
        cloneNode.style.transform = 'none';
        cloneNode.style.overflow = 'visible';

        cloneHost.appendChild(cloneNode);
        document.body.appendChild(cloneHost);

        try {
            if ('fonts' in document) {
                await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
            }

            const exportScale = Math.max(3, Math.min((window.devicePixelRatio || 1) + 1, 4));
            const canvas = await html2canvas(cloneNode, {
                backgroundColor: '#f8fafc',
                scale: exportScale,
                logging: false,
                useCORS: true,
                width: sourceWidth,
                height: sourceHeight,
                windowWidth: sourceWidth,
                windowHeight: sourceHeight,
                scrollX: 0,
                scrollY: 0,
            });
            return canvas;
        } catch (error) {
            console.error('Error generating receipt image:', error);
            return null;
        } finally {
            document.body.removeChild(cloneHost);
        }
    };

    const generateImage = async (format: 'image/jpeg' | 'image/png' = 'image/jpeg') => {
        const canvas = await renderReceiptCanvas();
        if (!canvas) return null;

        try {
            return format === 'image/png'
                ? canvas.toDataURL('image/png')
                : canvas.toDataURL('image/jpeg', 0.98);
        } catch (error) {
            console.error('Error generating receipt image:', error);
            return null;
        }
    };

    const handleDownload = async () => {
        const imageData = await generateImage('image/png');
        if (!imageData) return;

        const safeCustomerName = (customerName || 'customer')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'customer';

        const link = document.createElement('a');
        link.href = imageData;
        link.download = `${storeLabel.toLowerCase()}-resi-${safeCustomerName}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrint = async () => {
        const imageData = await generateImage('image/png');
        if (!imageData) return;

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) return;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${storeLabel} - Resi ${customerName}</title>
                <style>
                    @page {
                        margin: 12mm;
                    }
                    html, body {
                        margin: 0;
                        padding: 0;
                        background: #ffffff;
                    }
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: flex-start;
                        padding: 20px;
                    }
                    img {
                        display: block;
                        width: min(100%, 780px);
                        height: auto;
                    }
                    @media print {
                        body {
                            padding: 0;
                        }
                        img {
                            width: 100%;
                            max-width: none;
                        }
                    }
                </style>
            </head>
            <body>
                <img src="${imageData}" alt="Resi ${customerName}" />
                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                        }, 200);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleShare = async () => {
        const imageData = await generateImage('image/png');
        if (!imageData) return;

        // Convert base64 to blob
        const response = await fetch(imageData);
        const blob = await response.blob();
        const file = new File([blob], `${storeLabel}-${customerName}.png`, { type: 'image/png' });

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
            <div className="bg-gray-800 rounded-3xl shadow-2xl w-full max-w-5xl relative overflow-hidden animate-in zoom-in-95 border border-gray-700 max-h-[90vh] overflow-y-auto">
                <div className="bg-gray-900 px-6 py-4 border-b border-gray-700 flex justify-between items-center sticky top-0 z-10">
                    <h3 className="text-lg font-bold text-gray-100">{storeLabel} - Resi Pesanan</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={20}/>
                    </button>
                </div>

                {/* Receipt Content */}
                <div ref={receiptRef} className="bg-slate-50 p-4 sm:p-5">
                    <div className="mx-auto w-full max-w-[920px] overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_70px_-34px_rgba(15,23,42,0.35)]">
                        <div className="bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_100%)] px-5 py-6 text-white">
                            <div className="grid grid-cols-[104px_minmax(0,1fr)_104px] items-start gap-4">
                                <div aria-hidden="true" className="h-[104px] w-[104px]" />

                                <div className="min-w-0 self-center text-center">
                                    <h1 className="text-[2rem] font-black leading-none tracking-tight text-white sm:text-[2.15rem]">
                                        {storeLabel}
                                    </h1>
                                    <p className="mt-3 text-sm font-medium text-slate-200">
                                        {currentDate}
                                    </p>
                                </div>

                                <div className="shrink-0 flex h-[104px] w-[104px] items-center justify-center overflow-hidden justify-self-end">
                                    <img
                                        src={logoSrc}
                                        alt={storeLabel}
                                        className="h-[78px] w-[78px] scale-[1.35] object-contain"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200">
                            <div className="bg-slate-50 px-5 py-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Pembayaran
                                </p>
                                <p className="mt-2 text-xl font-bold text-slate-900">
                                    {paymentLabel}
                                </p>
                            </div>
                            <div className="bg-slate-50 px-5 py-4 text-right">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Grand Total
                                </p>
                                <p className="mt-2 text-xl font-black text-slate-900 sm:text-[1.7rem]">
                                    {formatRupiah(cartTotal)}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-5 p-5">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                            Customer
                                        </p>
                                        <p className="mt-3 text-[2.15rem] font-black leading-none tracking-tight text-slate-900 sm:text-[2.3rem]">
                                            {customerName || 'CUSTOMER UMUM'}
                                        </p>
                                    </div>
                                    <div
                                        className="rounded-full px-4 py-2 text-[15px] font-bold text-right"
                                        style={{
                                            backgroundColor: receiptTheme.highlightBackground,
                                            color: receiptTheme.highlightText,
                                        }}
                                    >
                                        {paymentLabel}
                                    </div>
                                </div>
                            </div>

                            {note && (
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                        Catatan
                                    </p>
                                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                                        {note}
                                    </p>
                                </div>
                            )}

                            <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white">
                                <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_5.5rem_6.75rem] gap-4 bg-slate-50 px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:grid-cols-[minmax(0,1fr)_3rem_6.5rem_8rem] sm:text-[12px]">
                                    <div>Number Part</div>
                                    <div className="text-center">Qty</div>
                                    <div className="text-right">Harga</div>
                                    <div className="text-right">Total</div>
                                </div>

                                <div className="divide-y divide-slate-200">
                                    {cart.map((item, index) => {
                                        const itemPrice = item.customPrice ?? item.price;
                                        const itemTotal = itemPrice * item.cartQuantity;

                                        return (
                                            <div
                                                key={`${item.id}-${index}`}
                                                className="grid grid-cols-[minmax(0,1fr)_2.5rem_5.5rem_6.75rem] items-center gap-4 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_3rem_6.5rem_8rem] sm:py-7"
                                            >
                                                <div className="min-w-0">
                                                    <p className="font-mono text-[18px] font-bold uppercase tracking-[0.08em] text-slate-900 sm:text-[22px]">
                                                        {item.partNumber}
                                                    </p>
                                                </div>

                                                <div className="flex items-center justify-center self-center text-[18px] font-black text-slate-900 sm:text-[20px]">
                                                    {item.cartQuantity}
                                                </div>

                                                <div className="self-center text-right">
                                                    <p className="whitespace-nowrap text-[15px] font-semibold text-slate-800 sm:text-[17px]">
                                                        {formatRupiah(itemPrice)}
                                                    </p>
                                                </div>

                                                <div className="self-center text-right">
                                                    <p
                                                        className="whitespace-nowrap text-[16px] font-black leading-none sm:text-[18px]"
                                                        style={{ color: receiptTheme.highlightText }}
                                                    >
                                                        {formatRupiah(itemTotal)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="rounded-[28px] bg-slate-950 px-5 py-5 text-white">
                                <div className="flex items-stretch justify-between gap-4">
                                    <div className="flex min-h-[84px] flex-col justify-center">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                                            Total Belanja
                                        </p>
                                        <p className="mt-2 text-[2.35rem] font-black leading-none tracking-tight text-white sm:text-[2.6rem]">
                                            {formatRupiah(cartTotal)}
                                        </p>
                                    </div>
                                    <div className="flex min-h-[84px] min-w-[92px] flex-col justify-center rounded-2xl bg-white/8 px-4 py-3 text-right">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                                            Qty Total
                                        </p>
                                        <p className="mt-2 text-2xl font-black leading-none text-white">
                                            {totalQuantity}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-slate-200 pt-4 text-center">
                                <p className="text-[15px] font-semibold text-slate-600">
                                    Terima kasih atas pesanan Anda
                                </p>
                                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                    Simpan resi ini untuk referensi transaksi
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="p-6 bg-gray-900 border-t border-gray-700 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <button
                        onClick={handleDownload}
                        className="py-3 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2"
                    >
                        <Download size={18} />
                        Simpan Gambar
                    </button>
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
