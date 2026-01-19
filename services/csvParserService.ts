// FILE: services/csvParserService.ts
// Service untuk parsing CSV Shopee & TikTok dengan pemisahan header yang benar

const EXCHANGE_RATES: Record<string, number> = {
  'MYR': 3500,
  'PHP': 280,
  'SGD': 11500,
  'USD': 16000,
  'IDR': 1
};

// Helper: Membersihkan string currency (contoh: "RM 15.00" -> 15.00)
const cleanCurrency = (val: string): { amount: number, rate: number } => {
  if (!val) return { amount: 0, rate: 1 };
  
  const cleanStr = val.replace(/[,]/g, ''); // Hapus ribuan separator koma
  let rate = 1;

  if (cleanStr.includes('RM')) rate = EXCHANGE_RATES['MYR'];
  else if (cleanStr.includes('PHP') || cleanStr.includes('₱')) rate = EXCHANGE_RATES['PHP'];
  else if (cleanStr.includes('SGD') || cleanStr.includes('S$')) rate = EXCHANGE_RATES['SGD'];
  else if (cleanStr.includes('USD') || cleanStr.includes('$')) rate = EXCHANGE_RATES['USD'];
  
  // Ambil angka saja (support desimal titik)
  const numStr = cleanStr.replace(/[^0-9.]/g, '');
  const amount = parseFloat(numStr) || 0;
  
  return { amount, rate };
};

// Helper: Parse CSV Line manually (handling quoted strings)
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

export const parseShopeeCSV = (text: string) => {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  // Cari baris header (kadang baris pertama bukan header di Shopee report)
  const headerIdx = lines.findIndex(l => l.includes('No. Resi'));
  if (headerIdx === -1) return [];

  const headers = parseCSVLine(lines[headerIdx]);
  const dataRows = lines.slice(headerIdx + 1);
  
  // Map index kolom
  const idxResi = headers.findIndex(h => h.includes('No. Resi'));
  const idxOrder = headers.findIndex(h => h.includes('No. Pesanan'));
  const idxUser = headers.findIndex(h => h.includes('Username (Pembeli)'));
  const idxSKU = headers.findIndex(h => h.includes('Nomor Referensi SKU'));
<<<<<<< HEAD
  
  // PERBAIKAN: Prioritaskan 'Nama Produk' (Judul), baru fallback ke 'Nama Variasi'
  let idxNama = headers.findIndex(h => h.includes('Nama Produk'));
  if (idxNama === -1) {
    idxNama = headers.findIndex(h => h.includes('Nama Variasi'));
  }

=======
  const idxNama = headers.findIndex(h => h.includes('Nama Variasi')); // atau Nama Produk
>>>>>>> ea30e59be5d9b9efde405f669077f2a2b2a2ad70
  const idxQty = headers.findIndex(h => h.includes('Jumlah'));
  const idxTotal = headers.findIndex(h => h.includes('Total Harga Produk')); // Atau Harga Setelah Diskon
  
  return dataRows.map(line => {
    const cols = parseCSVLine(line);
    if (cols.length < headers.length) return null;

    const { amount, rate } = cleanCurrency(cols[idxTotal]);
    const totalPriceIDR = amount * rate;

<<<<<<< HEAD
    // Ambil nama produk dan bersihkan tanda petik jika ada
    const rawName = cols[idxNama] || '';
    const finalName = rawName.replace(/["']/g, '').trim() || 'Produk Shopee';

=======
>>>>>>> ea30e59be5d9b9efde405f669077f2a2b2a2ad70
    return {
      resi: cols[idxResi]?.replace(/["']/g, ''),
      order_id: cols[idxOrder]?.replace(/["']/g, ''),
      customer: cols[idxUser]?.replace(/["']/g, ''),
      part_number: cols[idxSKU]?.replace(/["']/g, ''),
<<<<<<< HEAD
      product_name: finalName, 
=======
      product_name: cols[idxNama] || 'Produk Shopee',
>>>>>>> ea30e59be5d9b9efde405f669077f2a2b2a2ad70
      quantity: parseInt(cols[idxQty]) || 1,
      total_price: totalPriceIDR,
      original_currency_val: cols[idxTotal]
    };
  }).filter(Boolean); // Hapus null rows
};

export const parseTikTokCSV = (text: string) => {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  const headerIdx = lines.findIndex(l => l.includes('Tracking ID'));
  if (headerIdx === -1) return [];

  const headers = parseCSVLine(lines[headerIdx]);
  const dataRows = lines.slice(headerIdx + 1);

  const idxResi = headers.findIndex(h => h.includes('Tracking ID'));
  const idxOrder = headers.findIndex(h => h.includes('Order ID'));
  const idxUser = headers.findIndex(h => h.includes('Buyer Username'));
  const idxSKU = headers.findIndex(h => h.includes('Seller SKU'));
<<<<<<< HEAD
  const idxProductName = headers.findIndex(h => h.includes('Product Name')); // Tambahkan deteksi nama produk TikTok
=======
>>>>>>> ea30e59be5d9b9efde405f669077f2a2b2a2ad70
  const idxQty = headers.findIndex(h => h.includes('Quantity'));
  const idxTotal = headers.findIndex(h => h.includes('SKU Subtotal After Discount'));

  return dataRows.map(line => {
    const cols = parseCSVLine(line);
    if (cols.length < headers.length) return null;

    const { amount, rate } = cleanCurrency(cols[idxTotal]);
    
<<<<<<< HEAD
    // Logic nama produk TikTok
    const rawName = idxProductName !== -1 ? cols[idxProductName] : '';
    const finalName = rawName ? rawName.replace(/["']/g, '').trim() : 'Produk TikTok';

=======
>>>>>>> ea30e59be5d9b9efde405f669077f2a2b2a2ad70
    return {
      resi: cols[idxResi]?.replace(/["']/g, ''),
      order_id: cols[idxOrder]?.replace(/["']/g, ''),
      customer: cols[idxUser]?.replace(/["']/g, ''),
      part_number: cols[idxSKU]?.replace(/["']/g, ''),
<<<<<<< HEAD
      product_name: finalName,
=======
      product_name: 'Produk TikTok', // TikTok CSV kadang nama produknya jauh
>>>>>>> ea30e59be5d9b9efde405f669077f2a2b2a2ad70
      quantity: parseInt(cols[idxQty]) || 1,
      total_price: amount * rate,
      original_currency_val: cols[idxTotal]
    };
  }).filter(Boolean);
};