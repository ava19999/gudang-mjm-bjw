// FILE: src/types.ts

// --- TYPE DATA UTAMA (SISTEM BARU) ---

// 1. OFFLINE (Table: orders_mjm / orders_bjw)
export interface OfflineOrderRow {
  id?: string; // Optional - orders_mjm has bigint id, orders_bjw has no id
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
  tanggal: string;
  type_toko: string;
  toko: string;
  customer: string;
  part_number: string;
  barang: string;
  brand: string;
  application: string;
  stok_saatini: number;
  qty_out: number;
  total_harga: number;
  harga_satuan: number;
  resi: string;
  no_pesanan: number;
  is_split: boolean;
  split_group_id?: string; // Only in scan_resi_mjm
  id_reseller: number;
  id_customer: number;
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
  brand: string;
  application: string;
  rak: string;
  stock_ahir: number;
  qty_keluar: number;
  harga_satuan: number;
  harga_total: number;
  resi: string;
  id_reseller: number;
  id_customer: number;
}

// 4. RETUR (Table: retur_mjm / retur_bjw)
export interface ReturRow {
  id: number;
  tanggal_pemesanan: string;
  resi: string;
  toko: string;
  customer: string;
  part_number: string;
  nama_barang: string;
  quantity: number;
  harga_satuan: number;
  harga_total: number;
  tanggal_retur: string;
  keterangan: string;
  ecommerce: string;
  status: string;
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
    tanggal: string;
    type_toko: string;
    toko: string;
    customer: string;
    part_number: string | null;
    barang: string;
    brand: string;
    application: string;
    stok_saatini: number;
    qty_out: number;
    total_harga: number;
    harga_satuan: number;
    resi: string;
    no_pesanan: number;
    is_split: boolean;
    split_group_id?: string;
    id_reseller: number;
    id_customer: number;
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
export type SubToko = 'LARIS' | 'MJM' | 'BJW';
export type NegaraEkspor = 'PH' | 'MY' | 'SG' | 'HK';
export type ResiScanStatus = 'pending' | 'stage1' | 'stage2' | 'completed';

// Resi Scan Stage interface
export interface ResiScanStage {
  id: string;
  tanggal: string;
  resi: string;
  ecommerce: EcommercePlatform;
  sub_toko: SubToko;
  negara_ekspor?: NegaraEkspor;
  
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

export interface ParsedCSVItem {
  resi: string;
  customer: string;
  order_id: string;
  sku: string;
  product_name: string;
  variation: string;
  quantity: number;
  price: number;
  total_price: number;
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