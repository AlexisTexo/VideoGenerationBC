import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'project-logos';
const MAX_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Comprueba el contenido real (no solo el tipo declarado por el navegador). */
function sniffType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  return null;
}

export type LogoInput =
  | { kind: 'none' }
  | { kind: 'remove' }
  | { kind: 'invalid' }
  | { kind: 'upload'; file: File; bytes: Uint8Array; contentType: string };

export async function readLogoInput(form: FormData): Promise<LogoInput> {
  const file = form.get('logo');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { kind: 'invalid' };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffType(bytes);
    return contentType ? { kind: 'upload', file, bytes, contentType } : { kind: 'invalid' };
  }
  return form.get('remove_logo') === 'on' ? { kind: 'remove' } : { kind: 'none' };
}

/** Sube el logo y devuelve su URL pública, o null si falla. */
export async function uploadLogo(
  supabase: SupabaseClient,
  projectId: string,
  logo: Extract<LogoInput, { kind: 'upload' }>,
): Promise<string | null> {
  const path = `${projectId}/logo-${Date.now()}.${EXTENSIONS[logo.contentType]}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, logo.bytes, { contentType: logo.contentType, cacheControl: '31536000' });
  if (error) {
    console.error('subir logo falló:', error.message);
    return null;
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Borra el archivo anterior (mejor esfuerzo; un huérfano no rompe nada). */
export async function deleteLogo(supabase: SupabaseClient, url: string) {
  const marker = `/${BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return;
  const path = decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error('borrar logo falló:', error.message);
}
