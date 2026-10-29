import { createClient } from '@supabase/supabase-js';

// Cliente con service_role: salta RLS. Usar solo en endpoints de servidor ya autorizados como admin.
export function createAdminClient() {
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env');
  }
  return createClient(import.meta.env.PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
