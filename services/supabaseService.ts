// FILE: services/supabaseService.ts
import { supabase } from './supabaseClient'; // Pastikan path ini benar sesuai file sebelumnya
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

// --- HELPER: NAMA TABEL ---
const getTableName = (store: string | null | undefined) => {
  if (store === 'mjm') return 'base_mjm';
  if (store === 'bjw') return 'base_bjw';
  return 'base'; // default
};

// --- HELPER: MAPPING DATA (PENTING!) ---
// Mengubah format database (snake_case) ke aplikasi (camelCase)
const mapItemFromDB = (item: any): InventoryItem => {
  return {
    ...item,
    // Mapping kolom yang namanya berbeda
    // Format: id_di_app: item.nama_kolom_di_db || item.id_di_app (fallback)
    partNumber: item.part_number || item.partNumber || '',
    initialStock: Number(item.initial_stock || item.initialStock || 0),
    costPrice: Number(item.cost_price || item.costPrice || 0),
    imageUrl: item.image_url || item.imageUrl || '',
    qtyIn: Number(item.qty_in || item.qtyIn || 0),
    qtyOut: Number(item.qty_out || item.qtyOut || 0),
    
    // Pastikan angka benar-benar angka
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
    
    // Kolom yang namanya sama (tidak perlu diubah, tapi dicantumkan agar aman)
    id: item.id,
    name: item.name,
    brand: item.brand,
    application: item.application,
    shelf: item.shelf,
    ecommerce: item.ecommerce,
    lastUpdated: item.last_updated || item.lastUpdated || Date.now()
  };
};

// Mengubah format aplikasi (camelCase) ke database (snake_case) untuk Save/Update
const mapItemToDB = (data: InventoryFormData | Partial<InventoryItem>) => {
  // Kita buat object baru dengan key snake_case
  const dbPayload: any = {
    name: data.name,
    brand: data.brand,
    application: data.application,
    shelf: data.shelf,
    quantity: Number(data.quantity) || 0,
    price: Number(data.price) || 0,
    ecommerce: data.ecommerce || '',
    
    // Kolom yang perlu di-rename ke snake_case
    part_number: data.partNumber,
    initial_stock: Number(data.initialStock) || 0,
    cost_price: Number(data.costPrice) || 0,
    image_url: data.imageUrl,
    qty_in: Number(data.qtyIn) || 0,
    qty_out: Number(data.qtyOut) || 0,
    last_updated: Date.now()
  };

  // Hapus field undefined agar tidak error
  Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);
  
  return dbPayload;
};

// --- INVENTORY FUNCTIONS ---

export const fetchInventory = async (store?: string | null): Promise<InventoryItem[]> => {
  const table = getTableName(store);
  console.log(`[Supabase] Fetching from ${table}...`);
  
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error(`[Supabase] Error fetchInventory from ${table}:`, error);
    return [];
  }

  // Lakukan mapping untuk setiap item
  return (data || []).map(mapItemFromDB);
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

  // Filter Search (Asumsi kolom di DB part_number/name)
  if (filters?.search) {
    query = query.or(`name.ilike.%${filters.search}%,part_number.ilike.%${filters.search}%`);
  }

  const { data, count, error } = await query
    .range(from, to)
    .order('name', { ascending: true });

  if (error) {
    console.error('[Supabase] Error fetchInventoryPaginated:', error);
    return { data: [], total: 0 };
  }

  return { 
    data: (data || []).map(mapItemFromDB), 
    total: count || 0 
  };
};

export const fetchInventoryStats = async (store: string | null): Promise<any> => {
  // Kita fetch semua dulu untuk hitung manual (atau bisa pakai query count di masa depan)
  const items = await fetchInventory(store);
  
  const totalItems = items.length;
  const totalValue = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const lowStock = items.filter(item => item.quantity < 5).length; 

  return { totalItems, totalValue, lowStock };
};

export const fetchInventoryAllFiltered = async (store: string | null, filters?: any): Promise<InventoryItem[]> => {
  const items = await fetchInventory(store);
  return items; // Logic filter bisa ditambahkan di sini atau di client
};

export const addInventory = async (data: InventoryFormData, store?: string | null): Promise<boolean> => {
  const table = getTableName(store);
  
  // Konversi data ke format DB (snake_case)
  const payload = mapItemToDB(data);

  console.log('[Supabase] Adding item:', payload);

  const { error } = await supabase.from(table).insert([payload]);
  
  if (error) {
    console.error('[Supabase] Error addInventory:', error);
    // Tampilkan pesan error spesifik jika duplikat
    if (error.code === '23505') { 
        alert('Gagal: Part Number sudah ada!'); 
    }
    return false;
  }
  return true;
};

export const updateInventory = async (
  item: Partial<InventoryItem> & { id?: string },
  _unused?: any, 
  store?: string | null
): Promise<boolean> => {
  const table = getTableName(store);
  const id = item.id;
  
  if (!id) {
    console.error('[Supabase] Error updateInventory: No ID provided');
    return false;
  }

  // Konversi data update ke format DB
  const updates = mapItemToDB(item);

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
  if (error) return false;
  return true;
};

