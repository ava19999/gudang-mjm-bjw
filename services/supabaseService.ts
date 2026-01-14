// FILE: services/supabaseService.ts
import { supabase } from '../lib/supabase';
import { 
  InventoryItem, 
  InventoryFormData, 
  StockHistory, 
  BarangMasuk, 
  BarangKeluar, 
  Order, 
  ChatSession, 
  ReturRecord, 
  ScanResiLog 
} from '../types';

// --- HELPER: MENENTUKAN NAMA TABEL BERDASARKAN TOKO ---
const getTableName = (store: string | null | undefined) => {
  if (store === 'mjm') return 'base_mjm';
  if (store === 'bjw') return 'base_bjw';
  return 'base'; // Table default/fallback
};

// --- INVENTORY FUNCTIONS ---

export const fetchInventory = async (store?: string | null): Promise<InventoryItem[]> => {
  const table = getTableName(store);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error(`[Supabase] Error fetchInventory from ${table}:`, error);
    return [];
  }
  return (data || []) as InventoryItem[];
};

export const fetchInventoryPaginated = async (
  store: string | null,
  page: number,
  perPage: number,
  filters?: any
): Promise<{ data: InventoryItem[]; total: number }> => {
  const table = getTableName(store);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase.from(table).select('*', { count: 'exact' });

  if (filters?.search) {
    query = query.or(`name.ilike.%${filters.search}%,partNumber.ilike.%${filters.search}%`);
  }

  const { data, count, error } = await query
    .range(from, to)
    .order('name', { ascending: true });

  if (error) {
    console.error('[Supabase] Error fetchInventoryPaginated:', error);
    return { data: [], total: 0 };
  }

  return { data: (data || []) as InventoryItem[], total: count || 0 };
};

export const fetchInventoryStats = async (store: string | null): Promise<any> => {
  const items = await fetchInventory(store);
  const totalItems = items.length;
  const totalValue = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const lowStock = items.filter(item => item.quantity < 5).length; // Asumsi batas low stock 5

  return { totalItems, totalValue, lowStock };
};

export const fetchInventoryAllFiltered = async (store: string | null, filters?: any): Promise<InventoryItem[]> => {
  // Implementasi sederhana: fetch semua lalu filter di client (atau sesuaikan query seperti paginated)
  const items = await fetchInventory(store);
  if (!filters) return items;
  // Tambahkan logika filter manual jika perlu, atau biarkan raw
  return items;
};

export const addInventory = async (data: InventoryFormData, store?: string | null): Promise<boolean> => {
  const table = getTableName(store);
  // Sanitasi data angka
  const payload = {
    ...data,
    quantity: Number(data.quantity) || 0,
    price: Number(data.price) || 0,
    costPrice: Number(data.costPrice) || 0,
    initialStock: Number(data.initialStock) || 0,
    qtyIn: 0,
    qtyOut: 0
  };

  const { error } = await supabase.from(table).insert([payload]);
  if (error) {
    console.error('[Supabase] Error addInventory:', error);
    return false;
  }
  return true;
};

export const updateInventory = async (
  item: Partial<InventoryItem> & { id?: string },
  _unused?: any, // Parameter legacy dari mock
  store?: string | null
): Promise<boolean> => {
  const table = getTableName(store);
  const id = item.id;
  
  if (!id) {
    console.error('[Supabase] Error updateInventory: No ID provided');
    return false;
  }

  // Pisahkan ID dari body update
  const { id: _, ...updates } = item;

  const { error } = await supabase
    .from(table)
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('[Supabase] Error updateInventory:', error);
    return false;
  }
  return true;
};

export const deleteInventory = async (id: string, store?: string | null): Promise<boolean> => {
  const table = getTableName(store);
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) {
    console.error('[Supabase] Error deleteInventory:', error);
    return false;
  }
  return true;
};

export const getItemByPartNumber = async (partNumber: string, store?: string | null): Promise<InventoryItem | null> => {
  const table = getTableName(store);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('partNumber', partNumber)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] Error getItemByPartNumber:', error);
    return null;
  }
  return data as InventoryItem;
};

