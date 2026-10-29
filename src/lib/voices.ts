import type { SupabaseClient } from '@supabase/supabase-js';
import { lookupVoice } from './elevenlabs';

export interface Voice {
  id: string;
  voice_id: string;
  name: string;
  preview_url: string;
  last_used_at: string | null;
}

export const VOICE_COLUMNS = 'id, voice_id, name, preview_url, last_used_at';

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

/**
 * Deja la voz usada en la biblioteca y la marca como la última usada.
 * Si es nueva, consulta su nombre y copia la muestra; si ya estaba sin muestra, la completa.
 * Es de mejor esfuerzo: nunca interrumpe lo que el usuario estaba haciendo.
 */
export async function rememberVoice(supabase: SupabaseClient, voiceId: string, fallbackName: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from('voices')
      .select('id, name, preview_url')
      .eq('voice_id', voiceId)
      .maybeSingle();

    if (existing?.preview_url && existing.name) {
      await supabase.from('voices').update({ last_used_at: now }).eq('id', existing.id);
      return;
    }

    const found = await lookupVoice(voiceId);
    // Un nombre ya guardado (por ejemplo, el que puso el usuario) tiene prioridad sobre el de ElevenLabs.
    const name = existing?.name || (found.ok ? found.voice.name : '') || fallbackName;
    const preview = found.ok ? await storePreview(supabase, voiceId, found.voice.previewUrl) : (existing?.preview_url ?? '');
    const row = { name: name.slice(0, 100), preview_url: preview, last_used_at: now };

    const { error } = existing
      ? await supabase.from('voices').update(row).eq('id', existing.id)
      : await supabase.from('voices').insert({ voice_id: voiceId, ...row });
    if (error) console.error('guardar voz en la biblioteca falló:', error.code, error.message);
  } catch (error) {
    console.error('recordar voz falló:', error instanceof Error ? error.message : error);
  }
}
