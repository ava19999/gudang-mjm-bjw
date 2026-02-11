// FILE: src/types.ts

// --- TYPE DATA UTAMA (SISTEM BARU) ---

// 1. OFFLINE (Table: orders_mjm / orders_bjw)
export interface OfflineOrderRow {
  id: string;
  tanggal: string;
  customer: string;
  part_number: string;
  nama_barang: string;
  quantity: number;
  harga_satuan: number;
  harga_total: number;
  status: string; // 'Belum Diproses', 'Proses', 'Tolak'
  tempo: string;
}

// 2. ONLINE (Table: scan_resi_mjm / scan_resi_bjw)
export interface OnlineOrderRow {
  id: number;
  tanggal: string;
  resi: string;
  toko: string; // MJM, BJW, LARIS
  ecommerce: string; // SHOPEE, TIKTOK
  customer: string;
  part_number: string;
  nama_barang: string;
  quantity: number;
  harga_satuan: number;
  harga_total: number;
  status: string; // 'Pending', 'Proses'
}

// 3. SUDAH TERJUAL (Table: barang_keluar_mjm / barang_keluar_bjw)
export interface SoldItemRow {
  id: string;
  created_at: string;
  kode_toko: string;
  tempo: string;
  ecommerce: string;
  customer: string;
  part_number: string;
  name: string;
  brand?: string;
  application?: string;
  qty_keluar: number;
  harga_total: number;
  resi: string;
}

// 4. RETUR (Table: retur_mjm / retur_bjw)
export interface ReturRow {
  id?: number;
  tanggal_retur: string;
  tanggal_pemesanan?: string; // Tanggal order asli
  resi: string;
  customer: string;
  part_number: string;
  nama_barang: string;
  quantity: number;
  harga_satuan: number;
  harga_total: number;
  // Tipe retur: 'BALIK_STOK' | 'RUSAK' | 'TUKAR_SUPPLIER' | 'TUKAR_SUPPLIER_GANTI'
  tipe_retur: 'BALIK_STOK' | 'RUSAK' | 'TUKAR_SUPPLIER' | 'TUKAR_SUPPLIER_GANTI';
  status: string; // 'Pending' | 'Selesai' | 'Sudah Ditukar' (untuk tukar supplier)
  keterangan: string;
  ecommerce?: string;
}

// --- TYPE DATA INVENTORY & LEGACY (JANGAN DIHAPUS) ---

export interface InventoryItem {
  id: string;
  partNumber: string;
  name: string;
  brand: string;
  application: string;
  quantity: number;
  shelf: string;
  price: number;
  costPrice: number;
  imageUrl: string;      
  images?: string[];     
  ecommerce: string;
  initialStock: number;
  qtyIn: number;
  qtyOut: number;
  lastUpdated: number;
  description?: string;
  isLowStock?: boolean;
}

export interface InventoryFormData {
  partNumber: string;
  name: string;
  brand: string;
  application: string;
  quantity: number;
  shelf: string;
  price: number;
  costPrice: number;
  ecommerce: string;
  imageUrl: string;
  images: string[];      
  initialStock: number;
  qtyIn: number;
  qtyOut: number;
}

export interface StockHistory {
  id: string;
  itemId: string;
  partNumber: string;
  name: string;
  type: 'in' | 'out';
  quantity: number;
  previousStock: number;
  currentStock: number;
  price: number;
  totalPrice: number;
  timestamp: number | null;
  reason: string;
  resi: string;
  tempo: string;
  customer: string;
}

export interface OrderItem {
    id: string;
    partNumber: string;
    name: string;
    quantity: number; 
    price: number;
    cartQuantity: number;
    customPrice?: number;
    brand: string;
    application: string;
    shelf: string;
    ecommerce: string;
    imageUrl: string;
    lastUpdated: number;
    initialStock: number;
    qtyIn: number;
    qtyOut: number;
    costPrice: number;
    kingFanoPrice: number;
}

export interface Order {
    id: string;
    customerName: string;
    items: OrderItem[];
    totalAmount: number;
    status: 'pending' | 'processing' | 'completed' | 'cancelled';
    timestamp: number;
    keterangan?: string;
    tempo?: string;
}

export interface CartItem extends OrderItem {}

export interface ReturRecord {
    id?: number;
    tanggal_pemesanan: string;
    resi: string;
    toko: string;
    ecommerce: string;
    customer: string;
    part_number: string;
    nama_barang: string;
    quantity: number;
    harga_satuan: number;
    harga_total: number;
    tanggal_retur: string;
    status: string;
    keterangan: string;
}

export interface ScanResiLog {
    id: number;
    tanggal: string;
    resi: string;
    toko: string;
    ecommerce: string;
    customer: string;
    part_number: string | null;
    nama_barang: string;
    quantity: number;
    harga_satuan: number;
    harga_total: number;
    status: string;
}

export interface BaseWarehouseItem {
    id: string;
    partNumber: string;
    name: string;
    quantity: number;
}

export interface OnlineProduct {
    id: string;
    partNumber: string;
    name: string;
    brand: string;
    quantity: number;
    isActive: boolean;
    timestamp: number;
}

export interface ProdukKosong {
    id: string;
    partNumber: string;
    name: string;
    brand: string;
    quantity: number;
    isOnlineActive: boolean;
    timestamp: number;
}

export interface TableMasuk {
    id: string;
    partNumber: string;
    name: string;
    brand: string;
    quantity: number;
    isActive: boolean;
    timestamp: number;
}

