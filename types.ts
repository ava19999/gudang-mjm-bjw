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
  ecommerce: string; // SHOPEE, TIKTOK, KILAT, RESELLER, EKSPOR
  customer: string;
  part_number: string;
  nama_barang: string;
  quantity: number;
  harga_satuan: number;
  harga_total: number;
  status: string; // 'scanned', 'packed', 'completed'
  negara?: string; // For EKSPOR: PH/MY/SG/HK
  brand?: string;
  application?: string;
}

// Extended types for resi scanning system
export interface ResiScanEntry {
  id?: number;
  tanggal: string;
  resi: string;
  toko: string;
  ecommerce: string;
  customer: string;
  items: ResiItemEntry[];
  status: 'scanned' | 'packed' | 'completed';
  negara?: string;
}

export interface ResiItemEntry {
  part_number: string;
  nama_barang: string;
  brand?: string;
  application?: string;
  quantity: number;
  harga_satuan: number;
  harga_total: number;
  qty_n?: number; // Original quantity before split
}

export interface ProductAlias {
  id?: number;
  part_number_alias: string;
  part_number_actual: string;
  created_at?: string;
}

export interface CSVImportRow {
  resi: string;
  customer: string;
  sku: string;
  product_name: string;
  quantity: number;
  price: number;
  total: number;
  [key: string]: any; // For additional columns
}

export type EcommerceType = 'TIKTOK' | 'SHOPEE' | 'KILAT' | 'RESELLER' | 'EKSPOR';
export type SubTokoType = 'MJM' | 'BJW' | 'LARIS';
export type NegaraEksporType = 'PH' | 'MY' | 'SG' | 'HK';

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
  qty_keluar: number;
  harga_total: number;
  resi: string;
}

// 4. RETUR (Table: retur_mjm / retur_bjw)
export interface ReturRow {
  id?: number;
  tanggal_retur: string;
  resi: string;
  customer: string;
  nama_barang: string;
  quantity: number;
  status: string;
  keterangan: string;
  harga_total: number;
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