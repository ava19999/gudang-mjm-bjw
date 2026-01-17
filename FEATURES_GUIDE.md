# Panduan Fitur Baru - Gudang MJM-BJW

Dokumen ini menjelaskan fitur-fitur baru yang telah ditambahkan ke sistem manajemen gudang.

---

## 1. 📊 Dashboard Statistik Operasional

Dashboard interaktif untuk monitoring operasional gudang dengan visualisasi data yang informatif.

### Fitur Dashboard:

#### A. Kartu Ringkasan
- **Pesanan Selesai**: Jumlah pesanan yang telah diselesaikan
- **Pesanan Pending**: Pesanan yang masih menunggu diproses
- **Pendapatan Hari Ini**: Total pendapatan dari pesanan hari ini
- **Pendapatan Minggu Ini**: Akumulasi pendapatan minggu berjalan

#### B. Grafik Visual
1. **Status Pesanan (Pie Chart)**
   - Perbandingan pesanan selesai vs pending
   - Visualisasi persentase dengan warna berbeda

2. **Breakdown Per Marketplace**
   - Bar chart horizontal menunjukkan performa setiap marketplace
   - Shopee, TikTok, Tokopedia, Lazada, Offline, dll.

3. **Tren Pesanan 7 Hari**
   - Bar chart menampilkan tren pesanan harian
   - Hover untuk melihat detail pesanan dan pendapatan

#### C. Tabel Ringkasan Pesanan
Menampilkan:
- Total pesanan aktif
- Pesanan selesai
- Pendapatan harian dan mingguan

### Cara Menggunakan:
1. Login sebagai Admin
2. Masuk ke menu **Gudang** atau **Dashboard**
3. Klik tombol **"Tampilkan Statistik Operasional"**
4. Lihat berbagai metrik dan grafik operasional
5. Klik **"Sembunyikan Statistik"** untuk menutup

---

## 2. 🔍 Sistem Filter Fleksibel untuk Pesanan

Filter canggih untuk memudahkan pencarian dan pengelompokan data pesanan.

### Fitur Filter:

#### A. Search Bar
- Cari berdasarkan **nama customer**
- Cari berdasarkan **nomor resi**
- Cari berdasarkan **nama barang**
- Cari berdasarkan **part number**

#### B. Filter Status
Pilihan status:
- Semua Status (default)
- Belum Diproses
- Diproses
- Ditolak
- Pending
- Siap Kirim
- Terjual

#### C. Filter Marketplace
Pilihan marketplace:
- Semua Marketplace (default)
- Shopee
- TikTok
- Tokopedia
- Lazada
- Offline
- Aplikasi

#### D. Filter Tanggal
- **Dari Tanggal**: Tanggal awal periode
- **Sampai Tanggal**: Tanggal akhir periode
- Filter otomatis berdasarkan rentang tanggal

#### E. Reset Filter
- Tombol **"Reset Semua Filter"** untuk menghapus semua filter sekaligus

### Cara Menggunakan:
1. Buka menu **Pesanan** (Order Management)
2. Gunakan search bar untuk pencarian cepat
3. Pilih filter status, marketplace, atau tanggal sesuai kebutuhan
4. Hasil akan ditampilkan secara otomatis
5. Klik "Reset Semua Filter" untuk menghapus filter

---

## 3. 📦 Produk Set dengan Multiple Variasi

Fitur untuk mengelola produk yang memiliki beberapa variasi atau merupakan set produk.

### Fitur Produk Set:

#### A. Checkbox "Produk Set"
- Aktifkan untuk produk yang merupakan set atau memiliki variasi
- Contoh: Spion Kiri & Kanan, Lampu Depan Kiri & Kanan

#### B. Input Variasi
Setiap variasi memiliki:
- **Nama Item**: Contoh "Kiri" atau "Kanan"
- **SKU**: Kode SKU spesifik untuk variasi
- **Harga (Auto)**: Harga otomatis dibagi dari harga total

#### C. Auto-Calculate Harga
- Harga total secara otomatis dibagi berdasarkan jumlah item
- Contoh: Set 2 item dengan harga Rp 100.000 = Rp 50.000 per item
- Contoh: Set 3 item dengan harga Rp 150.000 = Rp 50.000 per item

#### D. Tombol "+" (Tambah Item)
- Klik untuk menambah variasi baru ke produk set
- Harga akan otomatis dikalkulasi ulang

#### E. Tombol "X" (Hapus Item)
- Hapus variasi yang tidak diperlukan
- Minimal harus ada 1 item dalam set

### Cara Menggunakan:

1. **Tambah Produk Baru**:
   - Klik tombol **"+"** di dashboard Gudang
   - Isi informasi produk (nama, part number, dll.)

