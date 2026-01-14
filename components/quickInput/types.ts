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

export interface BarangKeluarRow {
    id: number;
    tanggal: string; // Date in YYYY-MM-DD format
    tempo: string; // Payment terms (CASH, 3 BLN, 2 BLN, 1 BLN, NADIR)
    customer: string;
    partNumber: string; // Number part
    namaBarang: string; // Barang
    brand?: string; // Brand
    aplikasi?: string; // Aplikasi
    rak?: string; // Rak
    qtySaatIni?: number; // Qty saat ini (current stock)
    qtyKeluar: number; // Qty keluar (outgoing quantity)
    totalHargaKeluar: number; // Total harga keluar
    hargaSatuan: number; // Total harga satuan (calculated: totalHargaKeluar / qtyKeluar)
    error?: string;
    isLoading?: boolean;
}