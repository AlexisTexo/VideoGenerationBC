import type { APIRoute } from 'astro';
import { isUuid } from '../../../lib/projects';
import { IDEA_STATUSES, type IdeaStatus } from '../../../lib/video-ai';
import { canCreate, json } from '../../../lib/video-data';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!canCreate(locals.role)) return json({ error: 'forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as { id?: string; status?: string } | null;
  const id = body?.id ?? '';
  const status = body?.status as IdeaStatus;
  if (!isUuid(id) || !IDEA_STATUSES.includes(status)) return json({ error: 'invalid' }, 400);

  const { data, error } = await locals.supabase.from('ideas').update({ status }).eq('id', id).select('id');
  if (error || !data?.length) {
    console.error('actualizar idea falló:', error?.code, error?.message);
    return json({ error: 'save' }, 500);
  }
  return json({ ok: true });
};
