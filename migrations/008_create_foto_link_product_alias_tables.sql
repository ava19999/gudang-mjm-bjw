-- ============================================================================
-- Migration: 008_create_foto_link_product_alias_tables.sql
-- Description: Create tables for foto_link and product_alias
-- NOTE: These tables may already exist - this is for reference only
-- Created: 2026-02-02
-- ============================================================================

-- ============================================================================
-- IMPORTANT: Jika tabel foto_link sudah ada tapi belum punya kolom "sku",
-- jalankan SQL ini dulu:
-- ============================================================================

ALTER TABLE foto_link ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_foto_link_sku ON foto_link(sku);

-- ============================================================================
-- TABLE: foto_link (Reference Only - skip if already exists)
-- Description: Mapping antara nama_csv dari e-commerce dan SKU di gudang
-- NOTE: nama_csv is the primary key (implicit from Supabase schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS foto_link (
    nama_csv TEXT PRIMARY KEY,
    sku VARCHAR(100),
    foto_1 TEXT,
    foto_2 TEXT,
    foto_3 TEXT,
    foto_4 TEXT,
    foto_5 TEXT,
    foto_6 TEXT,
    foto_7 TEXT,
    foto_8 TEXT,
    foto_9 TEXT,
    foto_10 TEXT
);

-- ============================================================================
-- TABLE: foto
-- Description: Foto produk berdasarkan part_number/SKU
-- Primary Key: id, Unique constraint on part_number
-- ============================================================================

CREATE TABLE IF NOT EXISTS foto (
    id SERIAL PRIMARY KEY,
    part_number VARCHAR(100) UNIQUE NOT NULL,
    foto_1 TEXT,
    foto_2 TEXT,
    foto_3 TEXT,
    foto_4 TEXT,
    foto_5 TEXT,
    foto_6 TEXT,
    foto_7 TEXT,
    foto_8 TEXT,
    foto_9 TEXT,
    foto_10 TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index untuk pencarian berdasarkan part_number
CREATE INDEX IF NOT EXISTS idx_foto_part_number ON foto(part_number);

-- ============================================================================
-- TABLE: product_alias
-- Description: Alias/nama alternatif untuk produk, untuk fitur pencarian
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_alias (
    id SERIAL PRIMARY KEY,
    part_number VARCHAR(100) NOT NULL,
    alias_name TEXT NOT NULL,
    source VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(part_number, alias_name)
);

-- Index untuk pencarian berdasarkan alias
CREATE INDEX IF NOT EXISTS idx_product_alias_alias_name ON product_alias(alias_name);
CREATE INDEX IF NOT EXISTS idx_product_alias_part_number ON product_alias(part_number);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Enable for all tables
-- ============================================================================

ALTER TABLE foto_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE foto ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_alias ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users
DROP POLICY IF EXISTS "Allow all for authenticated users" ON foto_link;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON foto;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON product_alias;

CREATE POLICY "Allow all for authenticated users" ON foto_link FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON foto FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON product_alias FOR ALL USING (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE foto_link IS 'Mapping nama produk dari CSV e-commerce ke SKU gudang dengan foto';
COMMENT ON COLUMN foto_link.nama_csv IS 'Nama produk dari file CSV e-commerce (primary key)';
COMMENT ON COLUMN foto_link.sku IS 'SKU/Part Number di gudang';

COMMENT ON TABLE foto IS 'Foto produk berdasarkan part_number/SKU';
COMMENT ON COLUMN foto.part_number IS 'Part number / SKU produk (unique)';

COMMENT ON TABLE product_alias IS 'Alias/nama alternatif untuk produk, digunakan untuk fitur pencarian';
COMMENT ON COLUMN product_alias.part_number IS 'Part number produk di gudang';
COMMENT ON COLUMN product_alias.alias_name IS 'Nama alternatif (misal: nama dari CSV e-commerce)';
COMMENT ON COLUMN product_alias.source IS 'Sumber alias: manual, foto_link, csv_upload, etc';
