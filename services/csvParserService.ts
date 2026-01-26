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
  
  // Cek apakah ada KEDUA koma DAN titik
  const hasComma = numStr.includes(',');
  const hasDot = numStr.includes('.');
  
  if (hasComma && hasDot) {
    // Format mixed: bisa "100,000.00" (EN) atau "100.000,00" (ID)
    const lastCommaIdx = numStr.lastIndexOf(',');
    const lastDotIdx = numStr.lastIndexOf('.');
    
    if (lastCommaIdx > lastDotIdx) {
      // Koma di akhir = desimal (format ID: 100.000,00)
      numStr = numStr.replace(/\./g, ''); // buang titik (ribuan)
      numStr = numStr.replace(/,/g, '.'); // ganti koma jadi titik (desimal)
    } else {
      // Titik di akhir = desimal (format EN: 100,000.00)
      numStr = numStr.replace(/,/g, ''); // buang koma (ribuan)
      // titik tetap sebagai desimal
    }
  } else if (hasComma) {
    // Hanya ada koma
    const commaMatch = numStr.match(/,(\d+)$/);
    if (commaMatch && commaMatch[1].length === 3) {
      // Koma adalah ribuan (format: 100,000 atau 1,000,000)
      numStr = numStr.replace(/,/g, '');
    } else {
      // Koma adalah desimal (format: 100,50)
      numStr = numStr.replace(/,/g, '.');
    }
  } else if (hasDot) {
    // Hanya ada titik
    const dotMatch = numStr.match(/\.(\d+)$/);
    if (dotMatch && dotMatch[1].length === 3) {
      // Titik adalah ribuan (format Indonesia: 100.000)
      numStr = numStr.replace(/\./g, '');
    }
    // Jika 1-2 digit setelah titik, titik adalah desimal - biarkan
  }
  
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
export const detectCSVPlatform = (text: string): 'shopee' | 'shopee-intl' | 'tiktok' | 'unknown' => {
  // Shopee Indonesia: Header mengandung "No. Resi" atau "No. Pesanan" + "Username (Pembeli)"
  const isShopeeID = (
    (text.includes('No. Resi') || text.includes('No. Pesanan')) && 
    (text.includes('Username (Pembeli)') || text.includes('Nama Produk'))
  );
  if (isShopeeID) return 'shopee';
  
  // Shopee International (PH/MY/SG): Header mengandung "Order ID" dan "Tracking Number"
  const isShopeeIntl = (
    text.includes('Order ID') && 
    (text.includes('Tracking Number') || text.includes('Product Name') || text.includes('Buyer Username'))
  );
  if (isShopeeIntl) return 'shopee-intl';
  
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
  
  // Tracking untuk debugging
  let totalProcessed = 0;
  let skippedCancelled = 0;
  let skippedNoResi = 0;
  let skippedDuplicate = 0;
  
  const results = dataRows.map(line => {
    totalProcessed++;
    const cols = parseCSVLine(line);
    if (cols.length < 5) return null;

    // Get status dan filter
    const rawStatus = (idxStatus !== -1 && cols[idxStatus]) 
      ? cols[idxStatus].replace(/["']/g, '').trim() 
      : '';
    const statusLower = rawStatus.toLowerCase();
    
    // SKIP: Hanya jika status BENAR-BENAR "Dibatalkan" atau "Batal"
    // "Pembatalan Diajukan" / "Cancellation Requested" masih boleh masuk karena pesanan belum benar-benar dibatalkan
    // Cek exact match untuk avoid false positive
    const isCancelled = statusLower === 'batal' || 
                        statusLower === 'dibatalkan' || 
                        statusLower === 'cancelled' ||
                        statusLower === 'canceled';
    if (isCancelled || statusLower.includes('belum bayar')) {
      skippedCancelled++;
      return null;
    }

    // Get resi - SKIP jika kosong
    // Gunakan fixScientificNotation untuk menangani kasus 1.10032E+13 -> 11003205509556
    let resi = (idxResi !== -1 && cols[idxResi]) 
      ? cols[idxResi].replace(/["']/g, '').trim() 
      : '';
    resi = fixScientificNotation(resi);
    
    // Get order_id - juga fix scientific notation
    let orderId = (idxOrder !== -1 && cols[idxOrder]) 
      ? cols[idxOrder].replace(/["']/g, '').trim() 
      : '';
    orderId = fixScientificNotation(orderId);
    
    // Get opsi pengiriman
    const shippingOption = (idxOpsiKirim !== -1 && cols[idxOpsiKirim]) 
      ? cols[idxOpsiKirim].replace(/["']/g, '').trim() 
      : '';
    const shippingOptionLower = shippingOption.toLowerCase();
    
    // KHUSUS INSTANT, KILAT, SAMEDAY: Gunakan No. Pesanan sebagai Resi
    // Karena Instant/Kilat/Sameday tidak punya resi tradisional
    // Label ditaruh di kolom ecommerce
    // Prioritas: cek "kilat" dulu karena "kilat instan" mengandung kedua kata
    const isKilat = shippingOptionLower.includes('kilat');
    const isSameday = shippingOptionLower.includes('same day') || shippingOptionLower.includes('sameday');
    const isInstant = (shippingOptionLower.includes('instant') || shippingOptionLower.includes('instan')) && !isKilat;
    
    let ecommerceLabel = 'SHOPEE';
    if (isKilat) {
      // Kilat Instan - gunakan No. Pesanan
      if (orderId) resi = orderId;
      ecommerceLabel = 'KILAT INSTAN';
    } else if (isSameday) {
      // Same Day - gunakan No. Pesanan (termasuk Instant Same Day)
      if (orderId) resi = orderId;
      ecommerceLabel = 'SHOPEE SAMEDAY';
    } else if (isInstant) {
      // Instant - gunakan No. Pesanan
      if (orderId) resi = orderId;
      ecommerceLabel = 'SHOPEE INSTAN';
    }
    
    // SKIP jika resi masih kosong
    if (!resi) {
      skippedNoResi++;
      return null;
    }

    // Format customer
    const customer = formatCustomer(cols[idxUser] || '');
    
    // Format nama produk
    const namaProduk = (idxNamaProduk !== -1) ? cols[idxNamaProduk] : '';
    const namaVariasi = (idxNamaVariasi !== -1) ? cols[idxNamaVariasi] : '';
    const productName = formatNamaProduk(namaProduk, namaVariasi);
    
    // Dedupe check - gunakan resi + SKU untuk akurasi lebih baik
    // Customer dan product name bisa bervariasi formatting-nya
    const sku = (idxSKU !== -1 && cols[idxSKU]) ? cols[idxSKU].replace(/["']/g, '') : '';
    const dedupeKey = `${resi}||${sku}||${productName}`;
    if (seenKeys.has(dedupeKey)) {
      skippedDuplicate++;
      return null;
    }
    seenKeys.add(dedupeKey);

    // Parse harga
    const totalPriceIDR = (idxTotal !== -1) ? parseCurrencyIDR(cols[idxTotal]) : 0;

    return {
      resi,
      order_id: orderId,
      order_status: rawStatus,
      shipping_option: shippingOption,
      customer,
      part_number: (idxSKU !== -1 && cols[idxSKU]) ? cols[idxSKU].replace(/["']/g, '') : '',
      product_name: productName,
      quantity: (idxQty !== -1) ? (parseInt(cols[idxQty]) || 1) : 1,
      total_price: totalPriceIDR,
      original_currency_val: (idxTotal !== -1) ? cols[idxTotal] : '0',
      ecommerce: ecommerceLabel
    };
  }).filter((item): item is ParsedCSVItem => item !== null);
  
  // Log summary
  console.log('[Shopee CSV] Parse Summary:');
  console.log('  Total rows:', totalProcessed);
  console.log('  Valid items:', results.length);
  console.log('  Skipped - Cancelled/Unpaid:', skippedCancelled);
  console.log('  Skipped - No Resi:', skippedNoResi);
  console.log('  Skipped - Duplicate:', skippedDuplicate);
  
  return results;
};

// ============================================================================
// SHOPEE INTERNATIONAL PARSER (PH, MY, SG)
// Header: Baris 1
// Data: Mulai Baris 2
// RESI: Gunakan Order ID (bukan Tracking Number)
// Ecommerce Label: SHOPEE PH / SHOPEE MY / SHOPEE SG (berdasarkan Order ID prefix)
// ============================================================================
export const parseShopeeIntlCSV = (text: string): ParsedCSVItem[] => {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  
  // Header di baris 1 (index 0)
  const headers = parseCSVLine(lines[0]);
  const dataRows = lines.slice(1);
  
  // Map column indexes (English headers)
  const idxOrderId = headers.findIndex(h => h.includes('Order ID'));
  const idxTracking = headers.findIndex(h => h.includes('Tracking Number'));
  const idxStatus = headers.findIndex(h => h.includes('Order Status'));
  const idxShipping = headers.findIndex(h => h.includes('Shipping Option'));
  const idxBuyer = headers.findIndex(h => h.includes('Buyer Username') || h.includes('Username'));
  const idxSKU = headers.findIndex(h => h.includes('SKU Reference No') || h.includes('Parent SKU') || h === 'SKU');
  const idxProductName = headers.findIndex(h => h.includes('Product Name'));
  const idxVariation = headers.findIndex(h => h.includes('Variation Name'));
  const idxQty = headers.findIndex(h => h.includes('Quantity'));
  const idxTotal = headers.findIndex(h => h.includes('Total Product Price') || h.includes('Product Subtotal'));
  
  // Dedupe set
  const seenKeys = new Set<string>();
  
  return dataRows.map(line => {
    const cols = parseCSVLine(line);
    if (cols.length < 5) return null;
    
    // Get Order ID - GUNAKAN SEBAGAI RESI
    let orderId = (idxOrderId !== -1 && cols[idxOrderId]) 
      ? cols[idxOrderId].replace(/["']/g, '').trim() 
      : '';
    orderId = fixScientificNotation(orderId);
    
    // SKIP jika Order ID kosong
    if (!orderId) return null;
    
    // Get status dan filter
    const rawStatus = (idxStatus !== -1 && cols[idxStatus]) 
      ? cols[idxStatus].replace(/["']/g, '').trim() 
      : '';
    const statusLower = rawStatus.toLowerCase();
    
    // SKIP: Hanya jika status BENAR-BENAR "Cancelled" atau "Unpaid"
    // "Cancellation Requested" masih boleh masuk karena pesanan belum benar-benar dibatalkan
    const isCancelled = statusLower === 'cancelled' || 
                        statusLower === 'canceled' ||
                        statusLower === 'unpaid';
    if (isCancelled) {
      return null;
    }
    
    // Get tracking number (untuk referensi saja)
    let trackingNumber = (idxTracking !== -1 && cols[idxTracking]) 
      ? cols[idxTracking].replace(/["']/g, '').trim() 
      : '';
    trackingNumber = fixScientificNotation(trackingNumber);
    
    // Deteksi negara berdasarkan Order ID (biasanya ada suffix negara)
    // Contoh: 241212A0BCDEPH, 241212A0BCDEMY, 241212A0BCDESG
    let ecommerceLabel = 'SHOPEE';
    const orderIdUpper = orderId.toUpperCase();
    if (orderIdUpper.endsWith('PH') || orderIdUpper.includes('PH')) {
      ecommerceLabel = 'SHOPEE PH';
    } else if (orderIdUpper.endsWith('MY') || orderIdUpper.includes('MY')) {
      ecommerceLabel = 'SHOPEE MY';
    } else if (orderIdUpper.endsWith('SG') || orderIdUpper.includes('SG')) {
      ecommerceLabel = 'SHOPEE SG';
    } else {
      // Default: coba deteksi dari currency atau default ke SHOPEE INTL
      ecommerceLabel = 'SHOPEE INTL';
    }
    
    // Get shipping option
    const shippingOption = (idxShipping !== -1 && cols[idxShipping]) 
      ? cols[idxShipping].replace(/["']/g, '').trim() 
      : '';
    
    // Format customer
    const customer = formatCustomer(cols[idxBuyer] || '');
    
    // Format nama produk
    const namaProduk = (idxProductName !== -1) ? cols[idxProductName] : '';
    const namaVariasi = (idxVariation !== -1) ? cols[idxVariation] : '';
    const productName = formatNamaProduk(namaProduk, namaVariasi);
    
    // Dedupe check - gunakan Order ID sebagai resi
    const dedupeKey = `${orderId}||${customer}||${productName}`;
    if (seenKeys.has(dedupeKey)) return null;
    seenKeys.add(dedupeKey);
    
    // Parse harga
    const totalPrice = (idxTotal !== -1) ? parseCurrencyIDR(cols[idxTotal]) : 0;
    
    return {
      resi: orderId, // ORDER ID sebagai RESI
      order_id: orderId,
      order_status: rawStatus,
      shipping_option: shippingOption,
      customer,
      part_number: (idxSKU !== -1 && cols[idxSKU]) ? cols[idxSKU].replace(/["']/g, '') : '',
      product_name: productName,
      quantity: (idxQty !== -1) ? (parseInt(cols[idxQty]) || 1) : 1,
      total_price: totalPrice,
      original_currency_val: (idxTotal !== -1) ? cols[idxTotal] : '0',
      ecommerce: ecommerceLabel
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
  const idxUser = headers.findIndex(h => h.includes('Buyer Username'));
  const idxSKU = headers.findIndex(h => h.includes('Seller SKU'));
  const idxProductName = headers.findIndex(h => h.includes('Product Name'));
  const idxVariation = headers.findIndex(h => h.includes('Variation'));
  const idxQty = headers.findIndex(h => h.includes('Quantity'));
  const idxTotal = headers.findIndex(h => h.includes('SKU Subtotal After Discount'));

  // Dedupe set
  const seenKeys = new Set<string>();
  
  // Tracking untuk debugging
  let totalProcessed = 0;
  let skippedCancelled = 0;
  let skippedNoOrderId = 0;
  let skippedDuplicate = 0;

  const results = dataRows.map(line => {
    totalProcessed++;
    const cols = parseCSVLine(line);
    
    if (cols.length < headers.length * 0.5) return null; // Skip jika terlalu sedikit kolom

    // Get status dan filter
    const rawStatus = (idxStatus !== -1 && cols[idxStatus]) 
      ? cols[idxStatus].replace(/["']/g, '').trim() 
      : '';
    const statusLower = rawStatus.toLowerCase();

    // SKIP: Hanya jika status BENAR-BENAR "Dibatalkan" atau "Cancelled"
    // "Pembatalan Diajukan" / "Cancellation Requested" masih boleh masuk karena pesanan belum benar-benar dibatalkan
    // Cek exact match untuk menghindari false positive
    const isCancelled = statusLower === 'dibatalkan' || 
                        statusLower === 'cancelled' ||
                        statusLower === 'canceled';
    const isUnpaid = statusLower.includes('belum dibayar') || statusLower.includes('unpaid');
    if (isCancelled || isUnpaid) {
      skippedCancelled++;
      return null;
    }

    // TIKTOK menggunakan Order ID sebagai resi (bukan Tracking ID)
    // Get order_id - fix scientific notation
    let orderId = (idxOrder !== -1 && cols[idxOrder]) 
      ? cols[idxOrder].replace(/["']/g, '').trim() 
      : '';
    orderId = fixScientificNotation(orderId);
    
    // SKIP jika Order ID kosong
    if (!orderId) {
      skippedNoOrderId++;
      return null;
    }
    
    // Gunakan Order ID sebagai resi
    let resi = orderId;

    // Format customer
    const customer = formatCustomer(cols[idxUser] || '');
    
    // Format nama produk
    const namaProduk = (idxProductName !== -1) ? cols[idxProductName] : '';
    const variation = (idxVariation !== -1) ? cols[idxVariation] : '';
    const productName = formatNamaProduk(namaProduk, variation);
    
    // Dedupe check - gunakan order_id (resi) + SKU untuk akurasi
    const sku = (idxSKU !== -1 && cols[idxSKU]) ? cols[idxSKU].replace(/["']/g, '') : '';
    const dedupeKey = `${resi}||${sku}||${productName}`;
    if (seenKeys.has(dedupeKey)) {
      skippedDuplicate++;
      return null;
    }
    seenKeys.add(dedupeKey);

    // Parse harga
    const totalPriceIDR = (idxTotal !== -1) ? parseCurrencyIDR(cols[idxTotal]) : 0;

    return {
      resi,
      order_id: orderId,
      order_status: rawStatus,
      shipping_option: '',
      customer,
      part_number: (idxSKU !== -1 && cols[idxSKU]) ? cols[idxSKU].replace(/["']/g, '') : '',
      product_name: productName,
      quantity: (idxQty !== -1) ? (parseInt(cols[idxQty]) || 1) : 1,
      total_price: totalPriceIDR,
      original_currency_val: (idxTotal !== -1) ? cols[idxTotal] : '0',
      ecommerce: 'TIKTOK'
    };
  }).filter((item): item is ParsedCSVItem => item !== null);
  
  // Log summary
  console.log('[TikTok CSV] Parse Summary:');
  console.log('  Total rows:', totalProcessed);
  console.log('  Valid items:', results.length);
  console.log('  Skipped - Cancelled/Unpaid:', skippedCancelled);
  console.log('  Skipped - No Order ID:', skippedNoOrderId);
  console.log('  Skipped - Duplicate:', skippedDuplicate);
  
  return results;
};