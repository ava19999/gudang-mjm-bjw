-- Migration 003: Create 3-Stage Receipt Scanning System Tables
-- This migration creates the necessary tables for the 3-stage receipt scanning workflow
-- with support for multiple e-commerce platforms (Shopee, TikTok, Kilat, Reseller, Ekspor)

-- ============================================================================
-- 1. RESI SCAN STAGE TABLES (MJM & BJW)
-- ============================================================================

-- Table for MJM store
CREATE TABLE IF NOT EXISTS resi_scan_stage_mjm (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal TIMESTAMP DEFAULT NOW(),
  resi VARCHAR(100) NOT NULL UNIQUE,
  ecommerce VARCHAR(50), -- TIKTOK/SHOPEE/KILAT/RESELLER/EKSPOR
  sub_toko VARCHAR(50), -- LARIS/MJM/BJW
  negara_ekspor VARCHAR(10), -- PH/MY/SG/HK (untuk EKSPOR)
  
  -- Stage 1 (Orang ke-1: Scanner Gudang)
  stage1_scanned BOOLEAN DEFAULT FALSE,
  stage1_scanned_at TIMESTAMP,
  stage1_scanned_by VARCHAR(100),
  
  -- Stage 2 (Orang ke-2: Packing Verification)
  stage2_verified BOOLEAN DEFAULT FALSE,
  stage2_verified_at TIMESTAMP,
  stage2_verified_by VARCHAR(100),
  
  -- Stage 3 (Orang ke-3: Data Entry/Finalisasi)
  stage3_completed BOOLEAN DEFAULT FALSE,
  stage3_completed_at TIMESTAMP,
  customer VARCHAR(255),
  order_id VARCHAR(100),
  
  status VARCHAR(50) DEFAULT 'pending', -- pending/stage1/stage2/completed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table for BJW store
CREATE TABLE IF NOT EXISTS resi_scan_stage_bjw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal TIMESTAMP DEFAULT NOW(),
  resi VARCHAR(100) NOT NULL UNIQUE,
  ecommerce VARCHAR(50),
  sub_toko VARCHAR(50),
  negara_ekspor VARCHAR(10),
  
  stage1_scanned BOOLEAN DEFAULT FALSE,
  stage1_scanned_at TIMESTAMP,
  stage1_scanned_by VARCHAR(100),
  
  stage2_verified BOOLEAN DEFAULT FALSE,
  stage2_verified_at TIMESTAMP,
  stage2_verified_by VARCHAR(100),
  
  stage3_completed BOOLEAN DEFAULT FALSE,
  stage3_completed_at TIMESTAMP,
  customer VARCHAR(255),
  order_id VARCHAR(100),
  
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 2. RESI ITEMS TABLES (Detail per resi)
-- ============================================================================

-- Items for MJM store
CREATE TABLE IF NOT EXISTS resi_items_mjm (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resi_id UUID REFERENCES resi_scan_stage_mjm(id) ON DELETE CASCADE,
  part_number VARCHAR(100),
  nama_barang VARCHAR(255),
  brand VARCHAR(100),
  application VARCHAR(255),
  qty_keluar INTEGER,
  harga_total DECIMAL(15,2),
  harga_satuan DECIMAL(15,2),
  is_split_item BOOLEAN DEFAULT FALSE, -- untuk item SET kiri-kanan
  split_count INTEGER DEFAULT 1, -- dibagi berapa
  sku_from_csv VARCHAR(100),
  manual_input BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Items for BJW store
CREATE TABLE IF NOT EXISTS resi_items_bjw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resi_id UUID REFERENCES resi_scan_stage_bjw(id) ON DELETE CASCADE,
  part_number VARCHAR(100),
  nama_barang VARCHAR(255),
  brand VARCHAR(100),
  application VARCHAR(255),
  qty_keluar INTEGER,
  harga_total DECIMAL(15,2),
  harga_satuan DECIMAL(15,2),
  is_split_item BOOLEAN DEFAULT FALSE,
  split_count INTEGER DEFAULT 1,
  sku_from_csv VARCHAR(100),
  manual_input BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 3. PART SUBSTITUSI TABLE (Part number aliases)
-- ============================================================================

CREATE TABLE IF NOT EXISTS part_substitusi (
  id SERIAL PRIMARY KEY,
  part_number_utama VARCHAR(100) NOT NULL,
  part_number_alias VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(part_number_alias)
);

-- ============================================================================
-- 4. RESELLER MASTER TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS reseller_master (
  id SERIAL PRIMARY KEY,
  nama_reseller VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 5. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for resi_scan_stage_mjm
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_mjm_resi ON resi_scan_stage_mjm(resi);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_mjm_status ON resi_scan_stage_mjm(status);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_mjm_ecommerce ON resi_scan_stage_mjm(ecommerce);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_mjm_stage1 ON resi_scan_stage_mjm(stage1_scanned);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_mjm_stage2 ON resi_scan_stage_mjm(stage2_verified);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_mjm_stage3 ON resi_scan_stage_mjm(stage3_completed);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_mjm_created ON resi_scan_stage_mjm(created_at);

-- Indexes for resi_scan_stage_bjw
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_bjw_resi ON resi_scan_stage_bjw(resi);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_bjw_status ON resi_scan_stage_bjw(status);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_bjw_ecommerce ON resi_scan_stage_bjw(ecommerce);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_bjw_stage1 ON resi_scan_stage_bjw(stage1_scanned);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_bjw_stage2 ON resi_scan_stage_bjw(stage2_verified);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_bjw_stage3 ON resi_scan_stage_bjw(stage3_completed);
CREATE INDEX IF NOT EXISTS idx_resi_scan_stage_bjw_created ON resi_scan_stage_bjw(created_at);

-- Indexes for resi_items_mjm
CREATE INDEX IF NOT EXISTS idx_resi_items_mjm_resi_id ON resi_items_mjm(resi_id);
CREATE INDEX IF NOT EXISTS idx_resi_items_mjm_part_number ON resi_items_mjm(part_number);

-- Indexes for resi_items_bjw
CREATE INDEX IF NOT EXISTS idx_resi_items_bjw_resi_id ON resi_items_bjw(resi_id);
CREATE INDEX IF NOT EXISTS idx_resi_items_bjw_part_number ON resi_items_bjw(part_number);

-- Indexes for part_substitusi
CREATE INDEX IF NOT EXISTS idx_part_substitusi_utama ON part_substitusi(part_number_utama);
CREATE INDEX IF NOT EXISTS idx_part_substitusi_alias ON part_substitusi(part_number_alias);

-- ============================================================================
-- 6. SAMPLE DATA FOR TESTING
-- ============================================================================

-- Insert sample resellers
INSERT INTO reseller_master (nama_reseller) VALUES 
  ('Anan'),
  ('Agung'),
  ('Reseller Lainnya')
ON CONFLICT (nama_reseller) DO NOTHING;

-- Insert sample part substitutions
INSERT INTO part_substitusi (part_number_utama, part_number_alias) VALUES 
  ('91214-PNA', '91214-RB0')
ON CONFLICT (part_number_alias) DO NOTHING;

-- ============================================================================
-- 7. FUNCTIONS FOR AUTOMATIC TIMESTAMP UPDATES
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for resi_scan_stage tables
DROP TRIGGER IF EXISTS update_resi_scan_stage_mjm_updated_at ON resi_scan_stage_mjm;
CREATE TRIGGER update_resi_scan_stage_mjm_updated_at
    BEFORE UPDATE ON resi_scan_stage_mjm
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_resi_scan_stage_bjw_updated_at ON resi_scan_stage_bjw;
CREATE TRIGGER update_resi_scan_stage_bjw_updated_at
    BEFORE UPDATE ON resi_scan_stage_bjw
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables were created
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_name IN (
        'resi_scan_stage_mjm',
        'resi_scan_stage_bjw',
        'resi_items_mjm',
        'resi_items_bjw',
        'part_substitusi',
        'reseller_master'
    );
    
    IF table_count = 6 THEN
        RAISE NOTICE '✓ Migration 003 completed successfully - All 6 tables created';
    ELSE
        RAISE WARNING '⚠ Migration 003 completed with warnings - Only % out of 6 tables created', table_count;
    END IF;
END $$;
