-- FILE: migrations/003_scan_resi_online_system.sql
-- Migration for Comprehensive Scan Resi Online System
-- Created: 2026-01-17
-- Description: Adds columns for scan resi system and creates product_alias table

-- ============================================
-- 1. ALTER scan_resi_mjm TABLE
-- ============================================
ALTER TABLE scan_resi_mjm ADD COLUMN IF NOT EXISTS negara_ekspor TEXT;
ALTER TABLE scan_resi_mjm ADD COLUMN IF NOT EXISTS status_packing TEXT DEFAULT 'SCANNED';
ALTER TABLE scan_resi_mjm ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT FALSE;
ALTER TABLE scan_resi_mjm ADD COLUMN IF NOT EXISTS split_group_id TEXT;
ALTER TABLE scan_resi_mjm ADD COLUMN IF NOT EXISTS split_count INTEGER DEFAULT 1;
ALTER TABLE scan_resi_mjm ADD COLUMN IF NOT EXISTS original_product_name TEXT;
ALTER TABLE scan_resi_mjm ADD COLUMN IF NOT EXISTS original_price NUMERIC;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_status ON scan_resi_mjm(status_packing);
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_type ON scan_resi_mjm(type_toko);
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_resi ON scan_resi_mjm(resi);
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_split ON scan_resi_mjm(split_group_id) WHERE split_group_id IS NOT NULL;

-- Add constraint to prevent duplicate resi + part_number (Layer 3 duplicate prevention)
ALTER TABLE scan_resi_mjm ADD CONSTRAINT unique_resi_part_mjm UNIQUE (resi, part_number);

-- ============================================
-- 2. ALTER scan_resi_bjw TABLE
-- ============================================
ALTER TABLE scan_resi_bjw ADD COLUMN IF NOT EXISTS negara_ekspor TEXT;
ALTER TABLE scan_resi_bjw ADD COLUMN IF NOT EXISTS status_packing TEXT DEFAULT 'SCANNED';
ALTER TABLE scan_resi_bjw ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT FALSE;
ALTER TABLE scan_resi_bjw ADD COLUMN IF NOT EXISTS split_group_id TEXT;
ALTER TABLE scan_resi_bjw ADD COLUMN IF NOT EXISTS split_count INTEGER DEFAULT 1;
ALTER TABLE scan_resi_bjw ADD COLUMN IF NOT EXISTS original_product_name TEXT;
ALTER TABLE scan_resi_bjw ADD COLUMN IF NOT EXISTS original_price NUMERIC;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_status ON scan_resi_bjw(status_packing);
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_type ON scan_resi_bjw(type_toko);
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_resi ON scan_resi_bjw(resi);
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_split ON scan_resi_bjw(split_group_id) WHERE split_group_id IS NOT NULL;

-- Add constraint to prevent duplicate resi + part_number (Layer 3 duplicate prevention)
ALTER TABLE scan_resi_bjw ADD CONSTRAINT unique_resi_part_bjw UNIQUE (resi, part_number);

-- ============================================
-- 3. CREATE product_alias TABLE
-- ============================================
-- This table stores product name aliases from marketplace exports
-- for improved search functionality

CREATE TABLE IF NOT EXISTS product_alias (
  id SERIAL PRIMARY KEY,
  part_number TEXT NOT NULL,
  alias_name TEXT NOT NULL,
  source TEXT NOT NULL, -- SHOPEE, TIKTOK, MANUAL, EKSPOR, etc.
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_alias UNIQUE (part_number, alias_name)
);

-- Add indexes for faster search
CREATE INDEX IF NOT EXISTS idx_product_alias_part ON product_alias(part_number);
CREATE INDEX IF NOT EXISTS idx_product_alias_name ON product_alias(alias_name);
CREATE INDEX IF NOT EXISTS idx_product_alias_source ON product_alias(source);

