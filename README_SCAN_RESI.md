# Scan Resi Online - Packing & Import System

## Overview
Sistem scan resi untuk tracking packing dan rekonsiliasi data order dari Shopee/TikTok dengan fitur camera scanner dari HP.

## Fitur Utama

### 1. Scan Resi Packing (`/scan_resi`)
**Digunakan saat: PAGI-SIANG**

- Scan resi menggunakan **kamera HP** sebagai barcode scanner
- **AUTO-ENTER**: Scan langsung tersimpan tanpa perlu tekan tombol
- **Sound feedback**: Beep saat scan berhasil
- Pilihan type toko:
  - **TIKTOK** → Sub: LARIS, MJM, BJW
  - **SHOPEE** → Sub: LARIS, MJM, BJW
  - **KILAT** → Sub: MJM, BJW, LARIS (stok langsung berkurang, customer "KILAT SHOPEE", qty=1)
  - **RESELLER** → Input manual (resi, customer, part_number, qty, harga)
  - **EKSPOR** → Sub: PH, MY, SG, HK (dengan keterangan negara)
- Bisa hapus jika salah scan (salah pilih toko)
- Tampilkan hasil scan hari ini dalam table Excel-style

### 2. Import & Rekonsiliasi (`/import_export`)
**Digunakan saat: SORE HARI**

- Upload file CSV export dari Shopee/TikTok
- Sistem **auto-detect** format (Shopee atau TikTok)
- Auto-matching berdasarkan No. Resi dengan data scan
- Auto-fill: customer, SKU/part_number, qty, harga
- Tampilkan 3 section:
  - ✅ **MATCHED**: Resi yang di-scan dan ada di export
  - ⚠️ **SCAN TAPI TIDAK ADA DI EXPORT**: Resi yang sudah di-scan tapi tidak ada di file CSV
  - ❌ **DI EXPORT TAPI BELUM SCAN**: Resi di CSV yang belum di-scan
- Tombol "Simpan Data Matched" untuk proses update ke database
- Otomatis menyimpan alias nama produk untuk search

### 3. Status Packing Dashboard (`/packing_status`)
- Dashboard semua status packing
- Filter by:
  - Date range
  - Type toko
  - Toko
  - Status (SCANNED, MATCHED, PROCESSED)
- Summary cards: Total, Scanned, Matched, Processed
- Export to CSV
- Excel-style table

### 4. Kilat Shopee (`/kilat`)
- Scan barang (part_number) bukan resi
- Customer otomatis: "KILAT SHOPEE MJM/BJW/LARIS"
- Qty fixed = 1
- Stok langsung berkurang saat scan
- 2 Tab:
  - **DIKIRIM KE PUSAT**: List barang yang sudah dikirim
  - **SUDAH TERJUAL**: List barang yang sudah terjual (mark as sold)
- Excel-style table

### 5. Reseller (`/reseller`)
- Input manual untuk transaksi reseller
- Form header: Nomor Resi, Customer
- Table item dengan kolom:
  - Part Number (scan atau input)
  - Nama Barang (auto-fill dari database)
  - Qty
  - Harga Satuan
  - Total (auto-calculate)
- Tombol (+) untuk tambah item
- Tombol (🗑️) untuk hapus item
- Excel-style table

## Format CSV Yang Didukung

### Shopee Export Format
Required columns:
- No. Pesanan
- No. Resi
- Nama Penerima
- SKU Induk
- Nama Produk
- Jumlah
- Harga Awal (Rp)
- Total Harga (Rp)

### TikTok Export Format
Required columns:
- Order ID
- Tracking ID
- Recipient
- Seller SKU
- Product Name
- Quantity
- Original Price
- Total Amount

## Database Tables

### scan_resi_mjm / scan_resi_bjw
Tracking resi yang sudah di-scan.

Columns:
- `id` (SERIAL PRIMARY KEY)
- `tanggal` (TIMESTAMP)
- `type_toko` (TEXT) - TIKTOK, SHOPEE, KILAT, RESELLER, EKSPOR
- `toko` (TEXT) - MJM, BJW, LARIS
- `negara_ekspor` (TEXT) - PH, MY, SG, HK
- `resi` (TEXT NOT NULL)
- `customer` (TEXT)
- `no_pesanan` (TEXT)
- `status` (TEXT) - SCANNED, MATCHED, PROCESSED
- `scanned_at` (TIMESTAMP)
- `matched_at` (TIMESTAMP)
- UNIQUE constraint: `(resi, type_toko, toko)`

