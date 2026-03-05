// FILE: services/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const egressCacheBucket =
  (import.meta.env.VITE_SUPABASE_EGRESS_CACHE_BUCKET || 'egress-cache').trim() || 'egress-cache';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ ERROR: Supabase URL atau Anon Key belum diset di file .env');
  console.error('📝 Silakan buat file .env di root folder dengan content:');
  console.error('   VITE_SUPABASE_URL=your_supabase_url');
  console.error('   VITE_SUPABASE_ANON_KEY=your_anon_key');
  throw new Error('Supabase configuration missing. Please check .env file.');
}

const supabaseEdgeCacheFetch: typeof fetch = (input, init = {}) => {
  const reqMethod =
    (init.method ||
      (typeof Request !== 'undefined' && input instanceof Request ? input.method : undefined) ||
      'GET'
    ).toUpperCase();

  const isRead = reqMethod === 'GET' || reqMethod === 'HEAD';
  if (!isRead) return fetch(input, init);

  const requestUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url || '';
  const isEdgeSnapshotRead =
    requestUrl.includes(`/storage/v1/object/public/${egressCacheBucket}/inventory/`) ||
    requestUrl.includes(`/storage/v1/object/public/${egressCacheBucket}/lists/`);

  const headers = new Headers(init.headers);
  if (isEdgeSnapshotRead) {
    headers.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
    headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    headers.set('Surrogate-Control', 'max-age=300, stale-while-revalidate=600');
  } else {
    headers.set('Cache-Control', 'public, max-age=30, s-maxage=300, stale-while-revalidate=600');
    headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    headers.set('Surrogate-Control', 'max-age=300, stale-while-revalidate=600');
  }

  return fetch(input, {
    ...init,
    headers
  });
};

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    global: {
      fetch: supabaseEdgeCacheFetch
    }
  }
);