2. **Aktifkan Produk Set**:
   - Centang checkbox **"Produk Set"**
   - Form variasi akan muncul

3. **Tambah Variasi**:
   - Isi nama item (contoh: "Kiri")
   - Isi SKU khusus untuk variasi tersebut
   - Klik **"Tambah Item"** untuk menambah variasi lain

4. **Set Harga**:
   - Masukkan harga modal total di field "Harga Modal (Satuan)"
   - Sistem akan otomatis membagi harga ke setiap variasi
   - Lihat harga per item di kolom "Harga (Auto)"

5. **Simpan**:
   - Klik tombol **"Simpan"** untuk menyimpan produk

### Contoh Kasus:

**Produk: Spion Mobil Set**
- Harga Total: Rp 200.000
- Item 1: Spion Kiri (SKU: SPION-L) = Rp 100.000
- Item 2: Spion Kanan (SKU: SPION-R) = Rp 100.000

---

## 4. ⚠️ Validasi Duplikasi Resi

Sistem validasi untuk mencegah scanning nomor resi yang sama lebih dari sekali.

### Fitur Validasi:

#### A. Deteksi Resi Duplikat
- Sistem otomatis mengecek resi yang sudah discan sebelumnya
- Notifikasi **"⚠️ DUPLIKASI"** muncul jika resi sudah ada

#### B. Pesan Peringatan
Beberapa jenis pesan:
- **"⚠️ DUPLIKASI: Resi [nomor] sudah discan sebelumnya!"**
  - Resi sudah siap kirim dan discan lagi
- **"⚠️ Resi [nomor] sudah pernah discan. Status: Siap Kirim"**
  - Resi sudah lengkap, status diupdate ke "Siap Kirim"
- **"⚠️ Resi [nomor] sudah discan. Data Masih Kurang!"**
  - Resi sudah ada tapi datanya belum lengkap

#### C. Update Status Otomatis
Saat scan resi yang sudah ada:
- Jika data lengkap → Status: **"Siap Kirim"**
- Jika data tidak lengkap → Status: **"Pending"**
- Timestamp diupdate ke waktu scan terakhir

### Cara Menggunakan:

1. **Scan Resi Baru**:
   - Pilih toko dan marketplace
   - Scan barcode resi
   - Jika baru, akan tersimpan dengan status "Pending"

2. **Scan Resi yang Sudah Ada**:
   - Sistem akan cek database
   - Muncul notifikasi duplikasi
   - Status diupdate sesuai kelengkapan data

3. **Lengkapi Data**:
   - Isi Part Number, Nama Barang, Customer, Quantity
   - Scan ulang untuk update status ke "Siap Kirim"

---

## Tips Penggunaan

### Dashboard:
- Gunakan dashboard untuk monitoring harian
- Check tren pesanan untuk analisis performa
- Monitor marketplace terbaik dari bar chart

### Filter Pesanan:
- Gunakan kombinasi filter untuk hasil spesifik
- Filter tanggal berguna untuk laporan periodik
- Search bar untuk pencarian cepat customer tertentu

### Produk Set:
- Gunakan untuk produk yang dijual berpasangan
- Nama variasi yang jelas (Kiri/Kanan, Depan/Belakang)
- SKU berbeda untuk setiap variasi memudahkan tracking

### Validasi Resi:
- Scan resi hanya sekali untuk menghindari duplikasi
- Pastikan data lengkap sebelum scan akhir
- Cek notifikasi untuk mengetahui status resi

---

## FAQ

**Q: Bagaimana cara melihat statistik operasional?**  
A: Klik tombol "Tampilkan Statistik Operasional" di halaman Dashboard/Gudang.

**Q: Apakah filter bisa dikombinasikan?**  
A: Ya, semua filter dapat digunakan bersamaan untuk hasil yang lebih spesifik.

**Q: Bagaimana cara membuat produk set?**  
A: Centang checkbox "Produk Set" saat menambah produk baru, lalu tambahkan variasi.

**Q: Apa yang terjadi jika scan resi duplikat?**  
A: Sistem akan menampilkan peringatan dan mengupdate timestamp, tidak membuat entry baru.

**Q: Apakah harga variasi bisa diubah manual?**  
A: Tidak, harga variasi otomatis dihitung berdasarkan harga total dibagi jumlah item.

---

## Dukungan Teknis

Jika mengalami masalah atau butuh bantuan:
1. Cek dokumentasi ini terlebih dahulu
2. Hubungi admin sistem
3. Laporkan bug atau saran melalui GitHub Issues

---

**Versi**: 1.0  
**Terakhir Diperbarui**: Januari 2024  
**Sistem**: Gudang MJM-BJW Management
