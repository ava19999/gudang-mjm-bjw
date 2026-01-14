// FILE: src/components/quickInput/quickInputUtils.ts
import { QuickInputRow } from './types';

// Helper to get today's date in YYYY-MM-DD format
const getTodayDate = (): string => {
    const today = new Date();
    return today.toISOString().split('T')[0];
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
    totalHarga: 0,
    hargaSatuan: 0,
    hargaJual: 0,
    operation: 'in', // Default to 'in' for Input Barang
    via: '',
    resiTempo: '',
});

export const checkIsRowComplete = (row: QuickInputRow) => {
    // Required fields for Input Barang:
    // - Tanggal (Date)
    // - Tempo (Payment terms)
    // - Customer
    // - Part Number & Nama Barang
    // - Qty Masuk (Must be > 0)
    // - Total Harga (Must be > 0)
    
    return (
        !!row.tanggal &&
        !!row.tempo &&
        !!row.customer.trim() &&
        !!row.partNumber && 
        !!row.namaBarang && 
        row.qtyMasuk > 0 &&
        row.totalHarga > 0
    );
};