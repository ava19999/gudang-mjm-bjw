// FILE: services/csvParserService.ts
import { ParsedCSVItem } from '../types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Konversi scientific notation ke string angka penuh
// Contoh: "1.10032E+13" -> "11003200000000" atau "1.10032055095560E13" -> "11003205509556"
const fixScientificNotation = (val: string): string => {
  if (!val) return '';
  const trimmed = val.trim();
  
  // Cek apakah dalam format scientific notation (mengandung E atau e)
  if (/[eE][+-]?\d+/.test(trimmed)) {
    try {
      // Parse sebagai number lalu konversi ke string tanpa scientific notation
      const num = parseFloat(trimmed);
      if (!isNaN(num)) {
        // Gunakan toFixed(0) untuk mendapat integer, atau toLocaleString untuk format penuh
        return num.toLocaleString('fullwide', { useGrouping: false });
      }
    } catch (e) {
      // Jika gagal, kembalikan nilai asli
    }
  }
  return trimmed;
};

// Format customer: UPPERCASE, ambil sampai karakter sebelum (
const formatCustomer = (val: string): string => {
  if (!val) return '-';
  let cleaned = val.replace(/["']/g, '').trim();
  const parenIdx = cleaned.indexOf('(');
  if (parenIdx > 0) cleaned = cleaned.substring(0, parenIdx).trim();
  return cleaned.toUpperCase();
};

// Format nama produk: "Nama Produk (Variasi)" atau hanya "Nama Produk" jika variasi kosong
const formatNamaProduk = (nama: string, variasi: string): string => {
  const cleanNama = (nama || '').replace(/["']/g, '').trim();
  const cleanVariasi = (variasi || '').replace(/["']/g, '').trim();
  
  if (!cleanNama) return 'Produk Unknown';
  if (!cleanVariasi) return cleanNama;
  return `${cleanNama} (${cleanVariasi})`;
};

// Parse currency Indonesia: "25.000" -> 25000, "60.000,00" -> 60000
const parseCurrencyIDR = (val: string): number => {
  if (!val) return 0;
  // Buang semua karakter non-angka kecuali titik, koma, minus
  let numStr = val.replace(/[^0-9.,-]/g, '');
  // Buang titik (ribuan Indonesia)
  numStr = numStr.replace(/\./g, '');
  // Ganti koma jadi titik (desimal Indonesia)
  numStr = numStr.replace(/,/g, '.');
  return parseFloat(numStr) || 0;
};

// Parse CSV Line with proper quote handling
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
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

// ============================================================================
// PLATFORM DETECTION
// ============================================================================
export const detectCSVPlatform = (text: string): 'shopee' | 'tiktok' | 'unknown' => {
  // Shopee: Header mengandung "No. Resi" atau "No. Pesanan" + "Username (Pembeli)"
  const isShopee = (
    (text.includes('No. Resi') || text.includes('No. Pesanan')) && 
    (text.includes('Username (Pembeli)') || text.includes('Nama Produk'))
  );
  if (isShopee) return 'shopee';
  
  // TikTok: Header mengandung "Tracking ID" dan "Seller SKU"
  if (text.includes('Tracking ID') && text.includes('Seller SKU')) return 'tiktok';
  
  return 'unknown';
};

// ============================================================================
// SHOPEE PARSER
// Header: Baris 1
// Data: Mulai Baris 2
// Filter: Skip "Batal" dan "Belum Bayar"
// Skip jika resi kosong
// Dedupe: Sama resi + customer + nama_produk = skip
// ============================================================================
export const parseShopeeCSV = (text: string): ParsedCSVItem[] => {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  
  // Header di baris 1 (index 0)
  const headers = parseCSVLine(lines[0]);
  const dataRows = lines.slice(1); // Data mulai baris 2 (index 1)
  
  // Map column indexes
  const idxResi = headers.findIndex(h => h.includes('No. Resi'));
  const idxOrder = headers.findIndex(h => h.includes('No. Pesanan'));
  const idxStatus = headers.findIndex(h => h.includes('Status Pesanan'));
  const idxOpsiKirim = headers.findIndex(h => h.includes('Opsi Pengiriman'));
  const idxUser = headers.findIndex(h => h.includes('Username (Pembeli)'));
  const idxSKU = headers.findIndex(h => 
    h.includes('Nomor Referensi SKU') || h.includes('SKU Induk') || h === 'SKU'
  );
  const idxNamaProduk = headers.findIndex(h => h.includes('Nama Produk'));
  const idxNamaVariasi = headers.findIndex(h => h.includes('Nama Variasi'));
  const idxQty = headers.findIndex(h => h.includes('Jumlah'));
  const idxTotal = headers.findIndex(h => h.includes('Total Harga Produk'));
  
  // Dedupe set
  const seenKeys = new Set<string>();
  
  return dataRows.map(line => {
    const cols = parseCSVLine(line);
    if (cols.length < 5) return null;

    // Get status dan filter
    const rawStatus = (idxStatus !== -1 && cols[idxStatus]) 
      ? cols[idxStatus].replace(/["']/g, '').trim() 
      : '';
    const statusLower = rawStatus.toLowerCase();
    
    // SKIP: Batal atau Belum Bayar
    if (statusLower.includes('batal') || statusLower.includes('belum bayar')) {
      return null;
    }

    // Get resi - SKIP jika kosong
    // Gunakan fixScientificNotation untuk menangani kasus 1.10032E+13 -> 11003205509556
    let resi = (idxResi !== -1 && cols[idxResi]) 
      ? cols[idxResi].replace(/["']/g, '').trim() 
      : '';
    resi = fixScientificNotation(resi);
    if (!resi) return null;
    
    // Get order_id - juga fix scientific notation
    let orderId = (idxOrder !== -1 && cols[idxOrder]) 
      ? cols[idxOrder].replace(/["']/g, '').trim() 
      : '';
    orderId = fixScientificNotation(orderId);

    // Format customer
    const customer = formatCustomer(cols[idxUser] || '');
    
    // Format nama produk
    const namaProduk = (idxNamaProduk !== -1) ? cols[idxNamaProduk] : '';
    const namaVariasi = (idxNamaVariasi !== -1) ? cols[idxNamaVariasi] : '';
    const productName = formatNamaProduk(namaProduk, namaVariasi);
    
    // Dedupe check
    const dedupeKey = `${resi}||${customer}||${productName}`;
    if (seenKeys.has(dedupeKey)) return null;
    seenKeys.add(dedupeKey);

    // Parse harga
    const totalPriceIDR = (idxTotal !== -1) ? parseCurrencyIDR(cols[idxTotal]) : 0;

    return {
      resi,
      order_id: orderId,
      order_status: rawStatus,
      shipping_option: (idxOpsiKirim !== -1 && cols[idxOpsiKirim]) ? cols[idxOpsiKirim].replace(/["']/g, '') : '',
      customer,
      part_number: (idxSKU !== -1 && cols[idxSKU]) ? cols[idxSKU].replace(/["']/g, '') : '',
      product_name: productName,
      quantity: (idxQty !== -1) ? (parseInt(cols[idxQty]) || 1) : 1,
      total_price: totalPriceIDR,
      original_currency_val: (idxTotal !== -1) ? cols[idxTotal] : '0',
      ecommerce: 'SHOPEE'
    };
  }).filter((item): item is ParsedCSVItem => item !== null);
};

// ============================================================================
// TIKTOK PARSER
// Header: Baris 1
// Skip: Baris 2 (biasanya data report atau kosong)
// Data: Mulai Baris 3
// Filter: Skip "Dibatalkan" dan "Belum dibayar"
// Skip jika Tracking ID kosong
// Dedupe: Sama resi + customer + nama_produk = skip
// ============================================================================
export const parseTikTokCSV = (text: string): ParsedCSVItem[] => {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 3) return [];
  
  // Header di baris 1 (index 0)
  const headers = parseCSVLine(lines[0]);
  // Skip baris 2 (index 1)
  // Data mulai baris 3 (index 2)
  const dataRows = lines.slice(2);

  // Map column indexes
  const idxResi = headers.findIndex(h => h.includes('Tracking ID'));
  const idxOrder = headers.findIndex(h => h.includes('Order ID'));
  const idxStatus = headers.findIndex(h => h.includes('Order Status'));
  const idxShipping = headers.findIndex(h => h.includes('Shipping Provider') || h.includes('Shipping Option'));
  const idxUser = headers.findIndex(h => h.includes('Buyer Username'));
  const idxSKU = headers.findIndex(h => h.includes('Seller SKU'));
  const idxProductName = headers.findIndex(h => h.includes('Product Name'));
  const idxVariation = headers.findIndex(h => h.includes('Variation'));
  const idxQty = headers.findIndex(h => h.includes('Quantity'));
  const idxTotal = headers.findIndex(h => h.includes('SKU Subtotal After Discount'));

  // Dedupe set
  const seenKeys = new Set<string>();

  return dataRows.map(line => {
    const cols = parseCSVLine(line);
    if (cols.length < headers.length * 0.5) return null; // Skip jika terlalu sedikit kolom

    // Get status dan filter
    const rawStatus = (idxStatus !== -1 && cols[idxStatus]) 
      ? cols[idxStatus].replace(/["']/g, '').trim() 
      : '';
    const statusLower = rawStatus.toLowerCase();

    // SKIP: Dibatalkan atau Belum dibayar/Unpaid
    if (statusLower.includes('dibatalkan') || statusLower.includes('cancelled') ||
        statusLower.includes('belum dibayar') || statusLower.includes('unpaid')) {
      return null;
    }

    // Get resi (Tracking ID) - SKIP jika kosong
    // Gunakan fixScientificNotation untuk menangani kasus scientific notation
    let resi = (idxResi !== -1 && cols[idxResi]) 
      ? cols[idxResi].replace(/["']/g, '').trim() 
      : '';
    resi = fixScientificNotation(resi);
    if (!resi) return null;
    
    // Get order_id - juga fix scientific notation
    let orderId = (idxOrder !== -1 && cols[idxOrder]) 
      ? cols[idxOrder].replace(/["']/g, '').trim() 
      : '';
    orderId = fixScientificNotation(orderId);

    // Format customer
    const customer = formatCustomer(cols[idxUser] || '');
    
    // Format nama produk
    const namaProduk = (idxProductName !== -1) ? cols[idxProductName] : '';
    const variation = (idxVariation !== -1) ? cols[idxVariation] : '';
    const productName = formatNamaProduk(namaProduk, variation);
    
    // Dedupe check
    const dedupeKey = `${resi}||${customer}||${productName}`;
    if (seenKeys.has(dedupeKey)) return null;
    seenKeys.add(dedupeKey);

    // Parse harga
    const totalPriceIDR = (idxTotal !== -1) ? parseCurrencyIDR(cols[idxTotal]) : 0;

    return {
      resi,
      order_id: orderId,
      order_status: rawStatus,
      shipping_option: (idxShipping !== -1 && cols[idxShipping]) ? cols[idxShipping].replace(/["']/g, '') : '',
      customer,
      part_number: (idxSKU !== -1 && cols[idxSKU]) ? cols[idxSKU].replace(/["']/g, '') : '',
      product_name: productName,
      quantity: (idxQty !== -1) ? (parseInt(cols[idxQty]) || 1) : 1,
      total_price: totalPriceIDR,
      original_currency_val: (idxTotal !== -1) ? cols[idxTotal] : '0',
      ecommerce: 'TIKTOK'
    };
  }).filter((item): item is ParsedCSVItem => item !== null);
};