export interface ChatSession {
    customerId: string;
    customerName: string;
    messages: any[];
    lastMessage: string;
    lastTimestamp: number;
    unreadAdminCount: number;
    unreadUserCount: number;
}

// ============================================================================
// TYPES FOR 3-STAGE RECEIPT SCANNING SYSTEM
// ============================================================================

// E-commerce platform types
export type EcommercePlatform = 'TIKTOK' | 'SHOPEE' | 'KILAT' | 'RESELLER' | 'EKSPOR';
export type SubToko = 'LARIS' | 'MJM' | 'BJW' | 'PRAKTIS PART';
export type NegaraEkspor = 'PH' | 'MY' | 'SG' | 'HK';
export type ResiScanStatus = 'pending' | 'stage1' | 'stage2' | 'completed';

// Resi Scan Stage interface
export interface ResiScanStage {
  id: string;
  tanggal: string;
  resi: string;
  no_pesanan?: string; // No. Pesanan - untuk deteksi INSTANT (jika resi === no_pesanan)
  ecommerce: EcommercePlatform;
  sub_toko: SubToko;
  negara_ekspor?: NegaraEkspor;
  resellerdari?: 'MJM' | 'BJW'; // Reseller dari toko mana (khusus ecommerce RESELLER)
  
  // Stage 1
  stage1_scanned: boolean;
  stage1_scanned_at?: string;
  stage1_scanned_by?: string;
  
  // Stage 2
  stage2_verified: boolean;
  stage2_verified_at?: string;
  stage2_verified_by?: string;
  
  // Stage 3
  stage3_completed: boolean;
  stage3_completed_at?: string;
  customer?: string;
  order_id?: string;
  
  status: ResiScanStatus;
  created_at: string;
  updated_at: string;
}

// Helper: Deteksi apakah pesanan INSTANT (No. Pesanan dipakai sebagai resi)
// INSTANT hanya berlaku untuk SHOPEE dan TIKTOK
export const isInstantOrder = (resi: ResiScanStage): boolean => {
  const ecomm = (resi.ecommerce || '').toUpperCase();
  if (ecomm !== 'SHOPEE' && ecomm !== 'TIKTOK') return false;
  // INSTANT jika resi === no_pesanan (artinya yang di-scan adalah no pesanan)
  return !!(resi.no_pesanan && resi.resi === resi.no_pesanan);
};

// Resi Items interface
export interface ResiItem {
  id: string;
  resi_id: string;
  part_number: string;
  nama_barang: string;
  brand: string;
  application: string;
  qty_keluar: number;
  harga_total: number;
  harga_satuan: number;
  is_split_item: boolean;
  split_count: number;
  sku_from_csv?: string;
  manual_input: boolean;
  created_at: string;
}

// Part Substitusi interface
export interface PartSubstitusi {
  id: number;
  part_number_utama: string;
  part_number_alias: string;
  created_at: string;
}

// Reseller Master interface
export interface ResellerMaster {
  id: number;
  nama_reseller: string;
  created_at: string;
}

// CSV Import Interfaces
export interface ShopeeCSVRow {
  'No. Pesanan': string;
  'Status Pesanan': string;
  'No. Resi': string;
  'Opsi Pengiriman': string;
  'SKU Induk': string;
  'Nama Produk': string;
  'Nomor Referensi SKU': string;
  'Nama Variasi': string;
  'Harga Awal': string;
  'Harga Setelah Diskon': string;
  'Jumlah': string;
  'Total Harga Produk': string;
  'Username (Pembeli)': string;
  'Nama Penerima': string;
  'No. Telepon': string;
  'Alamat Pengiriman': string;
  [key: string]: string;
}

export interface TikTokCSVRow {
  'Order ID': string;
  'Order Status': string;
  'SKU ID': string;
  'Seller SKU': string;
  'Product Name': string;
  'Variation': string;
  'Quantity': string;
  'SKU Unit Original Price': string;
  'SKU Subtotal After Discount': string;
  'Order Amount': string;
  'Tracking ID': string;
  'Buyer Username': string;
  'Recipient': string;
  'Phone #': string;
  [key: string]: string;
}

// Update interface untuk hasil parsing CSV
export interface ParsedCSVItem {
  resi: string;             // No. Resi
  order_id: string;         // No. Pesanan
  order_status: string;     // Status Pesanan (Baru)
  shipping_option: string;  // Opsi Pengiriman (Baru)
  part_number: string;      // SKU / Number Part
  product_name: string;     // Nama Produk
  quantity: number;         // Jumlah
  total_price: number;      // Total Harga Produk (IDR)
  customer: string;         // Username (Pembeli)
  ecommerce: string;        // 'SHOPEE' | 'TIKTOK'
  original_currency_val: string; 
  // 'toko' (MJM/BJW) akan dihandle saat insert database di component
}

// Stage 1 Form Data
export interface Stage1ScanData {
  ecommerce: EcommercePlatform;
  sub_toko: SubToko;
  negara_ekspor?: NegaraEkspor;
  resi: string;
  scanned_by: string;
}

// Stage 2 Verification Data
export interface Stage2VerifyData {
  resi: string;
  verified_by: string;
}

// Stage 3 Complete Data
export interface Stage3CompleteData {
  resi_id: string;
  customer: string;
  order_id: string;
  items: ResiItem[];
}
