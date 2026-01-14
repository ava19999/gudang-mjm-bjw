# Gudang MJM-BJW Kosongan

Versi statis dari sistem manajemen inventory untuk MJM86 dan BJW Autopart.

## Deskripsi

Ini adalah versi statis dari aplikasi inventory management yang hanya menampilkan antarmuka pengguna (UI) tanpa koneksi ke database atau layanan eksternal. Semua data ditampilkan sebagai placeholder atau kosong.

## Fitur UI

- **Store Selector**: Pilih antara MJM86 atau BJW Autopart
- **Login Page**: Halaman login dengan mode Admin dan Pengunjung
  - Password Admin MJM: `mjm123`
  - Password Admin BJW: `bjw123`
- **Dashboard**: Tampilan dashboard dengan statistik kosong
- **Gudang**: Daftar inventory (kosong)
- **Input Barang**: Form input barang masuk
- **Manajemen Pesanan**: Manajemen order

## Cara Menjalankan

1. Install dependencies:
   ```bash
   npm install
   ```

2. Jalankan development server:
   ```bash
   npm run dev
   ```

3. Build untuk production:
   ```bash
   npm run build
   ```

## Catatan

- Aplikasi ini **TIDAK** terhubung ke database
- Aplikasi ini **TIDAK** menggunakan API eksternal (Supabase, Gemini AI)
- Semua aksi (simpan, update, delete) hanya akan menampilkan log di console
- Data yang ditampilkan adalah placeholder/kosong

## Teknologi

- React 19
- TypeScript
- Vite
- React Router
- Lucide React (icons)

