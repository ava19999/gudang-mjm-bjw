// FILE: src/utils/orderHelpers.ts
import { Order, OrderStatus } from '../types';
import { CheckCircle, XCircle } from 'lucide-react';

// --- TIMEZONE HELPERS ---
export const getWIBISOString = () => {
    const now = new Date();
    const wibOffset = 7 * 60 * 60 * 1000; 
    const wibDate = new Date(now.getTime() + wibOffset);
    return wibDate.toISOString().replace('Z', '');
};

export const getLocalISOString = (timestamp: number) => {
    const d = new Date(timestamp);
    const offsetMs = d.getTimezoneOffset() * 60000; 
    return new Date(d.getTime() - offsetMs).toISOString().slice(0, -1);
};

// --- FORMATTING HELPERS ---
export const formatDate = (ts: number | string) => { 
    try { 
        const d = new Date(ts || Date.now()); 
        return { 
            date: d.toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'}), 
            time: d.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) 
        }; 
    } catch (e) { return {date:'-', time:'-'}; } 
};

export const getStatusColor = (status: OrderStatus) => {
    switch (status) { 
        case 'pending': return 'bg-amber-900/30 text-amber-400 border-amber-900/50'; 
        case 'processing': return 'bg-blue-900/30 text-blue-400 border-blue-900/50'; 
        case 'completed': return 'bg-green-900/30 text-green-400 border-green-900/50'; 
        case 'cancelled': return 'bg-red-900/30 text-red-400 border-red-900/50'; 
        default: return 'bg-gray-700 text-gray-300'; 
    }
};

export const getStatusLabel = (status: OrderStatus) => {
    if (status === 'cancelled') return 'RETUR / BATAL'; 
    if (status === 'completed') return 'SELESAI'; 
    if (status === 'processing') return 'TERJUAL'; 
    if (status === 'pending') return 'BARU'; 
    return status;
};

export const getOrderDetails = (order: Order) => {
    let cleanName = order.customerName || 'Tanpa Nama';
    let resiText = `#${order.id.slice(0, 8)}`;
    let ecommerce = '-'; let shopName = '-';
    try {
        const resiMatch = cleanName.match(/\(Resi: (.*?)\)/); if (resiMatch && resiMatch[1]) { resiText = resiMatch[1]; cleanName = cleanName.replace(/\s*\(Resi:.*?\)/, ''); }
        const shopMatch = cleanName.match(/\(Toko: (.*?)\)/); if (shopMatch && shopMatch[1]) { shopName = shopMatch[1]; cleanName = cleanName.replace(/\s*\(Toko:.*?\)/, ''); }
        const viaMatch = cleanName.match(/\(Via: (.*?)\)/); if (viaMatch && viaMatch[1]) { ecommerce = viaMatch[1]; cleanName = cleanName.replace(/\s*\(Via:.*?\)/, ''); }
        cleanName = cleanName.replace(/\(RETUR\)/i, ''); 
    } catch (e) { console.error("Error parsing name", e); }
    return { cleanName: cleanName.trim(), resiText, ecommerce, shopName };
};