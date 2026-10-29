import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

export function hasSupabaseEnv() {
  return Boolean(import.meta.env.PUBLIC_SUPABASE_URL && import.meta.env.PUBLIC_SUPABASE_ANON_KEY);
}

export function createClient({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get('Cookie') ?? '').map(({ name, value }) => ({
            name,
            value: value ?? '',
          }));
        },
        setAll(list) {
          for (const { name, value, options } of list) {
            cookies.set(name, value, options);
          }
        },
      },
    },
  );
}
