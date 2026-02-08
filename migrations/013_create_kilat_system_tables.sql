-- Migration 013: Create KILAT Pre-Ship System Tables
-- Sistem untuk tracking barang yang dikirim ke gudang e-commerce (Shopee) 
-- sebelum terjual (pre-ship/konsinyasi)
-- 
-- Workflow:
-- 1. Input KILAT: Barang dikirim ke gudang Shopee -> stock dikurangi
-- 2. Menunggu: Barang ada di gudang Shopee, menunggu laku
-- 3. Sinkron CSV: Saat ada penjualan dari CSV Shopee, match dengan KILAT pending
-- 4. Selesai: Barang laku, catat harga jual

-- ============================================================================
-- 1. KILAT PRESTOCK TABLES (Tracking barang pre-ship)
-- Data diambil dari scan_resi_mjm / scan_resi_bjw dengan ecommerce = 'KILAT'
-- ============================================================================

-- Table untuk MJM store
CREATE TABLE IF NOT EXISTS kilat_prestock_mjm (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference ke scan_resi (opsional, untuk KILAT yang diinput via scan resi)
  scan_resi_id UUID,
  
  -- Data pengiriman ke gudang Shopee
  tanggal_kirim TIMESTAMP DEFAULT NOW(),
  resi_kirim VARCHAR(100), -- Resi pengiriman ke gudang Shopee
  
  -- Data barang
  part_number VARCHAR(100) NOT NULL,
  nama_barang VARCHAR(500),
  brand VARCHAR(100),
  application VARCHAR(500),
  
  -- Quantity tracking
  qty_kirim INTEGER NOT NULL DEFAULT 1, -- Jumlah yang dikirim
  qty_terjual INTEGER DEFAULT 0,        -- Jumlah yang sudah terjual
  
  -- Status: MENUNGGU_TERJUAL | SEBAGIAN_TERJUAL | HABIS_TERJUAL | RETUR | EXPIRED
  status VARCHAR(30) DEFAULT 'MENUNGGU_TERJUAL',
  
  -- Metadata
  toko VARCHAR(10) DEFAULT 'MJM',
  sub_toko VARCHAR(50), -- LARIS/MJM/BJW
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Flag untuk mark apakah stock sudah dikurangi
  stock_reduced BOOLEAN DEFAULT FALSE,
  stock_reduced_at TIMESTAMP
);

-- Table untuk BJW store
CREATE TABLE IF NOT EXISTS kilat_prestock_bjw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_resi_id UUID,
  tanggal_kirim TIMESTAMP DEFAULT NOW(),
  resi_kirim VARCHAR(100),
  part_number VARCHAR(100) NOT NULL,
  nama_barang VARCHAR(500),
  brand VARCHAR(100),
  application VARCHAR(500),
  qty_kirim INTEGER NOT NULL DEFAULT 1,
  qty_terjual INTEGER DEFAULT 0,
  status VARCHAR(30) DEFAULT 'MENUNGGU_TERJUAL',
  toko VARCHAR(10) DEFAULT 'BJW',
  sub_toko VARCHAR(50),
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  stock_reduced BOOLEAN DEFAULT FALSE,
  stock_reduced_at TIMESTAMP
);

-- ============================================================================
-- 2. KILAT PENJUALAN TABLES (Detail penjualan dari KILAT)
-- Mencatat setiap penjualan yang di-match dari CSV Shopee
-- ============================================================================

