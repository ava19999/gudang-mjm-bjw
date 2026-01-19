// FILE: services/csvParserService.ts
import { ParsedCSVItem } from '../types';

const EXCHANGE_RATES: Record<string, number> = {
  'MYR': 3500,
  'PHP': 280,
  'SGD': 11500,
  'USD': 16000,
  'IDR': 1
};

// Helper: Membersihkan string currency
const cleanCurrency = (val: string): { amount: number, rate: number } => {
  if (!val) return { amount: 0, rate: 1 };
  
  const cleanStr = val.replace(/[,]/g, ''); 
  let rate = 1;

  if (cleanStr.includes('RM')) rate = EXCHANGE_RATES['MYR'];
  else if (cleanStr.includes('PHP') || cleanStr.includes('₱')) rate = EXCHANGE_RATES['PHP'];
  else if (cleanStr.includes('SGD') || cleanStr.includes('S$')) rate = EXCHANGE_RATES['SGD'];
  else if (cleanStr.includes('USD') || cleanStr.includes('$')) rate = EXCHANGE_RATES['USD'];
  
  const numStr = cleanStr.replace(/[^0-9.]/g, '');
  const amount = parseFloat(numStr) || 0;
  
  return { amount, rate };
};

// Helper: Parse CSV Line manually
const parseCSVLine = (line: string): string[] => {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

export const detectCSVPlatform = (text: string): 'shopee' | 'tiktok' | 'unknown' => {
  if (text.includes('No. Resi') && text.includes('Username (Pembeli)')) return 'shopee';
  if (text.includes('Tracking ID') && text.includes('Seller SKU')) return 'tiktok';
  return 'unknown';
};

export const parseShopeeCSV = (text: string): ParsedCSVItem[] => {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  const headerIdx = lines.findIndex(l => l.includes('No. Resi'));
  if (headerIdx === -1) return [];

  const headers = parseCSVLine(lines[headerIdx]);
  const dataRows = lines.slice(headerIdx + 1);
  
  // Map index kolom
  const idxResi = headers.findIndex(h => h.includes('No. Resi'));
  const idxOrder = headers.findIndex(h => h.includes('No. Pesanan'));
  const idxStatus = headers.findIndex(h => h.includes('Status Pesanan')); // WAJIB ADA
  const idxOpsiKirim = headers.findIndex(h => h.includes('Opsi Pengiriman'));
  const idxUser = headers.findIndex(h => h.includes('Username (Pembeli)'));
  const idxSKU = headers.findIndex(h => h.includes('Nomor Referensi SKU'));
  
  let idxNama = headers.findIndex(h => h.includes('Nama Produk'));
  if (idxNama === -1) idxNama = headers.findIndex(h => h.includes('Nama Variasi'));

  const idxQty = headers.findIndex(h => h.includes('Jumlah'));
  const idxTotal = headers.findIndex(h => h.includes('Total Harga Produk')); 
  
  return dataRows.map(line => {
    const cols = parseCSVLine(line);
    if (cols.length < headers.length) return null;

    // --- LOGIKA FILTER STATUS ---
    const rawStatus = cols[idxStatus]?.replace(/["']/g, '').trim() || '';
    const statusLower = rawStatus.toLowerCase();
    
    // SKIP jika Batal atau Belum Bayar
    if (statusLower.includes('batal') || statusLower.includes('belum bayar')) {
      return null;
    }
    // ---------------------------

    const { amount, rate } = cleanCurrency(cols[idxTotal]);
    const totalPriceIDR = amount * rate;
    const rawName = cols[idxNama] || '';
    const finalName = rawName.replace(/["']/g, '').trim() || 'Produk Shopee';

    return {
      resi: cols[idxResi]?.replace(/["']/g, '') || '',
      order_id: cols[idxOrder]?.replace(/["']/g, '') || '',
      order_status: rawStatus,
      shipping_option: cols[idxOpsiKirim]?.replace(/["']/g, '') || '',
      customer: cols[idxUser]?.replace(/["']/g, '') || '',
      part_number: cols[idxSKU]?.replace(/["']/g, '') || '',
      product_name: finalName, 
      quantity: parseInt(cols[idxQty]) || 1,
      total_price: totalPriceIDR,
      original_currency_val: cols[idxTotal],
      ecommerce: 'SHOPEE'
    };
  }).filter((item): item is ParsedCSVItem => item !== null);
};

export const parseTikTokCSV = (text: string): ParsedCSVItem[] => {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  const headerIdx = lines.findIndex(l => l.includes('Tracking ID'));
  if (headerIdx === -1) return [];

  const headers = parseCSVLine(lines[headerIdx]);
  const dataRows = lines.slice(headerIdx + 1);

  const idxResi = headers.findIndex(h => h.includes('Tracking ID'));
  const idxOrder = headers.findIndex(h => h.includes('Order ID'));
  const idxStatus = headers.findIndex(h => h.includes('Order Status')); // WAJIB ADA
  const idxShipping = headers.findIndex(h => h.includes('Shipping Provider') || h.includes('Shipping Option'));
  const idxUser = headers.findIndex(h => h.includes('Buyer Username'));
  const idxSKU = headers.findIndex(h => h.includes('Seller SKU'));
  const idxProductName = headers.findIndex(h => h.includes('Product Name'));
  const idxQty = headers.findIndex(h => h.includes('Quantity'));
  const idxTotal = headers.findIndex(h => h.includes('SKU Subtotal After Discount'));

  return dataRows.map(line => {
    const cols = parseCSVLine(line);
    if (cols.length < headers.length) return null;

    // --- LOGIKA FILTER STATUS ---
    const rawStatus = cols[idxStatus]?.replace(/["']/g, '').trim() || '';
    const statusLower = rawStatus.toLowerCase();

    // SKIP jika Unpaid, Cancelled, Batal, atau Belum Bayar
    if (statusLower.includes('unpaid') || statusLower.includes('belum bayar') || 
        statusLower.includes('cancelled') || statusLower.includes('batal')) {
      return null;
    }
    // ---------------------------

    const { amount, rate } = cleanCurrency(cols[idxTotal]);
    const rawName = idxProductName !== -1 ? cols[idxProductName] : '';
    const finalName = rawName ? rawName.replace(/["']/g, '').trim() : 'Produk TikTok';

    return {
      resi: cols[idxResi]?.replace(/["']/g, '') || '',
      order_id: cols[idxOrder]?.replace(/["']/g, '') || '',
      order_status: rawStatus,
      shipping_option: cols[idxShipping]?.replace(/["']/g, '') || '',
      customer: cols[idxUser]?.replace(/["']/g, '') || '',
      part_number: cols[idxSKU]?.replace(/["']/g, '') || '',
      product_name: finalName,
      quantity: parseInt(cols[idxQty]) || 1,
      total_price: amount * rate,
      original_currency_val: cols[idxTotal],
      ecommerce: 'TIKTOK'
    };
  }).filter((item): item is ParsedCSVItem => item !== null);
};