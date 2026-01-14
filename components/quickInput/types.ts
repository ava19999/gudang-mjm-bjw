// FILE: src/components/quickInput/types.ts
export interface QuickInputRow {
    id: number;
    tanggal: string; // Date in YYYY-MM-DD format
    tempo: string; // Payment terms (CASH, 3 BLN, 2 BLN, 1 BLN)
    customer: string;
    partNumber: string;
    namaBarang: string;
    brand?: string; // Brand info from item details
    aplikasi?: string; // Application info from item details
    qtySaatIni?: number; // Current quantity from item details
    qtyMasuk: number; // Incoming quantity
    totalHarga: number; // Total price for incoming quantity
    hargaSatuan: number; // Unit price, calculated as totalHarga/qtyMasuk
    hargaJual: number;
    operation: 'in' | 'out';
    via: string;
    resiTempo: string;
    error?: string;
    isLoading?: boolean;
}