-- Table untuk MJM store
CREATE TABLE IF NOT EXISTS kilat_penjualan_mjm (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference ke kilat_prestock
  kilat_id UUID REFERENCES kilat_prestock_mjm(id) ON DELETE SET NULL,
  
  -- Data penjualan dari CSV
  no_pesanan VARCHAR(100),
  resi_penjualan VARCHAR(100),
  customer VARCHAR(200),
  
  -- Data barang (snapshot saat jual)
  part_number VARCHAR(100),
  nama_barang VARCHAR(500),
  qty_jual INTEGER DEFAULT 1,
  harga_satuan DECIMAL(15,2) DEFAULT 0,
  harga_jual DECIMAL(15,2) DEFAULT 0, -- Total harga
  
  -- Tanggal
  tanggal_jual TIMESTAMP,
  
  -- Source: CSV | MANUAL
  source VARCHAR(20) DEFAULT 'CSV',
  ecommerce VARCHAR(50), -- Platform asal: SHOPEE, TIKTOK, etc
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table untuk BJW store
CREATE TABLE IF NOT EXISTS kilat_penjualan_bjw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kilat_id UUID REFERENCES kilat_prestock_bjw(id) ON DELETE SET NULL,
  no_pesanan VARCHAR(100),
  resi_penjualan VARCHAR(100),
  customer VARCHAR(200),
  part_number VARCHAR(100),
  nama_barang VARCHAR(500),
  qty_jual INTEGER DEFAULT 1,
  harga_satuan DECIMAL(15,2) DEFAULT 0,
  harga_jual DECIMAL(15,2) DEFAULT 0,
  tanggal_jual TIMESTAMP,
  source VARCHAR(20) DEFAULT 'CSV',
  ecommerce VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 3. VIEW UNTUK KILAT SUMMARY (Menghitung qty_sisa otomatis)
-- ============================================================================


-- View untuk KILAT yang masih pending (belum terjual)
CREATE OR REPLACE VIEW kilat_pending_mjm AS
SELECT 
  kp.*,
  (kp.qty_kirim - kp.qty_terjual) AS qty_sisa,
  EXTRACT(DAY FROM (NOW() - kp.tanggal_kirim)) AS aging_days
FROM kilat_prestock_mjm kp
WHERE kp.status = 'MENUNGGU_TERJUAL';

CREATE OR REPLACE VIEW kilat_pending_bjw AS
SELECT 
  kp.*,
  (kp.qty_kirim - kp.qty_terjual) AS qty_sisa,
  EXTRACT(DAY FROM (NOW() - kp.tanggal_kirim)) AS aging_days
FROM kilat_prestock_bjw kp
WHERE kp.status = 'MENUNGGU_TERJUAL';

-- View untuk KILAT yang sudah terjual (sebagian/habis)
CREATE OR REPLACE VIEW kilat_sold_mjm AS
SELECT 
  kp.*,
  (kp.qty_kirim - kp.qty_terjual) AS qty_sisa,
  EXTRACT(DAY FROM (NOW() - kp.tanggal_kirim)) AS aging_days
FROM kilat_prestock_mjm kp
WHERE kp.status IN ('SEBAGIAN_TERJUAL', 'HABIS_TERJUAL');

CREATE OR REPLACE VIEW kilat_sold_bjw AS
SELECT 
  kp.*,
  (kp.qty_kirim - kp.qty_terjual) AS qty_sisa,
  EXTRACT(DAY FROM (NOW() - kp.tanggal_kirim)) AS aging_days
FROM kilat_prestock_bjw kp
WHERE kp.status IN ('SEBAGIAN_TERJUAL', 'HABIS_TERJUAL');

-- ============================================================================
-- 4. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for kilat_prestock_mjm
CREATE INDEX IF NOT EXISTS idx_kilat_prestock_mjm_part_number ON kilat_prestock_mjm(part_number);
CREATE INDEX IF NOT EXISTS idx_kilat_prestock_mjm_status ON kilat_prestock_mjm(status);
CREATE INDEX IF NOT EXISTS idx_kilat_prestock_mjm_resi_kirim ON kilat_prestock_mjm(resi_kirim);
CREATE INDEX IF NOT EXISTS idx_kilat_prestock_mjm_created ON kilat_prestock_mjm(created_at);
CREATE INDEX IF NOT EXISTS idx_kilat_prestock_mjm_scan_resi ON kilat_prestock_mjm(scan_resi_id);

-- Indexes for kilat_prestock_bjw
CREATE INDEX IF NOT EXISTS idx_kilat_prestock_bjw_part_number ON kilat_prestock_bjw(part_number);
CREATE INDEX IF NOT EXISTS idx_kilat_prestock_bjw_status ON kilat_prestock_bjw(status);
CREATE INDEX IF NOT EXISTS idx_kilat_prestock_bjw_resi_kirim ON kilat_prestock_bjw(resi_kirim);
CREATE INDEX IF NOT EXISTS idx_kilat_prestock_bjw_created ON kilat_prestock_bjw(created_at);
CREATE INDEX IF NOT EXISTS idx_kilat_prestock_bjw_scan_resi ON kilat_prestock_bjw(scan_resi_id);

-- Indexes for kilat_penjualan_mjm
CREATE INDEX IF NOT EXISTS idx_kilat_penjualan_mjm_kilat_id ON kilat_penjualan_mjm(kilat_id);
CREATE INDEX IF NOT EXISTS idx_kilat_penjualan_mjm_no_pesanan ON kilat_penjualan_mjm(no_pesanan);
CREATE INDEX IF NOT EXISTS idx_kilat_penjualan_mjm_resi ON kilat_penjualan_mjm(resi_penjualan);
CREATE INDEX IF NOT EXISTS idx_kilat_penjualan_mjm_part_number ON kilat_penjualan_mjm(part_number);

-- Indexes for kilat_penjualan_bjw
CREATE INDEX IF NOT EXISTS idx_kilat_penjualan_bjw_kilat_id ON kilat_penjualan_bjw(kilat_id);
CREATE INDEX IF NOT EXISTS idx_kilat_penjualan_bjw_no_pesanan ON kilat_penjualan_bjw(no_pesanan);
CREATE INDEX IF NOT EXISTS idx_kilat_penjualan_bjw_resi ON kilat_penjualan_bjw(resi_penjualan);
CREATE INDEX IF NOT EXISTS idx_kilat_penjualan_bjw_part_number ON kilat_penjualan_bjw(part_number);

-- ============================================================================
-- 5. TRIGGER UNTUK AUTO UPDATE STATUS DAN TIMESTAMP
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_kilat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    -- Auto update status based on qty
    IF NEW.qty_terjual >= NEW.qty_kirim THEN
        NEW.status = 'HABIS_TERJUAL';
    ELSIF NEW.qty_terjual > 0 THEN
        NEW.status = 'SEBAGIAN_TERJUAL';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Triggers for kilat_prestock tables
DROP TRIGGER IF EXISTS update_kilat_prestock_mjm_updated_at ON kilat_prestock_mjm;
CREATE TRIGGER update_kilat_prestock_mjm_updated_at
    BEFORE UPDATE ON kilat_prestock_mjm
    FOR EACH ROW
    EXECUTE FUNCTION update_kilat_updated_at();

DROP TRIGGER IF EXISTS update_kilat_prestock_bjw_updated_at ON kilat_prestock_bjw;
CREATE TRIGGER update_kilat_prestock_bjw_updated_at
    BEFORE UPDATE ON kilat_prestock_bjw
    FOR EACH ROW
    EXECUTE FUNCTION update_kilat_updated_at();

-- ============================================================================
-- 6. FUNCTION UNTUK SINKRONISASI KILAT DENGAN PENJUALAN
-- ============================================================================

-- Function untuk match penjualan dengan KILAT pending
-- Dipanggil saat import CSV untuk auto-match
CREATE OR REPLACE FUNCTION match_kilat_sale(
  p_store VARCHAR,
  p_part_number VARCHAR,
  p_qty INTEGER,
  p_no_pesanan VARCHAR,
  p_resi VARCHAR,
  p_customer VARCHAR,
  p_harga DECIMAL,
  p_ecommerce VARCHAR
) RETURNS TABLE (
  matched BOOLEAN,
  kilat_id UUID,
  matched_qty INTEGER,
  remaining_qty INTEGER
) AS $$
DECLARE
  v_kilat_id UUID;
  v_qty_sisa INTEGER;
  v_matched_qty INTEGER;
BEGIN
  -- Cari KILAT pending dengan part_number yang sama
  IF p_store = 'mjm' THEN
    SELECT id, (qty_kirim - qty_terjual) INTO v_kilat_id, v_qty_sisa
    FROM kilat_prestock_mjm
    WHERE part_number = p_part_number
      AND status IN ('MENUNGGU_TERJUAL', 'SEBAGIAN_TERJUAL')
      AND (qty_kirim - qty_terjual) > 0
    ORDER BY tanggal_kirim ASC -- FIFO: yang paling lama dulu
    LIMIT 1;
    
    IF v_kilat_id IS NOT NULL THEN
      -- Hitung qty yang bisa di-match
      v_matched_qty := LEAST(p_qty, v_qty_sisa);
      
      -- Update qty_terjual
      UPDATE kilat_prestock_mjm
      SET qty_terjual = qty_terjual + v_matched_qty
      WHERE id = v_kilat_id;
      
      -- Insert ke kilat_penjualan
      INSERT INTO kilat_penjualan_mjm (
        kilat_id, no_pesanan, resi_penjualan, customer,
        part_number, qty_jual, harga_jual, tanggal_jual,
        source, ecommerce
      ) VALUES (
        v_kilat_id, p_no_pesanan, p_resi, p_customer,
        p_part_number, v_matched_qty, p_harga, NOW(),
        'CSV', p_ecommerce
      );
      
      RETURN QUERY SELECT TRUE, v_kilat_id, v_matched_qty, (p_qty - v_matched_qty);
      RETURN;
    END IF;
  ELSE
    -- BJW store
    SELECT id, (qty_kirim - qty_terjual) INTO v_kilat_id, v_qty_sisa
    FROM kilat_prestock_bjw
    WHERE part_number = p_part_number
      AND status IN ('MENUNGGU_TERJUAL', 'SEBAGIAN_TERJUAL')
      AND (qty_kirim - qty_terjual) > 0
    ORDER BY tanggal_kirim ASC
    LIMIT 1;
    
    IF v_kilat_id IS NOT NULL THEN
      v_matched_qty := LEAST(p_qty, v_qty_sisa);
      
      UPDATE kilat_prestock_bjw
      SET qty_terjual = qty_terjual + v_matched_qty
      WHERE id = v_kilat_id;
      
      INSERT INTO kilat_penjualan_bjw (
        kilat_id, no_pesanan, resi_penjualan, customer,
        part_number, qty_jual, harga_jual, tanggal_jual,
        source, ecommerce
      ) VALUES (
        v_kilat_id, p_no_pesanan, p_resi, p_customer,
        p_part_number, v_matched_qty, p_harga, NOW(),
        'CSV', p_ecommerce
      );
      
      RETURN QUERY SELECT TRUE, v_kilat_id, v_matched_qty, (p_qty - v_matched_qty);
      RETURN;
    END IF;
  END IF;
  
  -- Tidak ada match
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, p_qty;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE kilat_prestock_mjm ENABLE ROW LEVEL SECURITY;
ALTER TABLE kilat_prestock_bjw ENABLE ROW LEVEL SECURITY;
ALTER TABLE kilat_penjualan_mjm ENABLE ROW LEVEL SECURITY;
ALTER TABLE kilat_penjualan_bjw ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "Allow all for authenticated" ON kilat_prestock_mjm FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON kilat_prestock_bjw FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON kilat_penjualan_mjm FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON kilat_penjualan_bjw FOR ALL USING (true);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_name IN (
        'kilat_prestock_mjm',
        'kilat_prestock_bjw',
        'kilat_penjualan_mjm',
        'kilat_penjualan_bjw'
    );
    
    IF table_count = 4 THEN
        RAISE NOTICE '✓ Migration 013 completed successfully - All 4 KILAT tables created';
    ELSE
        RAISE WARNING '⚠ Migration 013 completed with warnings - Only % out of 4 tables created', table_count;
    END IF;
END $$;
