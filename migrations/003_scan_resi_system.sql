-- FILE: migrations/003_scan_resi_system.sql
-- Migration: Scan Resi Online - Packing & Import System
-- Description: Create tables for resi scanning, tracking, and reconciliation

-- =====================================================
-- SCAN RESI TABLES (MJM & BJW)
-- =====================================================

-- Tabel scan resi (tracking packing) untuk MJM
CREATE TABLE IF NOT EXISTS scan_resi_mjm (
  id SERIAL PRIMARY KEY,
  tanggal TIMESTAMP DEFAULT NOW(),
  type_toko TEXT NOT NULL, -- TIKTOK, SHOPEE, KILAT, RESELLER, EKSPOR
  toko TEXT, -- MJM, BJW, LARIS
  negara_ekspor TEXT, -- PH, MY, SG, HK (untuk EKSPOR)
  resi TEXT NOT NULL,
  customer TEXT,
  no_pesanan TEXT,
  status TEXT DEFAULT 'SCANNED', -- SCANNED, MATCHED, PROCESSED
  scanned_at TIMESTAMP DEFAULT NOW(),
  matched_at TIMESTAMP,
  UNIQUE(resi, type_toko, toko)
);

-- Tabel sama untuk BJW
CREATE TABLE IF NOT EXISTS scan_resi_bjw (
  id SERIAL PRIMARY KEY,
  tanggal TIMESTAMP DEFAULT NOW(),
  type_toko TEXT NOT NULL,
  toko TEXT,
  negara_ekspor TEXT,
  resi TEXT NOT NULL,
  customer TEXT,
  no_pesanan TEXT,
  status TEXT DEFAULT 'SCANNED',
  scanned_at TIMESTAMP DEFAULT NOW(),
  matched_at TIMESTAMP,
  UNIQUE(resi, type_toko, toko)
);

-- =====================================================
-- SCAN RESI ITEMS TABLES (MJM & BJW)
-- =====================================================

-- Tabel detail item per resi untuk MJM
CREATE TABLE IF NOT EXISTS scan_resi_items_mjm (
  id SERIAL PRIMARY KEY,
  scan_resi_id INTEGER REFERENCES scan_resi_mjm(id) ON DELETE CASCADE,
  part_number TEXT,
  product_name_export TEXT,
  qty INTEGER,
  harga_satuan NUMERIC,
  harga_total NUMERIC,
  is_split BOOLEAN DEFAULT FALSE,
  split_group_id TEXT,
  split_count INTEGER DEFAULT 1
);

-- Tabel sama untuk BJW
CREATE TABLE IF NOT EXISTS scan_resi_items_bjw (
  id SERIAL PRIMARY KEY,
  scan_resi_id INTEGER REFERENCES scan_resi_bjw(id) ON DELETE CASCADE,
  part_number TEXT,
  product_name_export TEXT,
  qty INTEGER,
  harga_satuan NUMERIC,
  harga_total NUMERIC,
  is_split BOOLEAN DEFAULT FALSE,
  split_group_id TEXT,
  split_count INTEGER DEFAULT 1
);

-- =====================================================
-- PRODUCT ALIAS TABLE (Shared)
-- =====================================================

-- Tabel alias produk untuk search di beranda
CREATE TABLE IF NOT EXISTS product_alias (
  id SERIAL PRIMARY KEY,
  part_number TEXT NOT NULL,
  alias_name TEXT NOT NULL,
  source TEXT, -- SHOPEE, TIKTOK
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(part_number, alias_name)
);

-- =====================================================
-- KILAT ITEMS TABLES (MJM & BJW)
-- =====================================================

-- Tabel kilat tracking untuk MJM
CREATE TABLE IF NOT EXISTS kilat_items_mjm (
  id SERIAL PRIMARY KEY,
  tanggal TIMESTAMP DEFAULT NOW(),
  toko TEXT NOT NULL, -- MJM, BJW, LARIS
  part_number TEXT NOT NULL,
  nama_barang TEXT,
  status TEXT DEFAULT 'DIKIRIM', -- DIKIRIM, TERJUAL
  sold_at TIMESTAMP,
  customer TEXT,
  harga NUMERIC
);

-- Tabel sama untuk BJW
CREATE TABLE IF NOT EXISTS kilat_items_bjw (
  id SERIAL PRIMARY KEY,
  tanggal TIMESTAMP DEFAULT NOW(),
  toko TEXT NOT NULL,
  part_number TEXT NOT NULL,
  nama_barang TEXT,
  status TEXT DEFAULT 'DIKIRIM',
  sold_at TIMESTAMP,
  customer TEXT,
  harga NUMERIC
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Indexes for scan_resi_mjm
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_resi ON scan_resi_mjm(resi);
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_tanggal ON scan_resi_mjm(tanggal);
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_status ON scan_resi_mjm(status);
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_type_toko ON scan_resi_mjm(type_toko);

-- Indexes for scan_resi_bjw
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_resi ON scan_resi_bjw(resi);
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_tanggal ON scan_resi_bjw(tanggal);
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_status ON scan_resi_bjw(status);
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_type_toko ON scan_resi_bjw(type_toko);

-- Indexes for scan_resi_items
CREATE INDEX IF NOT EXISTS idx_scan_resi_items_mjm_scan_resi_id ON scan_resi_items_mjm(scan_resi_id);
CREATE INDEX IF NOT EXISTS idx_scan_resi_items_mjm_part_number ON scan_resi_items_mjm(part_number);
CREATE INDEX IF NOT EXISTS idx_scan_resi_items_bjw_scan_resi_id ON scan_resi_items_bjw(scan_resi_id);
CREATE INDEX IF NOT EXISTS idx_scan_resi_items_bjw_part_number ON scan_resi_items_bjw(part_number);

-- Indexes for product_alias
CREATE INDEX IF NOT EXISTS idx_product_alias_part_number ON product_alias(part_number);
CREATE INDEX IF NOT EXISTS idx_product_alias_alias_name ON product_alias(alias_name);

-- Indexes for kilat_items
CREATE INDEX IF NOT EXISTS idx_kilat_items_mjm_part_number ON kilat_items_mjm(part_number);
CREATE INDEX IF NOT EXISTS idx_kilat_items_mjm_status ON kilat_items_mjm(status);
CREATE INDEX IF NOT EXISTS idx_kilat_items_mjm_tanggal ON kilat_items_mjm(tanggal);
CREATE INDEX IF NOT EXISTS idx_kilat_items_bjw_part_number ON kilat_items_bjw(part_number);
CREATE INDEX IF NOT EXISTS idx_kilat_items_bjw_status ON kilat_items_bjw(status);
CREATE INDEX IF NOT EXISTS idx_kilat_items_bjw_tanggal ON kilat_items_bjw(tanggal);

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE scan_resi_mjm IS 'Tracking resi yang sudah discan untuk packing (MJM store)';
COMMENT ON TABLE scan_resi_bjw IS 'Tracking resi yang sudah discan untuk packing (BJW store)';
COMMENT ON TABLE scan_resi_items_mjm IS 'Detail item per resi hasil import CSV (MJM store)';
COMMENT ON TABLE scan_resi_items_bjw IS 'Detail item per resi hasil import CSV (BJW store)';
COMMENT ON TABLE product_alias IS 'Alias nama produk dari export Shopee/TikTok untuk search';
COMMENT ON TABLE kilat_items_mjm IS 'Tracking barang kilat shopee (MJM store)';
COMMENT ON TABLE kilat_items_bjw IS 'Tracking barang kilat shopee (BJW store)';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