-- Add comments for documentation
COMMENT ON TABLE product_alias IS 'Stores product name aliases from marketplace exports for enhanced search';
COMMENT ON COLUMN product_alias.part_number IS 'Reference to base_mjm/base_bjw part_number';
COMMENT ON COLUMN product_alias.alias_name IS 'Alternative product name from marketplace (e.g., Shopee product title)';
COMMENT ON COLUMN product_alias.source IS 'Origin of the alias: SHOPEE, TIKTOK, MANUAL, etc.';

-- ============================================
-- 4. UPDATE EXISTING DATA (if needed)
-- ============================================
-- Set default status for existing entries
UPDATE scan_resi_mjm SET status_packing = 'SCANNED' WHERE status_packing IS NULL;
UPDATE scan_resi_bjw SET status_packing = 'SCANNED' WHERE status_packing IS NULL;

-- Set default split values for existing entries
UPDATE scan_resi_mjm SET is_split = FALSE WHERE is_split IS NULL;
UPDATE scan_resi_bjw SET is_split = FALSE WHERE is_split IS NULL;

UPDATE scan_resi_mjm SET split_count = 1 WHERE split_count IS NULL;
UPDATE scan_resi_bjw SET split_count = 1 WHERE split_count IS NULL;

-- ============================================
-- 5. VERIFICATION QUERIES
-- ============================================
-- Run these to verify migration success:

-- Check scan_resi_mjm columns
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'scan_resi_mjm' 
-- AND column_name IN ('negara_ekspor', 'status_packing', 'is_split', 'split_group_id', 'split_count', 'original_product_name', 'original_price');

-- Check scan_resi_bjw columns
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'scan_resi_bjw' 
-- AND column_name IN ('negara_ekspor', 'status_packing', 'is_split', 'split_group_id', 'split_count', 'original_product_name', 'original_price');

-- Check product_alias table
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'product_alias';

-- Check indexes
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('scan_resi_mjm', 'scan_resi_bjw', 'product_alias');

-- Check constraints
-- SELECT conname, contype FROM pg_constraint WHERE conrelid = 'scan_resi_mjm'::regclass OR conrelid = 'scan_resi_bjw'::regclass;

-- ============================================
-- 6. ROLLBACK (if needed)
-- ============================================
-- CAUTION: Only run if you need to undo this migration

-- DROP TABLE IF EXISTS product_alias CASCADE;
-- 
-- ALTER TABLE scan_resi_mjm 
--   DROP COLUMN IF EXISTS negara_ekspor,
--   DROP COLUMN IF EXISTS status_packing,
--   DROP COLUMN IF EXISTS is_split,
--   DROP COLUMN IF EXISTS split_group_id,
--   DROP COLUMN IF EXISTS split_count,
--   DROP COLUMN IF EXISTS original_product_name,
--   DROP COLUMN IF EXISTS original_price,
--   DROP CONSTRAINT IF EXISTS unique_resi_part_mjm;
--
-- ALTER TABLE scan_resi_bjw 
--   DROP COLUMN IF EXISTS negara_ekspor,
--   DROP COLUMN IF EXISTS status_packing,
--   DROP COLUMN IF EXISTS is_split,
--   DROP COLUMN IF EXISTS split_group_id,
--   DROP COLUMN IF EXISTS split_count,
--   DROP COLUMN IF EXISTS original_product_name,
--   DROP COLUMN IF EXISTS original_price,
--   DROP CONSTRAINT IF EXISTS unique_resi_part_bjw;

-- ============================================
-- NOTES
-- ============================================
-- 1. The unique constraint on (resi, part_number) prevents duplicate scans at the database level
-- 2. status_packing values: 'SCANNED' (initial), 'MATCHED' (after import matching)
-- 3. type_toko values: 'TIKTOK', 'SHOPEE', 'KILAT', 'RESELLER', 'EKSPOR'
-- 4. For EKSPOR, negara_ekspor contains: 'PH', 'MY', 'SG', 'HK'
-- 5. For KILAT, customer is auto-set to pattern: 'KILAT [TOKO]'
-- 6. Split functionality tracks item sets (e.g., Engine Mounting HRV Set = 4 parts)
-- 7. Product aliases improve search by storing marketplace product names
