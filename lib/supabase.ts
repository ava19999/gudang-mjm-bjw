// FILE: src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://doyyghsijggiibkcktuq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXlnaHNpamdnaWlia2NrdHVxIiwicm9sZSIsImlhdCI6MTc2NTI1OTc1NiwiZXhwIjoyMDgwODM1NzU2fQ.HMq3LhppPRiHenYYZPtOMIX9BKkyqQUqCoCdAjIN3bo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
