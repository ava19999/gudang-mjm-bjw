-- Migration: Fix Empty Part Numbers
-- Description: Update empty part_number values in base tables to ensure proper relationships
-- Date: 2026-01-15

-- ============================================
-- STEP 1: Update empty part_numbers in base_mjm
-- ============================================

-- Generate unique part numbers for rows with empty or null part_number
-- Format: AUTO-MJM-{uuid} - uses UUID for consistency across all schemas
UPDATE base_mjm
SET part_number = CONCAT('AUTO-MJM-', gen_random_uuid()::text)
WHERE part_number IS NULL 
   OR part_number = '' 
   OR TRIM(part_number) = '';

-- ============================================
-- STEP 2: Update empty part_numbers in base_bjw
-- ============================================

-- Generate unique part numbers for rows with empty or null part_number
-- Format: AUTO-BJW-{uuid}
UPDATE base_bjw
SET part_number = CONCAT('AUTO-BJW-', gen_random_uuid()::text)
WHERE part_number IS NULL 
   OR part_number = '' 
   OR TRIM(part_number) = '';

-- ============================================
-- STEP 3: Update empty part_numbers in base (fallback table)
-- ============================================

-- Generate unique part numbers for legacy base table
-- Format: AUTO-BASE-{uuid}
UPDATE base
SET part_number = CONCAT('AUTO-BASE-', gen_random_uuid()::text)
WHERE part_number IS NULL 
   OR part_number = '' 
   OR TRIM(part_number) = '';

-- ============================================
-- STEP 4: Create indexes for better performance
-- ============================================

-- Create indexes on part_number for faster joins
CREATE INDEX IF NOT EXISTS idx_base_mjm_part_number ON base_mjm(part_number);
CREATE INDEX IF NOT EXISTS idx_base_bjw_part_number ON base_bjw(part_number);
CREATE INDEX IF NOT EXISTS idx_base_part_number ON base(part_number);
CREATE INDEX IF NOT EXISTS idx_foto_part_number ON foto(part_number);
CREATE INDEX IF NOT EXISTS idx_list_harga_jual_part_number ON list_harga_jual(part_number);

-- Create composite index for quantity-based queries (low stock alerts)
CREATE INDEX IF NOT EXISTS idx_base_mjm_quantity ON base_mjm(quantity) WHERE quantity IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_base_bjw_quantity ON base_bjw(quantity) WHERE quantity IS NOT NULL;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check for any remaining empty part_numbers in base_mjm
-- SELECT COUNT(*) as empty_part_numbers_mjm 
-- FROM base_mjm 
-- WHERE part_number IS NULL OR part_number = '' OR TRIM(part_number) = '';

-- Check for any remaining empty part_numbers in base_bjw
-- SELECT COUNT(*) as empty_part_numbers_bjw 
-- FROM base_bjw 
-- WHERE part_number IS NULL OR part_number = '' OR TRIM(part_number) = '';

-- Show sample of updated records
-- SELECT part_number, name, quantity FROM base_mjm WHERE part_number LIKE 'AUTO-%' LIMIT 5;
-- SELECT part_number, name, quantity FROM base_bjw WHERE part_number LIKE 'AUTO-%' LIMIT 5;
