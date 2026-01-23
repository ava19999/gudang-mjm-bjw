// FILE: components/quickInput/quickInputUtils.ts
import { QuickInputRow } from './types';

// Helper to get today's date in YYYY-MM-DD format (WIB)
const getTodayDate = (): string => {
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Jakarta'
    }).format(new Date());
};

export const createEmptyRow = (id: number): QuickInputRow => ({
    id,
    tanggal: getTodayDate(),
    tempo: 'CASH',
    customer: '',
    partNumber: '',
    namaBarang: '',
    brand: '',
    aplikasi: '',
    qtySaatIni: 0,
    qtyMasuk: 0,
    qtyKeluar: 0,
    totalHarga: 0,
    hargaSatuan: 0,
    hargaJual: 0,
    operation: 'in', // Default to 'in' for Input Barang
    via: '',
    resiTempo: '',
});

export const checkIsRowComplete = (row: QuickInputRow) => {
    // Required fields:
    // - Tanggal (Date)
    // - Tempo (Payment terms)
    // - Customer
    // - Part Number & Nama Barang
    // - Qty (Must be > 0) - qtyMasuk for 'in', qtyKeluar for 'out'
    // - Total Harga (Boleh 0)
    
    // Cek qty berdasarkan mode operasi
    const qty = row.operation === 'in' ? row.qtyMasuk : row.qtyKeluar;
    
    return (
        !!row.tanggal &&
        !!row.tempo &&
        !!row.customer.trim() &&
        !!row.partNumber && 
        !!row.namaBarang && 
        qty > 0
    );
};