### scan_resi_items_mjm / scan_resi_items_bjw
Detail item per resi hasil import CSV.

Columns:
- `id` (SERIAL PRIMARY KEY)
- `scan_resi_id` (INTEGER REFERENCES scan_resi_*)
- `part_number` (TEXT)
- `product_name_export` (TEXT)
- `qty` (INTEGER)
- `harga_satuan` (NUMERIC)
- `harga_total` (NUMERIC)
- `is_split` (BOOLEAN)
- `split_group_id` (TEXT)
- `split_count` (INTEGER)

### product_alias
Alias nama produk dari export untuk search.

Columns:
- `id` (SERIAL PRIMARY KEY)
- `part_number` (TEXT NOT NULL)
- `alias_name` (TEXT NOT NULL)
- `source` (TEXT) - SHOPEE, TIKTOK
- `created_at` (TIMESTAMP)
- UNIQUE constraint: `(part_number, alias_name)`

### kilat_items_mjm / kilat_items_bjw
Tracking barang kilat shopee.

Columns:
- `id` (SERIAL PRIMARY KEY)
- `tanggal` (TIMESTAMP)
- `toko` (TEXT NOT NULL)
- `part_number` (TEXT NOT NULL)
- `nama_barang` (TEXT)
- `status` (TEXT) - DIKIRIM, TERJUAL
- `sold_at` (TIMESTAMP)
- `customer` (TEXT)
- `harga` (NUMERIC)

## Pencegahan Data Double

1. **Real-time saat scan**: Cek resi sudah ada → Alert "Resi sudah pernah discan"
2. **Database constraint**: `UNIQUE(resi, type_toko, toko)`
3. **Import validation**: Skip row duplicate, tampilkan summary

## Teknologi

- **React** + **TypeScript** untuk frontend
- **html5-qrcode** library untuk camera barcode scanner
- **papaparse** library untuk CSV parsing
- **Web Audio API** untuk beep sound
- **Supabase** untuk database

## Cara Menggunakan

### Setup Database
1. Jalankan migration SQL:
   ```bash
   # Jalankan file migrations/003_scan_resi_system.sql di Supabase
   ```

2. Pastikan Row Level Security (RLS) sudah dikonfigurasi dengan benar

### Workflow Harian

#### Pagi-Siang: Scan Resi
1. Buka menu **Online** → **Scan Resi**
2. Pilih Type Toko (SHOPEE, TIKTOK, dll)
3. Pilih Sub Toko (MJM, BJW, LARIS)
4. Klik **Start Camera**
5. Arahkan kamera ke barcode resi
6. Scan otomatis tersimpan (akan bunyi beep)
7. Lihat hasil scan di table bawah

#### Sore: Import & Rekonsiliasi
1. Export data order dari Shopee/TikTok dalam format CSV
2. Buka menu **Online** → **Import Data**
3. Klik **Pilih File CSV**
4. Klik **Process & Match**
5. Review data matched, scan only, dan CSV only
6. Klik **Simpan Data Matched**

#### Kapan Saja: Cek Status
1. Buka menu **Online** → **Status Packing**
2. Set filter tanggal, toko, dan status
3. Klik **Refresh**
4. Export CSV jika diperlukan

## Troubleshooting

### Camera tidak bisa diakses
- Pastikan browser memiliki izin akses kamera
- Gunakan HTTPS (camera API butuh secure context)
- Coba browser lain (Chrome, Safari, Firefox)

### CSV tidak terbaca
- Pastikan format CSV sesuai (Shopee atau TikTok)
- Cek encoding file (harus UTF-8)
- Pastikan kolom required ada

### Resi tidak match
- Cek apakah resi sudah di-scan
- Cek apakah format resi di CSV sama persis
- Pastikan tanggal scan dan export tidak terlalu jauh

## TODO / Future Enhancements

- [ ] Fitur split set untuk item bundle
- [ ] Bulk delete untuk resi
- [ ] Print label resi
- [ ] Integration dengan API Shopee/TikTok langsung
- [ ] Dashboard analytics packing performance
- [ ] Mobile app dedicated untuk scanner

## Support

Untuk bantuan lebih lanjut, hubungi tim development.