export const getItemByPartNumber = async (partNumber: string, store?: string | null): Promise<InventoryItem | null> => {
  const table = getTableName(store);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('part_number', partNumber) // Query pakai snake_case
    .maybeSingle();

  if (error || !data) return null;
  return mapItemFromDB(data);
};

export const saveItemImages = async (itemId: string, images: string[], store?: string | null): Promise<void> => {
  if (images.length > 0) {
    // Asumsi kolom DB image_url
    await updateInventory({ id: itemId, imageUrl: images[0] }, undefined, store);
  }
};

// --- ORDER FUNCTIONS ---
// Order biasanya menggunakan JSONB untuk items, jadi strukturnya lebih fleksibel
const ORDER_TABLE = 'orders';

export const fetchOrders = async (store?: string | null): Promise<Order[]> => {
  const { data, error } = await supabase.from(ORDER_TABLE).select('*').order('timestamp', { ascending: false });

  if (error) {
    console.error('[Supabase] Error fetchOrders:', error);
    return [];
  }
  
  return (data || []).map((order: any) => ({
    ...order,
    items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items
  })) as Order[];
};

export const saveOrder = async (order: Order, store?: string | null): Promise<boolean> => {
  const payload = {
    ...order,
    items: JSON.stringify(order.items), // Serialize items ke JSON string
  };
  const { error } = await supabase.from(ORDER_TABLE).insert([payload]);
  if (error) return false;
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
  return !error;
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
  return !error;
};

// --- HISTORY FUNCTIONS ---
const HISTORY_TABLE = 'stock_history';

export const fetchHistory = async (store?: string | null): Promise<StockHistory[]> => {
  const { data, error } = await supabase
    .from(HISTORY_TABLE)
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(500);

  if (error) return [];
  return (data || []) as StockHistory[];
};

export const fetchItemHistory = async (itemId: string, store?: string | null): Promise<StockHistory[]> => {
  const { data, error } = await supabase
    .from(HISTORY_TABLE)
    .select('*')
    .ilike('description', `%${itemId}%`)
    .order('timestamp', { ascending: false });
  if (error) return [];
  return (data || []) as StockHistory[];
};

export const fetchHistoryLogsPaginated = async (store: string | null, page: number, perPage: number): Promise<{ data: StockHistory[]; total: number }> => {
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const { data, count, error } = await supabase
    .from(HISTORY_TABLE)
    .select('*', { count: 'exact' })
    .range(from, to)
    .order('timestamp', { ascending: false });
  return { data: (data || []) as StockHistory[], total: count || 0 };
};

const addHistoryLog = async (log: Partial<StockHistory>) => {
  await supabase.from(HISTORY_TABLE).insert([{
    ...log,
    timestamp: Date.now(),
    date: new Date().toLocaleDateString('id-ID')
  }]);
};

// --- BARANG MASUK / KELUAR ---
const TABLE_BARANG_MASUK = 'barang_masuk';
const TABLE_BARANG_KELUAR = 'barang_keluar';

export const addBarangMasuk = async (entry: any, _unused?: any): Promise<void> => {
  const payload = {
    ...entry,
    part_number: entry.partNumber, // Mapping manual jika perlu
    qty_masuk: entry.qtyMasuk,
    harga_satuan: entry.hargaSatuan,
    harga_total: entry.hargaTotal
    // Tambahkan mapping lain sesuai kolom DB Anda
  };
  
  // Bersihkan field undefined/camelCase lama agar tidak error
  delete payload.partNumber; delete payload.qtyMasuk; delete payload.hargaSatuan; delete payload.hargaTotal;

  const { error } = await supabase.from(TABLE_BARANG_MASUK).insert([payload]);
  
  if (!error) {
    await addHistoryLog({
      type: 'IN',
      itemName: entry.name || entry.partNumber,
      change: entry.qtyMasuk,
      description: `Barang Masuk: ${entry.keterangan || '-'}`,
      store: entry.store || 'GUDANG'
    });
  }
};

export const addBarangKeluar = async (entry: any, _unused?: any): Promise<void> => {
  const payload = {
    ...entry,
    part_number: entry.partNumber,
    qty_keluar: entry.qtyKeluar,
    harga_satuan: entry.hargaSatuan,
    harga_total: entry.hargaTotal
  };
   delete payload.partNumber; delete payload.qtyKeluar; delete payload.hargaSatuan; delete payload.hargaTotal;

  const { error } = await supabase.from(TABLE_BARANG_KELUAR).insert([payload]);

  if (!error) {
    await addHistoryLog({
      type: 'OUT',
      itemName: entry.name || entry.partNumber,
      change: entry.qtyKeluar,
      description: `Barang Keluar ke ${entry.customer || '-'} (${entry.keterangan || ''})`,
      store: entry.store || 'GUDANG'
    });
  }
};

export const fetchBarangMasuk = async (store?: string | null): Promise<BarangMasuk[]> => {
  const { data } = await supabase.from(TABLE_BARANG_MASUK).select('*').order('created_at', { ascending: false });
  return (data || []) as BarangMasuk[];
};