export const saveItemImages = async (itemId: string, images: string[], store?: string | null): Promise<void> => {
  // Disimpan sebagai array string (JSON) di kolom 'images' atau 'imageUrl'
  // Jika kolomnya 'imageUrl' (single), ambil yang pertama. Jika ada kolom 'images' (array), simpan semua.
  // Sesuaikan dengan struktur DB Anda. Ini contoh update field 'imageUrl':
  if (images.length > 0) {
    await updateInventory({ id: itemId, imageUrl: images[0] }, undefined, store);
  }
};

// --- ORDER FUNCTIONS ---
// Asumsi: Tabel bernama 'orders'
const ORDER_TABLE = 'orders';

export const fetchOrders = async (store?: string | null): Promise<Order[]> => {
  let query = supabase.from(ORDER_TABLE).select('*').order('timestamp', { ascending: false });
  
  // Jika ingin filter order per toko (tambahkan kolom store_id di tabel orders jika perlu)
  // if (store) query = query.eq('store', store);

  const { data, error } = await query;

  if (error) {
    console.error('[Supabase] Error fetchOrders:', error);
    return [];
  }
  
  // Perlu parsing JSON string jika items disimpan sebagai JSONB/Text
  return (data || []).map((order: any) => ({
    ...order,
    // Pastikan items adalah array, parse jika string
    items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items
  })) as Order[];
};

export const saveOrder = async (order: Order, store?: string | null): Promise<boolean> => {
  const payload = {
    ...order,
    // Pastikan items disimpan sebagai JSON yang valid
    items: JSON.stringify(order.items),
    // Tambahkan field store jika tabel orders mendukung multi-store
    // store: store || 'global' 
  };

  const { error } = await supabase.from(ORDER_TABLE).insert([payload]);
  
  if (error) {
    console.error('[Supabase] Error saveOrder:', error);
    return false;
  }
  return true;
};

export const updateOrderStatusService = async (
  orderId: string,
  newStatus: Order['status'],
  _unused?: any
): Promise<boolean> => {
  const { error } = await supabase
    .from(ORDER_TABLE)
    .update({ status: newStatus })
    .eq('id', orderId);

  if (error) {
    console.error('[Supabase] Error updateOrderStatusService:', error);
    return false;
  }
  return true;
};

export const updateOrderData = async (orderId: string, items: any[], totalAmount: number, status: string): Promise<boolean> => {
  const { error } = await supabase
    .from(ORDER_TABLE)
    .update({ 
      items: JSON.stringify(items),
      totalAmount,
      status
    })
    .eq('id', orderId);

  if (error) {
    console.error('[Supabase] Error updateOrderData:', error);
    return false;
  }
  return true;
};

// --- HISTORY FUNCTIONS ---
// Asumsi: Tabel bernama 'stock_history'
const HISTORY_TABLE = 'stock_history';

export const fetchHistory = async (store?: string | null): Promise<StockHistory[]> => {
  const { data, error } = await supabase
    .from(HISTORY_TABLE)
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(500); // Limit agar tidak terlalu berat

  if (error) {
    console.error('[Supabase] Error fetchHistory:', error);
    return [];
  }
  return (data || []) as StockHistory[];
};

export const fetchItemHistory = async (itemId: string, store?: string | null): Promise<StockHistory[]> => {
  // Mencari history berdasarkan nama item atau ID di deskripsi/keterangan
  // Ini mungkin perlu disesuaikan dengan struktur tabel history Anda
  const { data, error } = await supabase
    .from(HISTORY_TABLE)
    .select('*')
    .ilike('description', `%${itemId}%`) // Pencarian kasar
    .order('timestamp', { ascending: false });

  if (error) return [];
  return (data || []) as StockHistory[];
};

export const fetchHistoryLogsPaginated = async (
  store: string | null,
  page: number,
  perPage: number
): Promise<{ data: StockHistory[]; total: number }> => {
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, count, error } = await supabase
    .from(HISTORY_TABLE)
    .select('*', { count: 'exact' })
    .range(from, to)
    .order('timestamp', { ascending: false });

  if (error) return { data: [], total: 0 };
  return { data: (data || []) as StockHistory[], total: count || 0 };
};

