import type { APIRoute } from 'astro';
import { isUuid } from '../../../lib/projects';
import { json } from '../../../lib/video-data';

export const prerender = false;

/** Borra ideas del historial (usadas o descartadas). Solo administrador; los videos hechos con ellas se quedan. */
export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== 'admin') return json({ error: 'forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.map(String).filter(isUuid))].slice(0, 200) : [];
  if (!ids.length) return json({ error: 'invalid' }, 400);

  const { data, error } = await locals.supabase.from('ideas').delete().in('id', ids).neq('status', 'suggested').select('id');
  if (error) {
    console.error('borrar ideas falló:', error.code, error.message);
    return json({ error: 'save' }, 500);
  }
  return json({ ok: true, ids: (data ?? []).map((row) => row.id as string) });
};
