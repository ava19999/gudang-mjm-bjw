-- Ensure inv_tagihan has the fields we rely on for printed flags
ALTER TABLE IF EXISTS inv_tagihan
  ADD COLUMN IF NOT EXISTS customer TEXT,
  ADD COLUMN IF NOT EXISTS tempo VARCHAR(50),
  ADD COLUMN IF NOT EXISTS jatuh_tempo_bulan CHAR(7);

-- Normalize existing data: fill customer with toko if customer is null
UPDATE inv_tagihan
SET customer = COALESCE(customer, toko)
WHERE customer IS NULL;

-- Indexes to speed up lookups
CREATE INDEX IF NOT EXISTS idx_inv_tagihan_customer ON inv_tagihan(customer);
CREATE INDEX IF NOT EXISTS idx_inv_tagihan_month ON inv_tagihan(jatuh_tempo_bulan);
CREATE INDEX IF NOT EXISTS idx_inv_tagihan_status ON inv_tagihan(status);

COMMENT ON TABLE inv_tagihan IS 'Stores printed invoice receipts per customer/store/month.';