// Helper untuk menambah history log
const addHistoryLog = async (log: Partial<StockHistory>) => {
  const { error } = await supabase.from(HISTORY_TABLE).insert([{
    ...log,
    timestamp: Date.now(),
    date: new Date().toLocaleDateString('id-ID')
  }]);
  if (error) console.error('[Supabase] Error addHistoryLog:', error);
};

// --- BARANG MASUK / KELUAR ---
const TABLE_BARANG_MASUK = 'barang_masuk';
const TABLE_BARANG_KELUAR = 'barang_keluar';

export const addBarangMasuk = async (
  entry: any, // Menggunakan any agar fleksibel dengan payload dari UI
  _unused?: any
): Promise<void> => {
  // 1. Simpan ke tabel barang_masuk
  const { error } = await supabase.from(TABLE_BARANG_MASUK).insert([entry]);
  if (error) console.error('[Supabase] Error addBarangMasuk:', error);

  // 2. Catat di history global
  await addHistoryLog({
    type: 'IN',
    itemName: entry.name || entry.partNumber,
    change: entry.qtyMasuk,
    description: `Barang Masuk: ${entry.keterangan || '-'}`,
    store: entry.store || 'GUDANG'
  });
};

export const addBarangKeluar = async (
  entry: any,
  _unused?: any
): Promise<void> => {
  // 1. Simpan ke tabel barang_keluar
  const { error } = await supabase.from(TABLE_BARANG_KELUAR).insert([entry]);
  if (error) console.error('[Supabase] Error addBarangKeluar:', error);

  // 2. Catat di history global
  await addHistoryLog({
    type: 'OUT',
    itemName: entry.name || entry.partNumber,
    change: entry.qtyKeluar,
    description: `Barang Keluar ke ${entry.customer || '-'} (${entry.keterangan || ''})`,
    store: entry.store || 'GUDANG'
  });
};

export const fetchBarangMasuk = async (store?: string | null): Promise<BarangMasuk[]> => {
  const { data, error } = await supabase.from(TABLE_BARANG_MASUK).select('*').order('created_at', { ascending: false });
  if (error) return [];
  return (data || []) as BarangMasuk[];
};

export const fetchBarangKeluar = async (store?: string | null): Promise<BarangKeluar[]> => {
  const { data, error } = await supabase.from(TABLE_BARANG_KELUAR).select('*').order('created_at', { ascending: false });
  if (error) return [];
  return (data || []) as BarangKeluar[];
};

export const fetchPriceHistoryBySource = async (partNumber: string, source: string): Promise<any[]> => {
  // Contoh implementasi mengambil history harga dari barang masuk
  const { data, error } = await supabase
    .from(TABLE_BARANG_MASUK)
    .select('tanggal, hargaSatuan, ecommerce')
    .eq('partNumber', partNumber)
    .order('tanggal', { ascending: false });

  if (error) return [];
  return data || [];
};

// --- SHOP FUNCTIONS ---
export const fetchShopItems = async (store?: string | null): Promise<InventoryItem[]> => {
  // Mengambil item yang quantity > 0 untuk toko
  const table = getTableName(store);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .gt('quantity', 0)
    .order('name');
    
  if (error) return [];
  return (data || []) as InventoryItem[];
};

// --- CHAT FUNCTIONS ---
const CHAT_SESSION_TABLE = 'chat_sessions';
const CHAT_MSG_TABLE = 'chat_messages';

export const fetchChatSessions = async (store?: string | null): Promise<ChatSession[]> => {
  const { data, error } = await supabase.from(CHAT_SESSION_TABLE).select('*').order('lastMessageTime', { ascending: false });
  if (error) return [];
  return (data || []) as ChatSession[];
};

export const fetchChatMessages = async (customerId: string, store?: string | null): Promise<any[]> => {
  const { data, error } = await supabase
    .from(CHAT_MSG_TABLE)
    .select('*')
    .eq('customerId', customerId)
    .order('timestamp', { ascending: true });

  if (error) return [];
  return data || [];
};

