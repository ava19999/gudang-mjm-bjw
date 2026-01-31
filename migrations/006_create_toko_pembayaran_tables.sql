-- Migration: Create Toko Payment and Tagihan Tables for Tagihan Toko Feature
-- This tracks payments from stores (toko) for tempo sales (barang_keluar)

-- Create toko_pembayaran table (payments from stores)
CREATE TABLE IF NOT EXISTS toko_pembayaran (
  id SERIAL PRIMARY KEY,
  customer VARCHAR(255) NOT NULL,
  tempo VARCHAR(50),
  tanggal DATE NOT NULL,
  jumlah DECIMAL(15, 2) NOT NULL DEFAULT 0,
  keterangan TEXT,
  store VARCHAR(10) DEFAULT 'all',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create toko_tagihan table (manual tagihan for stores)
CREATE TABLE IF NOT EXISTS toko_tagihan (
  id SERIAL PRIMARY KEY,
  customer VARCHAR(255) NOT NULL,
  tempo VARCHAR(50),
  tanggal DATE NOT NULL,
  jumlah DECIMAL(15, 2) NOT NULL DEFAULT 0,
  keterangan TEXT,
  store VARCHAR(10) DEFAULT 'all',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_toko_pembayaran_customer ON toko_pembayaran(customer);
CREATE INDEX IF NOT EXISTS idx_toko_pembayaran_tanggal ON toko_pembayaran(tanggal);
CREATE INDEX IF NOT EXISTS idx_toko_pembayaran_tempo ON toko_pembayaran(tempo);

CREATE INDEX IF NOT EXISTS idx_toko_tagihan_customer ON toko_tagihan(customer);
CREATE INDEX IF NOT EXISTS idx_toko_tagihan_tanggal ON toko_tagihan(tanggal);
CREATE INDEX IF NOT EXISTS idx_toko_tagihan_tempo ON toko_tagihan(tempo);

-- Enable Row Level Security
ALTER TABLE toko_pembayaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE toko_tagihan ENABLE ROW LEVEL SECURITY;

-- Create policies for toko_pembayaran
DROP POLICY IF EXISTS "Allow all operations on toko_pembayaran" ON toko_pembayaran;
CREATE POLICY "Allow all operations on toko_pembayaran" ON toko_pembayaran
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create policies for toko_tagihan
DROP POLICY IF EXISTS "Allow all operations on toko_tagihan" ON toko_tagihan;
CREATE POLICY "Allow all operations on toko_tagihan" ON toko_tagihan
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_toko_pembayaran_updated_at ON toko_pembayaran;
CREATE TRIGGER update_toko_pembayaran_updated_at
  BEFORE UPDATE ON toko_pembayaran
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_toko_tagihan_updated_at ON toko_tagihan;
CREATE TRIGGER update_toko_tagihan_updated_at
  BEFORE UPDATE ON toko_tagihan
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE toko_pembayaran IS 'Stores payment records from customer stores (toko) for tempo sales';
COMMENT ON TABLE toko_tagihan IS 'Stores manual tagihan records for customer stores (toko)';
