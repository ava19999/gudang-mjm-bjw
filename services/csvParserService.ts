// FILE: services/csvParserService.ts
import { ParsedCSVItem } from '../types';

const EXCHANGE_RATES: Record<string, number> = {
  'MYR': 3500,
  'PHP': 280,
  'SGD': 11500,
  'USD': 16000,
  'IDR': 1
};

// --- FUNGSI FORMAT ANGKA YANG SUDAH DIPERBAIKI ---
const cleanCurrency = (val: string): { amount: number, rate: number } => {
  if (!val) return { amount: 0, rate: 1 };

  let rate = 1;
  const original = val.toUpperCase();

  // 1. Deteksi Rate Berdasarkan Simbol
  if (original.includes('RM')) rate = EXCHANGE_RATES['MYR'];
  else if (original.includes('PHP') || original.includes('₱')) rate = EXCHANGE_RATES['PHP'];
  else if (original.includes('SGD') || original.includes('S$')) rate = EXCHANGE_RATES['SGD'];
  else if (original.includes('USD') || original.includes('$')) rate = EXCHANGE_RATES['USD'];
  
  // 2. Bersihkan string (Hanya sisakan Angka, Titik, Minus, dan Koma)
  let numStr = val.replace(/[^0-9.,-]/g, '');

  // 3. Logika Parsing Angka
  if (rate === 1) {
    // --- MODE IDR (INDONESIA) ---
    // Format Masuk: "60.000" (Ribuan pakai titik) atau "60.000,00" (Desimal pakai koma)
    
    // Langkah A: Buang semua titik (karena itu pemisah ribuan di Indo)
    numStr = numStr.replace(/\./g, '');
    
    // Langkah B: Ganti koma menjadi titik (agar terbaca desimal di JS)
    numStr = numStr.replace(/,/g, '.');
  } else {
    // --- MODE ASING (US/International) ---
    // Format Masuk: "1,000.50" (Ribuan pakai koma, desimal pakai titik)
    // Langkah: Buang koma (pemisah ribuan), biarkan titik (desimal)
    numStr = numStr.replace(/,/g, '');
  }

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

// Helper: Deteksi Platform (Update agar support variasi header)
export const detectCSVPlatform = (text: string): 'shopee' | 'tiktok' | 'unknown' => {
  // Shopee: Cek kombinasi kolom khas
  const isShopee = (
    (text.includes('No. Resi') || text.includes('No. Pesanan')) && 
    (text.includes('Username (Pembeli)') || text.includes('Status Pesanan') || text.includes('Opsi Pengiriman') || text.includes('Nama Produk') || text.includes('Nama Variasi'))
  );

  if (isShopee) return 'shopee';
  
  // TikTok:
  if (text.includes('Tracking ID') && text.includes('Seller SKU')) return 'tiktok';
  
  return 'unknown';
};

export const parseShopeeCSV = (text: string): ParsedCSVItem[] => {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  
  // Cari baris header (bisa jadi bukan di baris pertama)
  let headerIdx = lines.findIndex(l => l.includes('No. Resi'));
  if (headerIdx === -1) {
    headerIdx = lines.findIndex(l => l.includes('No. Pesanan'));
  }
  
  if (headerIdx === -1) return [];

  const headers = parseCSVLine(lines[headerIdx]);
  const dataRows = lines.slice(headerIdx + 1);
  
  // Map index kolom dengan fallback
  const idxResi = headers.findIndex(h => h.includes('No. Resi'));
  const idxOrder = headers.findIndex(h => h.includes('No. Pesanan'));
  const idxStatus = headers.findIndex(h => h.includes('Status Pesanan')); 
  const idxOpsiKirim = headers.findIndex(h => h.includes('Opsi Pengiriman'));
  const idxUser = headers.findIndex(h => h.includes('Username (Pembeli)'));
  const idxSKU = headers.findIndex(h => h.includes('Nomor Referensi SKU') || h.includes('SKU Induk') || h.includes('SKU'));
  
  let idxNama = headers.findIndex(h => h.includes('Nama Produk'));
  if (idxNama === -1) idxNama = headers.findIndex(h => h.includes('Nama Variasi'));

  const idxQty = headers.findIndex(h => h.includes('Jumlah'));
  const idxTotal = headers.findIndex(h => h.includes('Total Harga Produk')); 
  
  return dataRows.map(line => {
    const cols = parseCSVLine(line);
    if (cols.length < 5) return null;

    const rawStatus = (idxStatus !== -1 && cols[idxStatus]) ? cols[idxStatus].replace(/["']/g, '').trim() : '';
    const statusLower = rawStatus.toLowerCase();
    
    // SKIP jika Batal atau Belum Bayar
    if (statusLower.includes('batal') || statusLower.includes('belum bayar')) {
      return null;
    }

    const { amount, rate } = (idxTotal !== -1) ? cleanCurrency(cols[idxTotal]) : { amount: 0, rate: 1 };
    const totalPriceIDR = amount * rate;
    
    const rawName = (idxNama !== -1) ? cols[idxNama] : '';
    const finalName = rawName ? rawName.replace(/["']/g, '').trim() : 'Produk Shopee';

    return {
      resi: (idxResi !== -1 && cols[idxResi]) ? cols[idxResi].replace(/["']/g, '') : '',
      order_id: (idxOrder !== -1 && cols[idxOrder]) ? cols[idxOrder].replace(/["']/g, '') : '',
      order_status: rawStatus,
      shipping_option: (idxOpsiKirim !== -1 && cols[idxOpsiKirim]) ? cols[idxOpsiKirim].replace(/["']/g, '') : '',
      customer: (idxUser !== -1 && cols[idxUser]) ? cols[idxUser].replace(/["']/g, '') : '-',
      part_number: (idxSKU !== -1 && cols[idxSKU]) ? cols[idxSKU].replace(/["']/g, '') : '',
      product_name: finalName, 
      quantity: (idxQty !== -1) ? (parseInt(cols[idxQty]) || 1) : 1,
      total_price: totalPriceIDR,
      original_currency_val: (idxTotal !== -1) ? cols[idxTotal] : '0',
      ecommerce: 'SHOPEE'
    };
  }).filter((item): item is ParsedCSVItem => item !== null && item.resi !== '');
};

export const parseTikTokCSV = (text: string): ParsedCSVItem[] => {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  const headerIdx = lines.findIndex(l => l.includes('Tracking ID'));
  if (headerIdx === -1) return [];

  const headers = parseCSVLine(lines[headerIdx]);
  const dataRows = lines.slice(headerIdx + 1);

  const idxResi = headers.findIndex(h => h.includes('Tracking ID'));
  const idxOrder = headers.findIndex(h => h.includes('Order ID'));
  const idxStatus = headers.findIndex(h => h.includes('Order Status'));
  const idxShipping = headers.findIndex(h => h.includes('Shipping Provider') || h.includes('Shipping Option'));
  const idxUser = headers.findIndex(h => h.includes('Buyer Username'));
  const idxSKU = headers.findIndex(h => h.includes('Seller SKU'));
  const idxProductName = headers.findIndex(h => h.includes('Product Name'));
  const idxQty = headers.findIndex(h => h.includes('Quantity'));
  const idxTotal = headers.findIndex(h => h.includes('SKU Subtotal After Discount'));

  return dataRows.map(line => {
    const cols = parseCSVLine(line);
    if (cols.length < headers.length) return null;

    const rawStatus = cols[idxStatus]?.replace(/["']/g, '').trim() || '';
    const statusLower = rawStatus.toLowerCase();

    if (statusLower.includes('unpaid') || statusLower.includes('belum bayar') || 
        statusLower.includes('cancelled') || statusLower.includes('batal')) {
      return null;
    }

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