export const sendChatMessage = async (
  customerId: string,
  customerName: string,
  text: string,
  sender: 'user' | 'admin',
  store?: string | null
): Promise<void> => {
  const timestamp = Date.now();
  
  // 1. Simpan pesan
  await supabase.from(CHAT_MSG_TABLE).insert([{
    customerId, text, sender, timestamp, read: false
  }]);

  // 2. Update atau Buat Sesi
  const { data: existingSession } = await supabase
    .from(CHAT_SESSION_TABLE)
    .select('id')
    .eq('customerId', customerId)
    .single();

  if (existingSession) {
    await supabase.from(CHAT_SESSION_TABLE)
      .update({ lastMessage: text, lastMessageTime: timestamp, unreadCount: sender === 'user' ? 1 : 0 }) // Logic unread count perlu disempurnakan (increment)
      .eq('customerId', customerId);
  } else {
    await supabase.from(CHAT_SESSION_TABLE).insert([{
      customerId, customerName, lastMessage: text, lastMessageTime: timestamp, unreadCount: sender === 'user' ? 1 : 0
    }]);
  }
};

export const markMessagesAsRead = async (customerId: string, role: 'admin' | 'user', store?: string | null): Promise<void> => {
  // Reset unread count di session
  if (role === 'admin') {
    await supabase.from(CHAT_SESSION_TABLE).update({ unreadCount: 0 }).eq('customerId', customerId);
  }
};

// --- RETUR FUNCTIONS ---
const RETUR_TABLE = 'retur_records';

export const fetchRetur = async (store?: string | null): Promise<ReturRecord[]> => {
  const { data, error } = await supabase.from(RETUR_TABLE).select('*').order('date', { ascending: false });
  if (error) return [];
  return (data || []) as ReturRecord[];
};

export const saveReturRecord = async (record: ReturRecord, store?: string | null): Promise<void> => {
  const { error } = await supabase.from(RETUR_TABLE).insert([record]);
  if (error) console.error('[Supabase] Error saveReturRecord:', error);
};

export const fetchReturRecords = fetchRetur; // Alias
export const addReturTransaction = saveReturRecord; // Alias

export const updateReturKeterangan = async (returId: number, keterangan: string): Promise<void> => {
  await supabase.from(RETUR_TABLE).update({ keterangan }).eq('id', returId);
};

// --- SCAN RESI FUNCTIONS (Placeholder/Basic CRUD) ---
const SCAN_RESI_TABLE = 'scan_resi_logs';

export const fetchScanResiLogs = async (store?: string | null): Promise<ScanResiLog[]> => {
  const { data, error } = await supabase.from(SCAN_RESI_TABLE).select('*').order('created_at', { ascending: false });
  if (error) return [];
  return (data || []) as ScanResiLog[];
};

export const addScanResiLog = async (log: Omit<ScanResiLog, 'id'>, store?: string | null): Promise<void> => {
  await supabase.from(SCAN_RESI_TABLE).insert([log]);
};

export const saveScanResiLog = addScanResiLog; // Alias

export const updateScanResiLogField = async (logId: number, field: string, value: any): Promise<void> => {
  await supabase.from(SCAN_RESI_TABLE).update({ [field]: value }).eq('id', logId);
};

export const deleteScanResiLog = async (logId: number): Promise<void> => {
  await supabase.from(SCAN_RESI_TABLE).delete().eq('id', logId);
};

export const duplicateScanResiLog = async (logId: number): Promise<void> => {
  const { data } = await supabase.from(SCAN_RESI_TABLE).select('*').eq('id', logId).single();
  if (data) {
    const { id, ...rest } = data;
    await supabase.from(SCAN_RESI_TABLE).insert([rest]);
  }
};

export const processShipmentToOrders = async (resis: string[]): Promise<void> => {
  console.log('[Supabase] Processing shipment for resis:', resis);
  // Logika bisnis kompleks: Update status order berdasarkan resi
  // Perlu query ke tabel order cari yang resi-nya cocok, lalu update status 'shipped'
};

export const importScanResiFromExcel = async (data: any[]): Promise<{ success: boolean; skippedCount: number }> => {
  // Bulk insert
  const { error } = await supabase.from(SCAN_RESI_TABLE).insert(data);
  return { success: !error, skippedCount: 0 };
};