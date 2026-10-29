import type { APIRoute } from 'astro';
import { isUuid } from '../../../lib/projects';
import { removePreview } from '../../../lib/voices';
import { canCreate, json } from '../../../lib/video-data';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!canCreate(locals.role)) return json({ error: 'forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id ?? '';
  if (!isUuid(id)) return json({ error: 'invalid' }, 400);

  const { supabase } = locals;
  const { data: voice } = await supabase.from('voices').select('voice_id, preview_url').eq('id', id).maybeSingle();
  if (!voice) return json({ error: 'not_found' }, 404);

  const { error } = await supabase.from('voices').delete().eq('id', id);
  if (error) {
    console.error('borrar voz falló:', error.code, error.message);
    return json({ error: 'save' }, 500);
  }

  await removePreview(supabase, voice.voice_id, voice.preview_url);
  return json({ ok: true });
};
