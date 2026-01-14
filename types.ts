// FILE: src/types.ts

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
  imageUrl: string;      // Foto utama
  images?: string[];     // <--- OPSIONAL (tanda tanya ?) Mencegah blank screen
  ecommerce: string;
  initialStock: number;
  qtyIn: number;
  qtyOut: number;
  lastUpdated: number;
  description?: string;
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
  images: string[];      // Di form kita inisialisasi sebagai array kosong, jadi aman
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

export interface BarangMasuk {
  id: string;
  created_at: string;
  tempo: string;
  ecommerce: string;
  keterangan: string;
  part_number: string;
  name: string;
  brand: string;
  application: string;
  rak: string;
  stock_ahir: number;
  qty_masuk: number;
  harga_satuan: number;
  harga_total: number;
  customer: string;
}

export interface BarangKeluar {
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
}

export interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'admin';
    timestamp: number;
    isRead: boolean;
}
  
export interface ChatSession {
    customerId: string;
    customerName: string;
    messages: ChatMessage[];
    lastMessage: string;
    lastTimestamp: number;
    unreadAdminCount: number;
    unreadUserCount: number;
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