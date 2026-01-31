-- Migration: Create importir_pembayaran table for tracking importer payments
-- This table stores payment records for tempo importers/suppliers

CREATE TABLE IF NOT EXISTS importir_pembayaran (
    id SERIAL PRIMARY KEY,
    customer VARCHAR(255) NOT NULL,
    tempo VARCHAR(50),
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    jumlah DECIMAL(15, 2) NOT NULL DEFAULT 0,
    keterangan TEXT,
    store VARCHAR(10) DEFAULT 'all',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for manual tagihan (additional invoices not from barang_masuk)
CREATE TABLE IF NOT EXISTS importir_tagihan (
    id SERIAL PRIMARY KEY,
    customer VARCHAR(255) NOT NULL,
    tempo VARCHAR(50),
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    jumlah DECIMAL(15, 2) NOT NULL DEFAULT 0,
    keterangan TEXT,
    store VARCHAR(10) DEFAULT 'all',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups - pembayaran
CREATE INDEX IF NOT EXISTS idx_importir_pembayaran_customer ON importir_pembayaran(customer);
CREATE INDEX IF NOT EXISTS idx_importir_pembayaran_tanggal ON importir_pembayaran(tanggal);
CREATE INDEX IF NOT EXISTS idx_importir_pembayaran_tempo ON importir_pembayaran(tempo);

-- Create index for faster lookups - tagihan
CREATE INDEX IF NOT EXISTS idx_importir_tagihan_customer ON importir_tagihan(customer);
CREATE INDEX IF NOT EXISTS idx_importir_tagihan_tanggal ON importir_tagihan(tanggal);
CREATE INDEX IF NOT EXISTS idx_importir_tagihan_tempo ON importir_tagihan(tempo);

-- Add RLS policies for pembayaran
ALTER TABLE importir_pembayaran ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to select importir_pembayaran"
    ON importir_pembayaran FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert importir_pembayaran"
    ON importir_pembayaran FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update importir_pembayaran"
    ON importir_pembayaran FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to delete importir_pembayaran"
    ON importir_pembayaran FOR DELETE
    TO authenticated
    USING (true);

-- RLS policies for anon users (pembayaran)
CREATE POLICY "Allow anon users to select importir_pembayaran"
    ON importir_pembayaran FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "Allow anon users to insert importir_pembayaran"
    ON importir_pembayaran FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "Allow anon users to update importir_pembayaran"
    ON importir_pembayaran FOR UPDATE
    TO anon
    USING (true);

CREATE POLICY "Allow anon users to delete importir_pembayaran"
    ON importir_pembayaran FOR DELETE
    TO anon
    USING (true);

-- Add RLS policies for tagihan
ALTER TABLE importir_tagihan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to select importir_tagihan"
    ON importir_tagihan FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert importir_tagihan"
    ON importir_tagihan FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update importir_tagihan"
    ON importir_tagihan FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to delete importir_tagihan"
    ON importir_tagihan FOR DELETE
    TO authenticated
    USING (true);

-- RLS policies for anon users (tagihan)
CREATE POLICY "Allow anon users to select importir_tagihan"
    ON importir_tagihan FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "Allow anon users to insert importir_tagihan"
    ON importir_tagihan FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "Allow anon users to update importir_tagihan"
    ON importir_tagihan FOR UPDATE
    TO anon
    USING (true);

CREATE POLICY "Allow anon users to delete importir_tagihan"
    ON importir_tagihan FOR DELETE
    TO anon
    USING (true);

-- Grant permissions for pembayaran
GRANT ALL ON importir_pembayaran TO authenticated;
GRANT ALL ON importir_pembayaran TO anon;
GRANT USAGE, SELECT ON SEQUENCE importir_pembayaran_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE importir_pembayaran_id_seq TO anon;

-- Grant permissions for tagihan
GRANT ALL ON importir_tagihan TO authenticated;
GRANT ALL ON importir_tagihan TO anon;
GRANT USAGE, SELECT ON SEQUENCE importir_tagihan_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE importir_tagihan_id_seq TO anon;

-- Add comments for documentation - pembayaran
COMMENT ON TABLE importir_pembayaran IS 'Stores payment records for tempo importers/suppliers';
COMMENT ON COLUMN importir_pembayaran.customer IS 'Importer/supplier name';
COMMENT ON COLUMN importir_pembayaran.tempo IS 'Tempo type (1 BLN, 2 BLN, 3 BLN, etc)';
COMMENT ON COLUMN importir_pembayaran.tanggal IS 'Payment date';
COMMENT ON COLUMN importir_pembayaran.jumlah IS 'Payment amount';
COMMENT ON COLUMN importir_pembayaran.keterangan IS 'Payment notes/description';
COMMENT ON COLUMN importir_pembayaran.store IS 'Store filter (mjm, bjw, or all)';

-- Add comments for documentation - tagihan
COMMENT ON TABLE importir_tagihan IS 'Stores manual tagihan/invoice records (additional to barang_masuk)';
COMMENT ON COLUMN importir_tagihan.customer IS 'Importer/supplier name';
COMMENT ON COLUMN importir_tagihan.tempo IS 'Tempo type (1 BLN, 2 BLN, 3 BLN, etc)';
COMMENT ON COLUMN importir_tagihan.tanggal IS 'Invoice date';
COMMENT ON COLUMN importir_tagihan.jumlah IS 'Invoice amount';
COMMENT ON COLUMN importir_tagihan.keterangan IS 'Invoice notes/description';
COMMENT ON COLUMN importir_tagihan.store IS 'Store filter (mjm, bjw, or all)';
