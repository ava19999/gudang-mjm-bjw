-- Migration: Add Enhanced Receipt Scanning Features
-- Date: 2026-01-17
-- Description: Adds support for sub-stores, countries (for export), split items, and product aliases

-- ================================================================
-- 1. ADD COLUMNS TO scan_resi_mjm
-- ================================================================

-- Add sub_toko column for TIKTOK/SHOPEE/KILAT sub-stores
ALTER TABLE scan_resi_mjm 
ADD COLUMN IF NOT EXISTS sub_toko TEXT;

-- Add negara column for EKSPOR country tracking (PH, MY, SG, HK)
ALTER TABLE scan_resi_mjm 
ADD COLUMN IF NOT EXISTS negara TEXT;

-- Add split_item column to track split items (0=single, 1=left, 2=right, etc.)
ALTER TABLE scan_resi_mjm 
ADD COLUMN IF NOT EXISTS split_item INTEGER DEFAULT 0;

-- Add parent_resi column to reference original resi for split items
ALTER TABLE scan_resi_mjm 
ADD COLUMN IF NOT EXISTS parent_resi TEXT;

-- Add comment for clarity
COMMENT ON COLUMN scan_resi_mjm.sub_toko IS 'Sub-store for TIKTOK/SHOPEE/KILAT: LARIS, MJM, or BJW';
COMMENT ON COLUMN scan_resi_mjm.negara IS 'Country for EKSPOR: PH, MY, SG, or HK';
COMMENT ON COLUMN scan_resi_mjm.split_item IS 'Split item number: 0=single/original, 1=first split, 2=second split, etc.';
COMMENT ON COLUMN scan_resi_mjm.parent_resi IS 'Original resi number if this is a split item';

-- ================================================================
-- 2. ADD COLUMNS TO scan_resi_bjw
-- ================================================================

-- Add sub_toko column for TIKTOK/SHOPEE/KILAT sub-stores
ALTER TABLE scan_resi_bjw 
ADD COLUMN IF NOT EXISTS sub_toko TEXT;

-- Add negara column for EKSPOR country tracking (PH, MY, SG, HK)
ALTER TABLE scan_resi_bjw 
ADD COLUMN IF NOT EXISTS negara TEXT;

-- Add split_item column to track split items (0=single, 1=left, 2=right, etc.)
ALTER TABLE scan_resi_bjw 
ADD COLUMN IF NOT EXISTS split_item INTEGER DEFAULT 0;

-- Add parent_resi column to reference original resi for split items
ALTER TABLE scan_resi_bjw 
ADD COLUMN IF NOT EXISTS parent_resi TEXT;

-- Add comment for clarity
COMMENT ON COLUMN scan_resi_bjw.sub_toko IS 'Sub-store for TIKTOK/SHOPEE/KILAT: LARIS, MJM, or BJW';
COMMENT ON COLUMN scan_resi_bjw.negara IS 'Country for EKSPOR: PH, MY, SG, or HK';
COMMENT ON COLUMN scan_resi_bjw.split_item IS 'Split item number: 0=single/original, 1=first split, 2=second split, etc.';
COMMENT ON COLUMN scan_resi_bjw.parent_resi IS 'Original resi number if this is a split item';

-- ================================================================
-- 3. CREATE product_alias TABLE
-- ================================================================

-- Create table for part number aliases (e.g., 91214-pna vs 91214-rb0)
CREATE TABLE IF NOT EXISTS product_alias (
    id SERIAL PRIMARY KEY,
    part_number TEXT NOT NULL, -- The canonical/main part number
    alias TEXT NOT NULL UNIQUE, -- The alternative part number
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE product_alias IS 'Maps alternative part numbers to canonical part numbers';
COMMENT ON COLUMN product_alias.part_number IS 'The canonical/main part number (from base_mjm/base_bjw)';
COMMENT ON COLUMN product_alias.alias IS 'The alternative/alias part number';

-- Create index on alias for faster lookups
CREATE INDEX IF NOT EXISTS idx_product_alias_alias ON product_alias(alias);
CREATE INDEX IF NOT EXISTS idx_product_alias_part_number ON product_alias(part_number);

-- ================================================================
-- 4. ADD INDEXES FOR PERFORMANCE
-- ================================================================

-- Add indexes on new columns for better query performance
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_sub_toko ON scan_resi_mjm(sub_toko) WHERE sub_toko IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_negara ON scan_resi_mjm(negara) WHERE negara IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_parent_resi ON scan_resi_mjm(parent_resi) WHERE parent_resi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_split_item ON scan_resi_mjm(split_item) WHERE split_item > 0;

CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_sub_toko ON scan_resi_bjw(sub_toko) WHERE sub_toko IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_negara ON scan_resi_bjw(negara) WHERE negara IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_parent_resi ON scan_resi_bjw(parent_resi) WHERE parent_resi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_split_item ON scan_resi_bjw(split_item) WHERE split_item > 0;

-- ================================================================
-- 5. SAMPLE DATA FOR product_alias (OPTIONAL)
-- ================================================================

-- Add some example aliases (uncomment to use)
-- INSERT INTO product_alias (part_number, alias) VALUES 
--     ('91214-RB0', '91214-PNA'),
--     ('91214-RB0', '91214-RNA'),
--     ('52300-S10', '52300-S5A')
-- ON CONFLICT (alias) DO NOTHING;

-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================

-- Verify scan_resi_mjm columns
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'scan_resi_mjm' 
-- AND column_name IN ('sub_toko', 'negara', 'split_item', 'parent_resi');

-- Verify scan_resi_bjw columns
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'scan_resi_bjw' 
-- AND column_name IN ('sub_toko', 'negara', 'split_item', 'parent_resi');

-- Check product_alias table
-- SELECT * FROM product_alias LIMIT 10;
