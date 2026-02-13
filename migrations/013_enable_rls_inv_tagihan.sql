-- Enable RLS and open policy for inv_tagihan so app inserts work
ALTER TABLE IF EXISTS inv_tagihan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on inv_tagihan" ON inv_tagihan;
CREATE POLICY "Allow all operations on inv_tagihan" ON inv_tagihan
  FOR ALL
  USING (true)
  WITH CHECK (true);
