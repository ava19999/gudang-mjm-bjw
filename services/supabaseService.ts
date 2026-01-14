// Mock service for static UI version - replaces supabaseService.ts
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

// Mock data
const mockInventory: InventoryItem[] = [];
const mockOrders: Order[] = [];
const mockHistory: StockHistory[] = [];

// --- INVENTORY FUNCTIONS ---
export const fetchInventory = async (store?: string | null): Promise<InventoryItem[]> => {
  return Promise.resolve([...mockInventory]);
};

export const fetchInventoryPaginated = async (
  store: string | null,
  page: number,
  perPage: number,
  filters?: any
): Promise<{ data: InventoryItem[]; total: number }> => {
  return Promise.resolve({ data: [], total: 0 });
};

export const fetchInventoryStats = async (store: string | null): Promise<any> => {
  return Promise.resolve({
    totalItems: 0,
    totalValue: 0,
    lowStock: 0
  });
};

export const fetchInventoryAllFiltered = async (store: string | null, filters?: any): Promise<InventoryItem[]> => {
  return Promise.resolve([]);
};

export const addInventory = async (data: InventoryFormData, store?: string | null): Promise<void> => {
  console.log('Mock: addInventory called', data);
  return Promise.resolve();
};

export const updateInventory = async (
  id: string,
  data: Partial<InventoryFormData>,
  store?: string | null
): Promise<void> => {
  console.log('Mock: updateInventory called', id, data);
  return Promise.resolve();
};

export const deleteInventory = async (id: string, store?: string | null): Promise<void> => {
  console.log('Mock: deleteInventory called', id);
  return Promise.resolve();
};

export const getItemByPartNumber = async (partNumber: string, store?: string | null): Promise<InventoryItem | null> => {
  return Promise.resolve(null);
};

export const saveItemImages = async (itemId: string, images: string[], store?: string | null): Promise<void> => {
  console.log('Mock: saveItemImages called', itemId);
  return Promise.resolve();
};

// --- ORDER FUNCTIONS ---
export const fetchOrders = async (store?: string | null): Promise<Order[]> => {
  return Promise.resolve([...mockOrders]);
};

export const saveOrder = async (order: Order, store?: string | null): Promise<void> => {
  console.log('Mock: saveOrder called', order);
  return Promise.resolve();
};

export const updateOrderStatusService = async (
  orderId: string,
  newStatus: Order['status'],
  store?: string | null
): Promise<void> => {
  console.log('Mock: updateOrderStatusService called', orderId, newStatus);
  return Promise.resolve();
};

export const updateOrderData = async (orderId: string, updates: Partial<Order>, store?: string | null): Promise<void> => {
  console.log('Mock: updateOrderData called', orderId, updates);
  return Promise.resolve();
};

// --- HISTORY FUNCTIONS ---
export const fetchHistory = async (store?: string | null): Promise<StockHistory[]> => {
  return Promise.resolve([...mockHistory]);
};

export const fetchItemHistory = async (itemId: string, store?: string | null): Promise<StockHistory[]> => {
  return Promise.resolve([]);
};

export const fetchHistoryLogsPaginated = async (
  store: string | null,
  page: number,
  perPage: number,
  filters?: any
): Promise<{ data: StockHistory[]; total: number }> => {
  return Promise.resolve({ data: [], total: 0 });
};

export const addBarangMasuk = async (
  itemId: string,
  quantity: number,
  price: number,
  reason: string,
  resi: string,
  tempo: string,
  customer: string,
  store?: string | null
): Promise<void> => {
  console.log('Mock: addBarangMasuk called');
  return Promise.resolve();
};

export const addBarangKeluar = async (
  itemId: string,
  quantity: number,
  price: number,
  reason: string,
  resi: string,
  tempo: string,
  customer: string,
  store?: string | null
): Promise<void> => {
  console.log('Mock: addBarangKeluar called');
  return Promise.resolve();
};

export const fetchBarangMasuk = async (store?: string | null): Promise<BarangMasuk[]> => {
  return Promise.resolve([]);
};

export const fetchPriceHistoryBySource = async (
  partNumber: string,
  source: string,
  store?: string | null
): Promise<any[]> => {
  return Promise.resolve([]);
};

// --- SHOP FUNCTIONS ---
export const fetchShopItems = async (store?: string | null): Promise<InventoryItem[]> => {
  return Promise.resolve([]);
};

// --- CHAT FUNCTIONS ---
export const fetchChatSessions = async (store?: string | null): Promise<ChatSession[]> => {
  return Promise.resolve([]);
};

export const fetchChatMessages = async (customerId: string, store?: string | null): Promise<any[]> => {
  return Promise.resolve([]);
};

export const sendChatMessage = async (
  customerId: string,
  customerName: string,
  text: string,
  sender: 'user' | 'admin',
  store?: string | null
): Promise<void> => {
  console.log('Mock: sendChatMessage called');
  return Promise.resolve();
};

export const markMessagesAsRead = async (
  customerId: string,
  role: 'admin' | 'user',
  store?: string | null
): Promise<void> => {
  console.log('Mock: markMessagesAsRead called');
  return Promise.resolve();
};

// --- RETUR FUNCTIONS ---
export const fetchRetur = async (store?: string | null): Promise<ReturRecord[]> => {
  return Promise.resolve([]);
};

export const saveReturRecord = async (record: ReturRecord, store?: string | null): Promise<void> => {
  console.log('Mock: saveReturRecord called');
  return Promise.resolve();
};

// --- SCAN RESI FUNCTIONS ---
export const saveScanResiLog = async (log: Omit<ScanResiLog, 'id'>, store?: string | null): Promise<void> => {
  console.log('Mock: saveScanResiLog called');
  return Promise.resolve();
};

export const fetchScanResiLogs = async (store?: string | null): Promise<ScanResiLog[]> => {
  return Promise.resolve([]);
};

export const addScanResiLog = async (log: Omit<ScanResiLog, 'id'>, store?: string | null): Promise<void> => {
  console.log('Mock: addScanResiLog called');
  return Promise.resolve();
};

export const updateScanResiLogField = async (
  logId: number,
  field: string,
  value: any,
  store?: string | null
): Promise<void> => {
  console.log('Mock: updateScanResiLogField called');
  return Promise.resolve();
};

export const importScanResiFromExcel = async (data: any[], store?: string | null): Promise<{ success: boolean; skippedCount: number }> => {
  console.log('Mock: importScanResiFromExcel called');
  return Promise.resolve({ success: true, skippedCount: 0 });
};

export const processShipmentToOrders = async (resis: string[], store?: string | null): Promise<void> => {
  console.log('Mock: processShipmentToOrders called');
  return Promise.resolve();
};

export const duplicateScanResiLog = async (logId: number, store?: string | null): Promise<void> => {
  console.log('Mock: duplicateScanResiLog called');
  return Promise.resolve();
};

export const deleteScanResiLog = async (logId: number, store?: string | null): Promise<void> => {
  console.log('Mock: deleteScanResiLog called');
  return Promise.resolve();
};

export const fetchReturRecords = async (store?: string | null): Promise<ReturRecord[]> => {
  return Promise.resolve([]);
};

export const updateReturKeterangan = async (
  returId: number,
  keterangan: string,
  store?: string | null
): Promise<void> => {
  console.log('Mock: updateReturKeterangan called');
  return Promise.resolve();
};

export const addReturTransaction = async (record: ReturRecord, store?: string | null): Promise<void> => {
  console.log('Mock: addReturTransaction called');
  return Promise.resolve();
};
