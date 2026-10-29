/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  /** Solo servidor. Nunca con prefijo PUBLIC_. */
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  /** Solo servidor. */
  readonly GEMINI_API_KEY: string;
  readonly GEMINI_MODEL?: string;
  readonly GEMINI_IMAGE_MODEL?: string;
  /** Solo servidor. */
  readonly PIXABAY_API_KEY: string;
  /** Solo servidor. */
  readonly ELEVENLABS_API_KEY: string;
  readonly ELEVENLABS_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    supabase: import('@supabase/supabase-js').SupabaseClient;
    user: import('@supabase/supabase-js').User | null;
    role: 'admin' | 'editor' | 'approver' | null;
  }
}
