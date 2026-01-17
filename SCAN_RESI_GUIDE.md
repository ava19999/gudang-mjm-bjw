# Panduan Sistem Scan Resi 3 Tahap

## 📋 Daftar Isi
1. [Gambaran Umum](#gambaran-umum)
2. [Persiapan Database](#persiapan-database)
3. [Alur Kerja 3 Tahap](#alur-kerja-3-tahap)
4. [Panduan Penggunaan](#panduan-penggunaan)
5. [Format CSV E-commerce](#format-csv-e-commerce)
6. [FAQ & Troubleshooting](#faq--troubleshooting)

---

## 🎯 Gambaran Umum

Sistem Scan Resi 3 Tahap adalah fitur untuk menangani pesanan dari berbagai platform e-commerce (Shopee, TikTok, Kilat, Reseller, dan Ekspor) dengan alur kerja yang terstruktur dan efisien.

### Platform E-commerce yang Didukung:
- **Shopee** → Sub-toko: LARIS, MJM, BJW
- **TikTok** → Sub-toko: LARIS, MJM, BJW
- **Kilat** → Sub-toko: MJM, BJW, LARIS (untuk orderan ke gudang e-commerce)
- **Reseller** → Input manual langsung
- **Ekspor** → Sub-toko: MJM, LARIS, BJW (dengan negara: PH, MY, SG, HK)

### Alur 3 Tahap:

```
┌──────────────────┐
│   STAGE 1        │  Orang ke-1: Scanner Gudang
│   Scan Resi      │  → Scan resi dengan barcode scanner fisik
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│   STAGE 2        │  Orang ke-2: Verifikasi Packing
│   Verifikasi     │  → Scan resi dengan kamera HP
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│   STAGE 3        │  Orang ke-3: Data Entry
│   Finalisasi     │  → Import CSV + Edit data + Kurangi stock
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│   COMPLETED      │  Data masuk ke Barang Keluar
│   Selesai        │  → Tampil di "Sudah Terjual"
└──────────────────┘
```

---

## 🗄️ Persiapan Database

### Langkah 1: Jalankan Migration

1. Buka **Supabase Dashboard** → SQL Editor
2. Buka file: `migrations/003_create_resi_scan_3_stage_tables.sql`
3. Copy seluruh isi file dan paste ke SQL Editor
4. Klik **Run** untuk menjalankan migration

**Expected Result:** 
```
✓ Migration 003 completed successfully - All 6 tables created
```

### Tabel yang Dibuat:

| Tabel | Fungsi |
|-------|--------|
| `resi_scan_stage_mjm` / `resi_scan_stage_bjw` | Data resi dan status 3 tahap |
| `resi_items_mjm` / `resi_items_bjw` | Detail item per resi |
| `part_substitusi` | Mapping part number alternatif |
| `reseller_master` | Data master reseller |

### Langkah 2: Verifikasi

Jalankan query berikut untuk memastikan tabel sudah dibuat:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN (
  'resi_scan_stage_mjm',
  'resi_scan_stage_bjw',
  'resi_items_mjm',
  'resi_items_bjw',
  'part_substitusi',
  'reseller_master'
)
ORDER BY table_name;
```

**Expected Result:** 6 rows

---

## 🔄 Alur Kerja 3 Tahap

### STAGE 1: Scanner Gudang

**Siapa:** Orang ke-1 (Staff Gudang)

**Tugas:**
1. Pilih platform e-commerce (Shopee/TikTok/Kilat/Reseller/Ekspor)
2. Pilih sub-toko (MJM/BJW/LARIS)
3. Jika Ekspor: Pilih negara tujuan (PH/MY/SG/HK)
4. Scan resi menggunakan **barcode scanner fisik**
5. Resi akan masuk ke daftar Stage 1

**Catatan Khusus:**
- **Kilat**: Per resi qty hanya 1 dan 1 barang saja
- **Reseller**: Input manual langsung ke barang keluar (bypass Stage 2 & 3)
- Jika barang kosong, resi tidak akan di-scan
- Bisa hapus resi yang salah (hanya sebelum Stage 2)

**Navigasi:**
- Menu: **Scan Resi** → **Stage 1: Scanner**

---

### STAGE 2: Verifikasi Packing

**Siapa:** Orang ke-2 (Staff Packing)

**Tugas:**
1. Lihat daftar resi dari Stage 1 yang belum diverifikasi
2. Aktifkan kamera HP
3. Scan resi menggunakan **kamera HP**
4. Sistem akan otomatis verifikasi resi

**Fitur Kamera:**
- Izin kamera otomatis diminta
- Audio feedback saat berhasil scan
- Cooldown 2 detik antar scan (mencegah scan ganda)
- Support berbagai format barcode (QR, Code128, EAN, UPC)

**Catatan:**
- Hanya perlu scan resi, **tidak perlu tahu detail customer**
- Data belum lengkap di stage ini, fokus verifikasi fisik
- Tidak perlu menunggu data lengkap dari Stage 1

**Navigasi:**
- Menu: **Scan Resi** → **Stage 2: Verifikasi**

---

### STAGE 3: Data Entry & Finalisasi

**Siapa:** Orang ke-3 (Admin Data Entry)

**Tugas:**
1. **Import CSV** dari export e-commerce (Shopee/TikTok)
2. **Edit data** dalam tampilan spreadsheet
3. **Lookup part number** otomatis dari database
4. **Split item** untuk produk SET (kiri-kanan) jika perlu
5. **Input manual** untuk produk tanpa SKU
6. **Complete** untuk memproses pesanan

**Fitur Import CSV:**
- Auto-detect platform (Shopee/TikTok)
- Validasi format CSV
- Preview data sebelum import
- Filter berdasarkan resi yang sudah di-scan Stage 2

**Fitur Editor:**
- Tampilan spreadsheet interaktif
- Autocomplete part number
- Tombol **+** untuk split item (harga otomatis dibagi)
- Validasi stock sebelum proses
- Preview stock sebelum & sesudah

**Hasil Akhir:**
- Stock berkurang di `base_mjm` / `base_bjw`
- Data masuk ke `barang_keluar_mjm` / `barang_keluar_bjw`
- Status resi berubah menjadi "Completed"
- Tampil di "Manajemen Pesanan" → "Sudah Terjual"

**Navigasi:**
- Menu: **Scan Resi** → **Stage 3: Data Entry**

---

## 📖 Panduan Penggunaan

### Akses Menu

#### Desktop:
1. Login sebagai Admin
2. Klik menu **Scan Resi** di header
3. Pilih stage yang diinginkan:
   - Stage 1: Scanner
   - Stage 2: Verifikasi
   - Stage 3: Data Entry
   - Riwayat

#### Mobile:
1. Login sebagai Admin
2. Tap ikon **Scan Resi** di bottom navigation
3. Pilih stage dari dropdown

---

### Stage 1: Scanner Gudang

#### 1. Scan Resi Baru

```
1. Pilih E-commerce:        [Shopee ▼]
2. Pilih Sub Toko:          [MJM ▼]
3. (Jika Ekspor) Negara:    [PH ▼]
4. Scan/Ketik Resi:         [____________] [Scan]
```

**Tips:**
- Barcode scanner akan otomatis input ke field resi
- Tekan Enter atau klik Scan untuk menyimpan
- Auto-focus kembali ke field resi setelah scan
- Resi akan muncul di tabel di bawah form

#### 2. Melihat Daftar Resi

Tabel menampilkan:
- Tanggal scan
- Nomor resi
- Platform e-commerce
- Sub-toko
- Status (Stage 1/2/Selesai)
- Nama scanner
- Tombol hapus (jika belum Stage 2)

#### 3. Hapus Resi Salah

- Klik tombol **hapus (🗑️)** di kolom Aksi
- Konfirmasi penghapusan
- **Catatan:** Hanya bisa dihapus sebelum Stage 2

#### 4. Input Reseller

```
1. Pilih E-commerce:    [Reseller ▼]
2. Klik:                [Input Order Reseller]
3. Pilih Reseller:      [Anan ▼]
   atau
   Tambah Baru:         [____________] [Tambah]
```

**Catatan:**
- Reseller bypass Stage 2 & 3
- Data langsung masuk ke barang keluar

---

### Stage 2: Verifikasi Packing

#### 1. Aktifkan Kamera

```
1. Klik: [Aktifkan Kamera]
2. Izinkan akses kamera jika diminta
3. Arahkan kamera ke barcode resi
4. Tunggu beep/notifikasi
```

**Status Kamera:**
- 🟢 **Scanning** - Kamera aktif, siap scan
- 🔴 **Stopped** - Kamera nonaktif
- 🟡 **Loading** - Sedang inisialisasi

#### 2. Scan Resi

- Arahkan kamera ke barcode
- Sistem otomatis detect dan verifikasi
- Audio feedback saat berhasil
- Cooldown 2 detik antar scan
- Status resi otomatis update

#### 3. Monitoring

**Pending (Perlu Diverifikasi):**
- List resi dari Stage 1 yang belum diverifikasi
- Total count di bagian atas

**Verified (Sudah Diverifikasi):**
- List resi yang sudah diverifikasi
- Siap untuk Stage 3

---

### Stage 3: Data Entry & Finalisasi

#### 1. Import CSV

```
1. Klik: [📁 Upload CSV]
2. Pilih file CSV dari Shopee/TikTok
3. Platform auto-detect
4. Preview data yang akan diimport
5. Klik: [Import Data]
```

**Validasi CSV:**
- Format Shopee: No. Resi, Nama Produk, Jumlah
- Format TikTok: Tracking ID, Product Name, Quantity
- Duplikat item otomatis skip
- Summary statistik ditampilkan

#### 2. Edit Data Item

Tampilan spreadsheet dengan kolom:
- **Resi** - Nomor resi (readonly)
- **Customer** - Nama customer
- **Part Number** - Input/Autocomplete
- **Nama Barang** - Auto-fill dari lookup
- **Qty** - Quantity keluar
- **Harga Satuan** - Harga per unit
- **Harga Total** - Total harga
- **Aksi** - Split/Delete

**Autocomplete Part Number:**
- Ketik part number
- Muncul suggestion dari database
- Pilih dari list
- Data auto-fill (nama, brand, application, stock)

**Split Item (SET Kiri-Kanan):**
```
Contoh: Set Kampas Rem Kiri-Kanan
1. Klik tombol [+] di kolom Aksi
2. Pilih split count: [2 ▼]
3. Harga otomatis dibagi 2
4. Muncul 2 baris dengan part number sama
```

**Manual Input (Tanpa SKU):**
```
1. Centang "Input Manual"
2. Isi semua field secara manual:
   - Part Number
   - Nama Barang
   - Brand
   - Application
   - Qty
   - Harga
```

#### 3. Preview & Complete

```
Before:
Stock Part A: 100
Stock Part B: 50

After:
Stock Part A: 95 (-5)
Stock Part B: 48 (-2)

[Preview Stock] [Complete Order]
```

**Validasi Sebelum Complete:**
- ✓ Semua item punya part number
- ✓ Stock mencukupi untuk semua item
- ✓ Resi sudah diverifikasi Stage 2
- ✗ Stock tidak cukup → Error

**Setelah Complete:**
- Stock berkurang
- Data masuk barang_keluar
- Status resi = Completed
- Tampil di "Sudah Terjual"

---

### Riwayat Scan Resi

#### 1. Filter Data

```
Status:         [All ▼] / Stage1 / Stage2 / Completed
E-commerce:     [All ▼] / Shopee / TikTok / Kilat / etc
Tanggal Dari:   [📅 DD/MM/YYYY]
Tanggal Sampai: [📅 DD/MM/YYYY]
Search:         [____________] 🔍
```

#### 2. Statistik Dashboard

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Total Resi      │  │ Stage 1         │  │ Stage 2         │
│ 1,234           │  │ 45              │  │ 23              │
└─────────────────┘  └─────────────────┘  └─────────────────┘

┌─────────────────┐  ┌─────────────────┐
│ Completed       │  │ Processing Rate │
│ 1,166           │  │ 95.5%           │
└─────────────────┘  └─────────────────┘
```

#### 3. Timeline View

Visual progress per resi:
```
[✓ Stage 1] ────→ [✓ Stage 2] ────→ [✓ Stage 3]
   12:30            13:15              14:45
```

#### 4. Export Data

- Format: Excel (.xlsx)
- Filter yang aktif akan diterapkan
- Include: Semua data resi + items
- Download otomatis

---

## 📄 Format CSV E-commerce

### Shopee Export

**Required Columns:**
- `No. Pesanan`
- `No. Resi`
- `Nama Produk`
- `Nomor Referensi SKU`
- `Jumlah`
- `Nama Penerima`

**Export Steps:**
1. Login Shopee Seller Center
2. Orders → All Orders
3. Filter by date/status
4. Export → Download CSV

**Sample CSV:**
```csv
No. Pesanan,No. Resi,Nama Produk,Jumlah,Nama Penerima
240101ABC,SPXID123456,Kampas Rem Depan,2,John Doe
```

---

### TikTok Export

**Required Columns:**
- `Order ID`
- `Tracking ID`
- `Product Name`
- `Seller SKU`
- `Quantity`
- `Recipient`

**Export Steps:**
1. Login TikTok Seller Center
2. Orders → Order Management
3. Filter by date/status
4. Export → Download CSV

**Sample CSV:**
```csv
Order ID,Tracking ID,Product Name,Quantity,Recipient
TT001,TIKID789,Filter Oli,1,Jane Smith
```

---

## ❓ FAQ & Troubleshooting

### Umum

**Q: Apakah bisa skip Stage 2?**
A: Tidak, semua resi harus melewati Stage 1 dan 2 sebelum Stage 3.

**Q: Bagaimana jika resi salah di-scan?**
A: Hapus di Stage 1 sebelum Stage 2. Setelah Stage 2, hubungi admin.

**Q: Bisa scan multiple toko dalam satu session?**
A: Ya, pilih toko berbeda untuk setiap scan.

---

### Stage 1

**Q: Scanner tidak terdeteksi?**
A: 
- Pastikan scanner USB tersambung
- Test scanner di notepad
- Cek driver scanner

**Q: Resi duplikat?**
A: Sistem otomatis reject resi duplikat dengan pesan error.

---

### Stage 2

**Q: Kamera tidak aktif?**
A:
1. Cek izin kamera di browser
2. Coba browser lain (Chrome recommended)
3. Restart browser
4. Cek kamera di aplikasi lain

**Q: Barcode tidak terdeteksi?**
A:
- Pastikan lighting cukup
- Jaga jarak 10-30cm
- Barcode tidak blur/rusak
- Coba angle berbeda

**Q: Auto-scan terus-menerus?**
A: Ada cooldown 2 detik, tunggu beberapa saat.

---

### Stage 3

**Q: CSV format error?**
A:
- Pastikan export dari Shopee/TikTok langsung
- Jangan edit CSV di Excel
- Encoding UTF-8

**Q: Part number tidak ditemukan?**
A:
- Cek di database manual
- Gunakan "Input Manual" jika perlu
- Tambah substitusi part number

**Q: Stock tidak cukup?**
A:
- Cek stock aktual di gudang
- Update stock di sistem jika perlu
- Pisah order jika stock terbatas

**Q: Item SET tidak split otomatis?**
A: Gunakan tombol [+] untuk manual split.

---

### Error Messages

| Error | Penyebab | Solusi |
|-------|----------|--------|
| "Resi sudah di-scan" | Duplikat | Hapus/skip resi |
| "Resi belum Stage 1" | Stage 2 tanpa Stage 1 | Scan di Stage 1 dulu |
| "Stock tidak cukup" | Qty > Stock | Update stock/kurangi qty |
| "CSV format invalid" | File bukan export asli | Download ulang dari platform |
| "Kamera tidak tersedia" | No permission/driver | Izinkan akses kamera |

---

## 📞 Support

**Issues/Bugs:**
- GitHub Issues: [Link to repo]
- Email: support@example.com

**Documentation:**
- Technical: `/SCAN_RESI_UI_IMPLEMENTATION.md`
- Quick Start: `/SCAN_RESI_QUICKSTART.md`

---

## 🔄 Update Log

### Version 1.0.0 (Initial Release)
- ✅ Stage 1: Scanner Gudang
- ✅ Stage 2: Camera Verification
- ✅ Stage 3: CSV Import & Data Entry
- ✅ Riwayat dengan filtering lengkap
- ✅ Support 5 platform e-commerce
- ✅ Auto part number lookup
- ✅ Split item functionality
- ✅ Stock validation
- ✅ Substitusi part number
- ✅ Reseller direct input

---

**Last Updated:** 2026-01-17
**Version:** 1.0.0
