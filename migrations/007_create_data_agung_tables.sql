-- ============================================================================
-- Migration: 007_create_data_agung_tables.sql
-- Description: Create tables for Data Agung feature (Online Products, Produk Kosong, Table Masuk)
-- Date: 2026-02-02
-- ============================================================================

-- ============================================================================
-- TABLE: data_agung_online_mjm & data_agung_online_bjw
-- Description: Produk yang di-listing online
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_agung_online_mjm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_number VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    brand VARCHAR(100),
    quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_agung_online_bjw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_number VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    brand VARCHAR(100),
    quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookup by part_number
CREATE INDEX IF NOT EXISTS idx_data_agung_online_mjm_part_number ON data_agung_online_mjm(part_number);
CREATE INDEX IF NOT EXISTS idx_data_agung_online_bjw_part_number ON data_agung_online_bjw(part_number);

-- ============================================================================
-- TABLE: data_agung_kosong_mjm & data_agung_kosong_bjw
-- Description: Produk kosong yang di-off dari online
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_agung_kosong_mjm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_number VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    brand VARCHAR(100),
    quantity INTEGER DEFAULT 0,
    is_online_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_agung_kosong_bjw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_number VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    brand VARCHAR(100),
    quantity INTEGER DEFAULT 0,
    is_online_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookup by part_number
CREATE INDEX IF NOT EXISTS idx_data_agung_kosong_mjm_part_number ON data_agung_kosong_mjm(part_number);
CREATE INDEX IF NOT EXISTS idx_data_agung_kosong_bjw_part_number ON data_agung_kosong_bjw(part_number);

-- ============================================================================
-- TABLE: data_agung_masuk_mjm & data_agung_masuk_bjw
-- Description: Produk dengan qty > 0 yang auto-moved untuk tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_agung_masuk_mjm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_number VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    brand VARCHAR(100),
    quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_agung_masuk_bjw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_number VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    brand VARCHAR(100),
    quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookup by part_number
CREATE INDEX IF NOT EXISTS idx_data_agung_masuk_mjm_part_number ON data_agung_masuk_mjm(part_number);
CREATE INDEX IF NOT EXISTS idx_data_agung_masuk_bjw_part_number ON data_agung_masuk_bjw(part_number);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Enable for all tables
-- ============================================================================

ALTER TABLE data_agung_online_mjm ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_agung_online_bjw ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_agung_kosong_mjm ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_agung_kosong_bjw ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_agung_masuk_mjm ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_agung_masuk_bjw ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users
CREATE POLICY "Allow all for authenticated users" ON data_agung_online_mjm FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON data_agung_online_bjw FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON data_agung_kosong_mjm FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON data_agung_kosong_bjw FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON data_agung_masuk_mjm FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON data_agung_masuk_bjw FOR ALL USING (true);

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_data_agung_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for each table
CREATE TRIGGER trigger_update_data_agung_online_mjm
    BEFORE UPDATE ON data_agung_online_mjm
    FOR EACH ROW
    EXECUTE FUNCTION update_data_agung_updated_at();

CREATE TRIGGER trigger_update_data_agung_online_bjw
    BEFORE UPDATE ON data_agung_online_bjw
    FOR EACH ROW
    EXECUTE FUNCTION update_data_agung_updated_at();

CREATE TRIGGER trigger_update_data_agung_kosong_mjm
    BEFORE UPDATE ON data_agung_kosong_mjm
    FOR EACH ROW
    EXECUTE FUNCTION update_data_agung_updated_at();

CREATE TRIGGER trigger_update_data_agung_kosong_bjw
    BEFORE UPDATE ON data_agung_kosong_bjw
    FOR EACH ROW
    EXECUTE FUNCTION update_data_agung_updated_at();

CREATE TRIGGER trigger_update_data_agung_masuk_mjm
    BEFORE UPDATE ON data_agung_masuk_mjm
    FOR EACH ROW
    EXECUTE FUNCTION update_data_agung_updated_at();

CREATE TRIGGER trigger_update_data_agung_masuk_bjw
    BEFORE UPDATE ON data_agung_masuk_bjw
    FOR EACH ROW
    EXECUTE FUNCTION update_data_agung_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE data_agung_online_mjm IS 'Produk MJM yang di-listing online untuk Data Agung';
COMMENT ON TABLE data_agung_online_bjw IS 'Produk BJW yang di-listing online untuk Data Agung';
COMMENT ON TABLE data_agung_kosong_mjm IS 'Produk MJM kosong yang di-off dari online';
COMMENT ON TABLE data_agung_kosong_bjw IS 'Produk BJW kosong yang di-off dari online';
COMMENT ON TABLE data_agung_masuk_mjm IS 'Produk MJM dengan qty > 0 yang masuk (auto-moved)';
COMMENT ON TABLE data_agung_masuk_bjw IS 'Produk BJW dengan qty > 0 yang masuk (auto-moved)';
