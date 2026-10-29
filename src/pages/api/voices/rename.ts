import type { APIRoute } from 'astro';
import { isUuid } from '../../../lib/projects';
import { canCreate, json } from '../../../lib/video-data';
import { VOICE_COLUMNS } from '../../../lib/voices';

export const prerender = false;

/** Cambia el nombre de una voz de la biblioteca (y el que muestran los videos que la usan). */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!canCreate(locals.role)) return json({ error: 'forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as { id?: string; name?: string } | null;
  const id = body?.id ?? '';
  const name = String(body?.name ?? '').trim().slice(0, 100);
  if (!isUuid(id) || !name) return json({ error: 'invalid' }, 400);

  const { supabase } = locals;
  const { data: voice, error } = await supabase.from('voices').update({ name }).eq('id', id).select(VOICE_COLUMNS).maybeSingle();
  if (error || !voice) {
    console.error('renombrar voz falló:', error?.code, error?.message);
    return json({ error: 'save' }, error ? 500 : 404);
  }

  // Los videos guardan una copia del nombre: se mantiene al día (mejor esfuerzo).
  const { error: videosError } = await supabase.from('videos').update({ voice_name: name }).eq('voice_id', voice.voice_id);
  if (videosError) console.error('actualizar nombre en videos falló:', videosError.code, videosError.message);

  return json({ voice });
};