export const fetchBarangKeluar = async (store?: string | null): Promise<BarangKeluar[]> => {
  const { data } = await supabase.from(TABLE_BARANG_KELUAR).select('*').order('created_at', { ascending: false });
  return (data || []) as BarangKeluar[];
};

export const fetchPriceHistoryBySource = async (partNumber: string, source: string): Promise<any[]> => {
  const { data } = await supabase
    .from(TABLE_BARANG_MASUK)
    .select('tanggal, harga_satuan, ecommerce')
    .eq('part_number', partNumber)
    .order('tanggal', { ascending: false });
  return data || [];
};

// --- SHOP FUNCTIONS ---
export const fetchShopItems = async (store?: string | null): Promise<InventoryItem[]> => {
  const items = await fetchInventory(store);
  return items.filter(i => i.quantity > 0);
};

// --- CHAT & LAINNYA ---
// (Fungsi chat dan scan resi dibiarkan sederhana/langsung)
const CHAT_SESSION_TABLE = 'chat_sessions';
const CHAT_MSG_TABLE = 'chat_messages';

export const fetchChatSessions = async (store?: string | null): Promise<ChatSession[]> => {
  const { data } = await supabase.from(CHAT_SESSION_TABLE).select('*').order('lastMessageTime', { ascending: false });
  return (data || []) as ChatSession[];
};

export const fetchChatMessages = async (customerId: string, store?: string | null): Promise<any[]> => {
  const { data } = await supabase.from(CHAT_MSG_TABLE).select('*').eq('customerId', customerId).order('timestamp', { ascending: true });
  return data || [];
};

export const sendChatMessage = async (customerId: string, customerName: string, text: string, sender: 'user' | 'admin', store?: string | null): Promise<void> => {
  const timestamp = Date.now();
  await supabase.from(CHAT_MSG_TABLE).insert([{ customerId, text, sender, timestamp, read: false }]);
  
  const { data } = await supabase.from(CHAT_SESSION_TABLE).select('id').eq('customerId', customerId).single();
  if (data) {
    await supabase.from(CHAT_SESSION_TABLE).update({ lastMessage: text, lastMessageTime: timestamp }).eq('customerId', customerId);
  } else {
    await supabase.from(CHAT_SESSION_TABLE).insert([{ customerId, customerName, lastMessage: text, lastMessageTime: timestamp, unreadCount: sender === 'user' ? 1 : 0 }]);
  }
};

export const markMessagesAsRead = async (customerId: string, role: 'admin' | 'user', store?: string | null): Promise<void> => {
  if (role === 'admin') await supabase.from(CHAT_SESSION_TABLE).update({ unreadCount: 0 }).eq('customerId', customerId);
};

// --- RETUR & SCAN RESI (Pass-through) ---
const RETUR_TABLE = 'retur_records';
const SCAN_RESI_TABLE = 'scan_resi_logs';

export const fetchRetur = async (store?: string | null): Promise<ReturRecord[]> => {
  const { data } = await supabase.from(RETUR_TABLE).select('*').order('date', { ascending: false });
  return (data || []) as ReturRecord[];
};
export const saveReturRecord = async (record: ReturRecord, store?: string | null): Promise<void> => {
  await supabase.from(RETUR_TABLE).insert([record]);
};
export const fetchReturRecords = fetchRetur;
export const addReturTransaction = saveReturRecord;
export const updateReturKeterangan = async (id: number, ket: string): Promise<void> => {
  await supabase.from(RETUR_TABLE).update({ keterangan: ket }).eq('id', id);
};

export const fetchScanResiLogs = async (store?: string | null): Promise<ScanResiLog[]> => {
  const { data } = await supabase.from(SCAN_RESI_TABLE).select('*').order('created_at', { ascending: false });
  return (data || []) as ScanResiLog[];
};
export const addScanResiLog = async (log: Omit<ScanResiLog, 'id'>, store?: string | null): Promise<void> => {
  await supabase.from(SCAN_RESI_TABLE).insert([log]);
};
export const saveScanResiLog = addScanResiLog;
export const updateScanResiLogField = async (id: number, field: string, value: any): Promise<void> => {
  await supabase.from(SCAN_RESI_TABLE).update({ [field]: value }).eq('id', id);
};
export const deleteScanResiLog = async (id: number): Promise<void> => {
  await supabase.from(SCAN_RESI_TABLE).delete().eq('id', id);
};
export const duplicateScanResiLog = async (id: number): Promise<void> => {
  const { data } = await supabase.from(SCAN_RESI_TABLE).select('*').eq('id', id).single();
  if (data) { const { id: _old, ...rest } = data; await supabase.from(SCAN_RESI_TABLE).insert([rest]); }
};
export const processShipmentToOrders = async (resis: string[]): Promise<void> => { console.log('Processing:', resis); };
export const importScanResiFromExcel = async (data: any[]): Promise<{ success: boolean; skippedCount: number }> => {
  const { error } = await supabase.from(SCAN_RESI_TABLE).insert(data);
  return { success: !error, skippedCount: 0 };
};