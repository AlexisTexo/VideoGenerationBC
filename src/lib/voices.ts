import type { SupabaseClient } from '@supabase/supabase-js';

export interface Voice {
  id: string;
  voice_id: string;
  name: string;
  preview_url: string;
}

export const VOICE_COLUMNS = 'id, voice_id, name, preview_url';

const BUCKET = 'voice-previews';
const MAX_BYTES = 3 * 1024 * 1024;
// La muestra solo se descarga si viene de un servidor de ElevenLabs o de su almacenamiento público.
const ALLOWED_HOSTS = ['elevenlabs.io', 'elevenlabs.com', 'googleapis.com'];

const isAllowed = (url: URL) =>
  url.protocol === 'https:' && ALLOWED_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));

/**
 * Copia la muestra de audio a Storage para que no dependa de ElevenLabs.
 * Devuelve la URL de la copia, o la original si no se pudo copiar.
 */
export async function storePreview(supabase: SupabaseClient, voiceId: string, previewUrl: string): Promise<string> {
  if (!previewUrl) return '';

  let source: URL;
  try {
    source = new URL(previewUrl);
  } catch {
    return '';
  }
  if (!isAllowed(source)) return previewUrl;

  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.startsWith('audio/')) return previewUrl;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return previewUrl;

    const path = `${voiceId}.mp3`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'audio/mpeg', upsert: true, cacheControl: '31536000' });
    if (error) {
      console.error('guardar muestra falló:', error.message);
      return previewUrl;
    }
    // ?v= evita que el navegador muestre una muestra vieja si se vuelve a guardar la voz.
    return `${supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  } catch (error) {
    console.error('descargar muestra falló:', error instanceof Error ? error.message : error);
    return previewUrl;
  }
}

/** Borra la copia de la muestra (mejor esfuerzo). */
export async function removePreview(supabase: SupabaseClient, voiceId: string, previewUrl: string) {
  if (!previewUrl.includes(`/${BUCKET}/`)) return;
  const { error } = await supabase.storage.from(BUCKET).remove([`${voiceId}.mp3`]);
  if (error) console.error('borrar muestra falló:', error.message);
}
