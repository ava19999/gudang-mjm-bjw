// FILE: services/csvParserService.ts
import { ParsedCSVItem } from '../types';

// ============================================================================
// CURRENCY CONVERSION RATES (untuk Ekspor)
// Rate: 1 mata uang asing = X IDR
// Update rate ini secara berkala sesuai kurs terkini
// ============================================================================
export const CURRENCY_RATES: Record<string, number> = {
  'PHP': 280,    // 1 PHP = 280 IDR (Philippines Peso)
  'PH': 280,     // alias
  'MYR': 3600,   // 1 MYR = 3600 IDR (Malaysian Ringgit)
  'MY': 3600,    // alias
  'SGD': 12000,  // 1 SGD = 12000 IDR (Singapore Dollar)
  'SG': 12000,   // alias
  'HKD': 2100,   // 1 HKD = 2100 IDR (Hong Kong Dollar)
  'HK': 2100,    // alias
  'IDR': 1,      // No conversion
  'ID': 1,       // alias
};

// Fungsi konversi mata uang asing ke IDR
export const convertToIDR = (amount: number, country: string): number => {
  const countryUpper = (country || '').toUpperCase().trim();
  const rate = CURRENCY_RATES[countryUpper] || 1;
  return Math.round(amount * rate);
};

// Parse harga dari foreign currency (tanpa konversi, hanya parse angka)
export const parseForeignCurrency = (val: string): number => {
  if (!val) return 0;
  // Buang semua karakter non-angka kecuali titik, koma, minus
  let numStr = val.replace(/[^0-9.,-]/g, '');
  
  // Format international biasanya: 1,234.56 atau 1234.56
  // Koma adalah ribuan, titik adalah desimal
  numStr = numStr.replace(/,/g, ''); // Buang koma (ribuan)
  
  return parseFloat(numStr) || 0;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Konversi scientific notation ke string angka penuh
// Contoh: "1.10032E+13" -> "11003200000000" atau "1.10032055095560E13" -> "11003205509556"
// PENTING: Hanya proses jika BENAR-BENAR scientific notation (hanya angka, titik, E, +/-)
// Jangan proses resi alfanumerik seperti "2601154E8R7Y5F" yang kebetulan mengandung huruf E
const fixScientificNotation = (val: string): string => {
  if (!val) return '';
  const trimmed = val.trim();
  
  // Cek apakah dalam format scientific notation yang VALID
  // Pattern: hanya angka, optional titik desimal, lalu E/e, optional +/-, lalu angka
  // Contoh valid: "1.10032E+13", "2.5E10", "1E+5"
  // Contoh TIDAK valid: "2601154E8R7Y5F" (ada huruf lain selain E)
  const scientificPattern = /^[+-]?\d+\.?\d*[eE][+-]?\d+$/;
  
  if (scientificPattern.test(trimmed)) {
    try {
      // Parse sebagai number lalu konversi ke string tanpa scientific notation
      const num = parseFloat(trimmed);
      if (!isNaN(num)) {
        // Gunakan toLocaleString untuk format penuh tanpa scientific notation
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
  // TikTok: Header mengandung "Tracking ID" dan "Seller SKU" atau "Order Status" (TikTok specific)
  // Cek TikTok DULU sebelum Shopee International karena keduanya punya "Order ID"
  if ((text.includes('Tracking ID') && text.includes('Seller SKU')) || 
      (text.includes('Order ID') && text.includes('Seller SKU') && text.includes('SKU Subtotal'))) {
    return 'tiktok';
  }
  
  // Shopee Indonesia: Header mengandung "No. Resi" atau "No. Pesanan" + "Username (Pembeli)"
  const isShopeeID = (
    (text.includes('No. Resi') || text.includes('No. Pesanan')) && 
    (text.includes('Username (Pembeli)') || text.includes('Nama Produk'))
  );
  if (isShopeeID) return 'shopee';
  
  // Shopee International / My Laris (PH/MY/SG): Header mengandung "Order ID" dan "Tracking Number" (with or without asterisk)
  // Also check for "Shipment Method" which is specific to My Laris export
  const isShopeeIntl = (
    text.includes('Order ID') && 
    (text.includes('Tracking Number') || text.includes('Product Name') || text.includes('Buyer Username') || text.includes('Shipment Method'))
  );
  if (isShopeeIntl) return 'shopee-intl';
  
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

    // Get status - TIDAK FILTER di sini, biarkan STEP 0 di handleFileUpload yang filter
    // Supaya item batal bisa muncul di modal skip
    const rawStatus = (idxStatus !== -1 && cols[idxStatus]) 
      ? cols[idxStatus].replace(/["']/g, '').trim() 
      : '';

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
// SHOPEE INTERNATIONAL PARSER (PH, MY, SG) - Also supports My Laris export
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
  
  // Debug: Log headers untuk troubleshooting
  console.log('[Shopee Intl CSV] Headers found:', headers);
  
  // Map column indexes (English headers)
  // Support both standard Shopee International and My Laris export format
  const idxOrderId = headers.findIndex(h => h.includes('Order ID'));
  // Tracking Number bisa dengan atau tanpa asterisk (Tracking Number*)
  const idxTracking = headers.findIndex(h => h.toLowerCase().includes('tracking number'));
  const idxStatus = headers.findIndex(h => h.includes('Order Status'));
  const idxShipping = headers.findIndex(h => h.includes('Shipping Option'));
  const idxShipmentMethod = headers.findIndex(h => h.includes('Shipment Method')); // My Laris specific
  
  // Buyer: Cari kolom "Username (Buyer)" atau "Buyer Username" dengan prioritas yang benar
  // JANGAN match "Buyer Paid Shipping" atau kolom lain yang mengandung "Buyer"
  let idxBuyer = headers.findIndex(h => h.includes('Username (Buyer)')); // My Laris exact match
  if (idxBuyer === -1) idxBuyer = headers.findIndex(h => h.includes('Buyer Username')); // Shopee Intl
  if (idxBuyer === -1) idxBuyer = headers.findIndex(h => h === 'Username'); // Exact match
  if (idxBuyer === -1) idxBuyer = headers.findIndex(h => h === 'Buyer'); // Exact match only
  // Fallback: cari yang mengandung "Username" tapi bukan "Buyer Paid" atau sejenisnya
  if (idxBuyer === -1) {
    idxBuyer = headers.findIndex(h => 
      h.includes('Username') && 
      !h.toLowerCase().includes('paid') && 
      !h.toLowerCase().includes('shipping')
    );
  }
  
  // SKU: Support "Parent SKU Reference No." dari My Laris
  const idxSKU = headers.findIndex(h => 
    h.includes('SKU Reference No') || 
    h.includes('Parent SKU') || 
    h.includes('Seller SKU') ||
    h === 'SKU'
  );
  const idxProductName = headers.findIndex(h => h.includes('Product Name'));
  const idxVariation = headers.findIndex(h => h.includes('Variation Name'));
  const idxQty = headers.findIndex(h => h.includes('Quantity') || h === 'Qty');
  const idxTotal = headers.findIndex(h => h.includes('Total Product Price') || h.includes('Product Subtotal'));
  
  // Debug: Log column indexes
  console.log('[Shopee Intl CSV] Column indexes:', {
    orderId: idxOrderId,
    tracking: idxTracking,
    status: idxStatus,
    shipping: idxShipping,
    shipmentMethod: idxShipmentMethod,
    buyer: idxBuyer,
    sku: idxSKU,
    productName: idxProductName,
    variation: idxVariation,
    qty: idxQty,
    total: idxTotal
  });
  
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
    
    // Get status - cek dari kolom Order Status ATAU kolom B (index 1) untuk My Laris
    // Di My Laris, kolom B berisi "Cancelled" jika dibatalkan
    let rawStatus = (idxStatus !== -1 && cols[idxStatus]) 
      ? cols[idxStatus].replace(/["']/g, '').trim() 
      : '';
    
    // Check column B (index 1) for "cancelled" - My Laris specific
    const colB = (cols[1] || '').replace(/["']/g, '').trim().toLowerCase();
    if (colB === 'cancelled' || colB.includes('cancel')) {
      rawStatus = 'Cancelled';
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
    
    // Parse harga - simpan nilai asli dalam mata uang asing (JANGAN konversi di sini)
    // Konversi ke IDR akan dilakukan di Stage 3 saat upload untuk Ekspor
    const rawPriceVal = (idxTotal !== -1) ? cols[idxTotal] : '0';
    const totalPriceForeign = parseForeignCurrency(rawPriceVal);
    
    // Deteksi negara untuk referensi (PH/MY/SG)
    let detectedCountry = 'PH'; // Default PH
    if (orderIdUpper.includes('MY') || orderIdUpper.endsWith('MY')) {
      detectedCountry = 'MY';
    } else if (orderIdUpper.includes('SG') || orderIdUpper.endsWith('SG')) {
      detectedCountry = 'SG';
    } else if (orderIdUpper.includes('HK') || orderIdUpper.endsWith('HK')) {
      detectedCountry = 'HK';
    } else if (orderIdUpper.includes('PH') || orderIdUpper.endsWith('PH')) {
      detectedCountry = 'PH';
    }
    
    return {
      resi: orderId, // ORDER ID sebagai RESI
      order_id: orderId,
      order_status: rawStatus,
      shipping_option: shippingOption,
      customer,
      part_number: (idxSKU !== -1 && cols[idxSKU]) ? cols[idxSKU].replace(/["']/g, '') : '',
      product_name: productName,
      quantity: (idxQty !== -1) ? (parseInt(cols[idxQty]) || 1) : 1,
      total_price: totalPriceForeign, // Harga dalam mata uang asing (belum dikonversi)
      original_currency_val: rawPriceVal,
      ecommerce: ecommerceLabel,
      detected_country: detectedCountry // Negara terdeteksi dari Order ID
    } as ParsedCSVItem;
  }).filter((item): item is ParsedCSVItem => item !== null);
};

// ============================================================================
// TIKTOK PARSER
// Header: Baris 1
// Data: 
//   - CSV: Mulai baris 2 (index 1)
//   - XLSX: Mulai baris 3 (index 2) karena ada baris deskripsi di baris 2
// Filter: Skip "Dibatalkan" dan "Belum dibayar"
// RESI LOGIC:
//   - Default: Gunakan Tracking ID sebagai resi
//   - Instan/Same Day: Gunakan Order ID sebagai resi, label "TIKTOK INSTAN"
// Dedupe: Sama resi + customer + nama_produk + original_row_idx = skip (lebih ketat)
// ============================================================================
export const parseTikTokCSV = (text: string, isFromXLSX: boolean = false): ParsedCSVItem[] => {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  
  // Header di baris 1 (index 0)
  const headers = parseCSVLine(lines[0]);
  
  // ATURAN DATA START INDEX:
  // - CSV: Mulai dari baris 2 (index 1) - langsung data setelah header
  // - XLSX: Mulai dari baris 3 (index 2) - karena baris 2 adalah deskripsi kolom
  let dataStartIndex = isFromXLSX ? 2 : 1;
  
  console.log('[TikTok CSV] Source:', isFromXLSX ? 'XLSX' : 'CSV');
  console.log('[TikTok CSV] Data starts at row', dataStartIndex + 1, '(index', dataStartIndex, ')');
  
  const dataRows = lines.slice(dataStartIndex);
  console.log('[TikTok CSV] Data starts at row', dataStartIndex + 1, '| Total data rows:', dataRows.length);

  // Map column indexes
  const idxResi = headers.findIndex(h => h.includes('Tracking ID'));
  const idxOrder = headers.findIndex(h => h.includes('Order ID'));
  const idxStatus = headers.findIndex(h => h.toLowerCase().includes('order status') || h.toLowerCase().includes('status pesanan'));
  // Delivery Option bisa dalam bahasa Inggris atau Indonesia
  const idxDeliveryOption = headers.findIndex(h => 
    h.includes('Delivery Option') || 
    h.includes('Opsi Pengiriman') ||
    h.toLowerCase().includes('delivery option') ||
    h.toLowerCase().includes('opsi pengiriman')
  );
  const idxUser = headers.findIndex(h => h.includes('Buyer Username'));
  const idxSKU = headers.findIndex(h => h.includes('Seller SKU'));
  // Tambahkan SKU ID untuk dedupe yang lebih akurat (kolom unik per item)
  const idxSKUID = headers.findIndex(h => h === 'SKU ID' || h.includes('SKU ID'));
  const idxProductName = headers.findIndex(h => h.includes('Product Name'));
  const idxVariation = headers.findIndex(h => h.includes('Variation'));
  const idxQty = headers.findIndex(h => h.includes('Quantity'));
  // PERBAIKAN: Ambil dari "SKU Subtotal Before Discount" (kolom M)
  // Ini adalah harga sebelum diskon, lebih akurat untuk pencatatan
  const idxTotal = headers.findIndex(h => {
    const hLower = h.toLowerCase();
    // Prioritas: SKU Subtotal Before Discount
    if (hLower.includes('sku subto') && hLower.includes('before')) return true;
    return false;
  });
  // Fallback ke "SKU Subtotal" jika "Before Discount" tidak ditemukan
  const idxTotalFallback = idxTotal === -1 
    ? headers.findIndex(h => {
        const hLower = h.toLowerCase();
        // Cari "SKU Subtotal" yang BUKAN "Before Discount" dan BUKAN "After Discount"
        if (hLower === 'sku subtotal' || (hLower.includes('sku subto') && !hLower.includes('before') && !hLower.includes('after'))) return true;
        return false;
      })
    : -1;
  const finalIdxTotal = idxTotal !== -1 ? idxTotal : idxTotalFallback;
  
  // Tambahkan kolom harga unit untuk dedupe
  const idxUnitPrice = headers.findIndex(h => h.includes('SKU Unit Original Price') || h.includes('Unit Price'));
  
  console.log('[TikTok CSV] Headers:', headers);
  console.log('[TikTok CSV] Column indexes - Order:', idxOrder, 'Resi:', idxResi, 'SKU:', idxSKU, 'SKU ID:', idxSKUID);
  console.log('[TikTok CSV] idxTotal (SKU Subtotal Before Discount):', finalIdxTotal, 'column name:', finalIdxTotal !== -1 ? headers[finalIdxTotal] : 'NOT FOUND');
  console.log('[TikTok CSV] idxStatus:', idxStatus, 'column name:', idxStatus !== -1 ? headers[idxStatus] : 'NOT FOUND');
  console.log('[TikTok CSV] idxDeliveryOption:', idxDeliveryOption, 'column name:', idxDeliveryOption !== -1 ? headers[idxDeliveryOption] : 'NOT FOUND');
  console.log('[TikTok CSV] idxResi (Tracking ID):', idxResi, 'column name:', idxResi !== -1 ? headers[idxResi] : 'NOT FOUND');

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
    
    if (cols.length < headers.length * 0.5) return null; // Skip jika terlalu sedikit kolom

    // Get status - TIDAK FILTER di sini, biarkan STEP 0 di handleFileUpload yang filter
    // Supaya item batal bisa muncul di modal skip
    const rawStatus = (idxStatus !== -1 && cols[idxStatus]) 
      ? cols[idxStatus].replace(/["']/g, '').trim() 
      : '';

    // Get Tracking ID - fix scientific notation
    let trackingId = (idxResi !== -1 && cols[idxResi]) 
      ? cols[idxResi].replace(/["']/g, '').trim() 
      : '';
    trackingId = fixScientificNotation(trackingId);

    // Get Order ID - fix scientific notation
    let orderId = (idxOrder !== -1 && cols[idxOrder]) 
      ? cols[idxOrder].replace(/["']/g, '').trim() 
      : '';
    orderId = fixScientificNotation(orderId);
    
    // Get Delivery Option untuk deteksi Instan/Same Day
    const deliveryOption = (idxDeliveryOption !== -1 && cols[idxDeliveryOption]) 
      ? cols[idxDeliveryOption].replace(/["']/g, '').trim() 
      : '';
    const deliveryOptionLower = deliveryOption.toLowerCase();
    
    // DEBUG: Log delivery option untuk melihat nilai sebenarnya
    if (deliveryOption) {
      console.log('[TikTok CSV] Delivery Option:', deliveryOption, '| Lower:', deliveryOptionLower);
    }
    
    // LOGIC RESI TIKTOK:
    // Cek kolom "Delivery Option" untuk kata instant/instan/sameday/same day/on-demand
    // - Jika Instan/Same Day/On-Demand: Gunakan Order ID sebagai resi, label "TIKTOK INSTAN"
    // - Jika Regular: Gunakan Tracking ID sebagai resi, label "TIKTOK"
    
    // Tambahkan variasi penulisan yang mungkin ada di TikTok CSV
    const isInstant = deliveryOptionLower.includes('instant') || 
                      deliveryOptionLower.includes('instan') ||
                      deliveryOptionLower.includes('on-demand') ||
                      deliveryOptionLower.includes('on demand') ||
                      deliveryOptionLower.includes('express');
    const isSameday = deliveryOptionLower.includes('same day') || 
                      deliveryOptionLower.includes('sameday') ||
                      deliveryOptionLower.includes('same-day');
    const isInstantOrSameday = isInstant || isSameday;
    
    let resi = '';
    let ecommerceLabel = 'TIKTOK';
    
    if (isInstantOrSameday) {
      // Instan/Same Day: Gunakan Order ID sebagai resi
      resi = orderId;
      ecommerceLabel = 'TIKTOK INSTAN';
      console.log('[TikTok CSV] DETECTED INSTANT/SAMEDAY:', deliveryOption, '-> Label:', ecommerceLabel);
    } else {
      // Regular: Gunakan Tracking ID sebagai resi
      resi = trackingId;
      ecommerceLabel = 'TIKTOK';
    }
    
    // SKIP jika resi kosong
    if (!resi) {
      skippedNoResi++;
      return null;
    }

    // Format customer
    const customer = formatCustomer(cols[idxUser] || '');
    
    // Format nama produk
    const namaProduk = (idxProductName !== -1) ? cols[idxProductName] : '';
    const variation = (idxVariation !== -1) ? cols[idxVariation] : '';
    const productName = formatNamaProduk(namaProduk, variation);
    
    // Get SKU dan SKU ID untuk dedupe yang lebih akurat
    const sku = (idxSKU !== -1 && cols[idxSKU]) ? cols[idxSKU].replace(/["']/g, '').trim() : '';
    const skuId = (idxSKUID !== -1 && cols[idxSKUID]) ? cols[idxSKUID].replace(/["']/g, '').trim() : '';
    
    // Parse harga untuk dedupe tambahan - gunakan finalIdxTotal (SKU Subtotal)
    const totalPriceIDR = (finalIdxTotal !== -1) ? parseCurrencyIDR(cols[finalIdxTotal]) : 0;
    const unitPrice = (idxUnitPrice !== -1) ? parseCurrencyIDR(cols[idxUnitPrice]) : 0;
    const qty = (idxQty !== -1) ? (parseInt(cols[idxQty]) || 1) : 1;
    
    // IMPROVED DEDUPE: Gunakan kombinasi yang lebih unik
    // Prioritas: SKU ID (paling unik) > SKU + Product Name + Unit Price
    // SKU ID adalah identifier unik per line item di TikTok
    let dedupeKey: string;
    if (skuId) {
      // SKU ID tersedia - gunakan ini karena paling unik per item
      dedupeKey = `${resi}||${skuId}`;
    } else if (sku) {
      // SKU tersedia - kombinasikan dengan product name dan harga
      dedupeKey = `${resi}||${sku}||${productName}||${unitPrice}`;
    } else {
      // Tidak ada SKU - gunakan product name + harga + quantity sebagai pembeda
      dedupeKey = `${resi}||${productName}||${unitPrice}||${qty}`;
    }
    
    console.log('[TikTok CSV] Row dedupe key:', dedupeKey);
    
    if (seenKeys.has(dedupeKey)) {
      skippedDuplicate++;
      console.log('[TikTok CSV] SKIPPED DUPLICATE:', dedupeKey);
      return null;
    }
    seenKeys.add(dedupeKey);

    return {
      resi,
      order_id: orderId,
      order_status: rawStatus,
      shipping_option: deliveryOption,
      customer,
      part_number: sku,
      product_name: productName,
      quantity: qty,
      total_price: totalPriceIDR,
      original_currency_val: (finalIdxTotal !== -1) ? cols[finalIdxTotal] : '0',
      ecommerce: ecommerceLabel
    };
  }).filter((item): item is ParsedCSVItem => item !== null);
  
  // Log summary
  console.log('[TikTok CSV] Parse Summary:');
  console.log('  Total rows:', totalProcessed);
  console.log('  Valid items:', results.length);
  console.log('  Skipped - Cancelled/Unpaid:', skippedCancelled);
  console.log('  Skipped - No Resi (Tracking ID/Order ID):', skippedNoResi);
  console.log('  Skipped - Duplicate:', skippedDuplicate);
  
  return results;
};