import type { APIRoute } from 'astro';
import { deleteGenerations } from '../../../lib/cleanup';
import { isUuid } from '../../../lib/projects';
import { canCreate } from '../../../lib/video-data';

export const prerender = false;

/**
 * Elimina generaciones del historial (y sus archivos). La vigente de cada video no se borra:
 * para quitar un video completo se elimina el video.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const projectId = String(form.get('project_id') ?? '');
  const videoFilter = String(form.get('video') ?? '');
  if (!isUuid(projectId)) return new Response('No encontrado', { status: 404 });

  const back = (query: string) =>
    redirect(`/projects/${projectId}/history?${isUuid(videoFilter) ? `video=${videoFilter}&` : ''}${query}`, 303);

  const ids = [...new Set(form.getAll('generation_ids').map(String).filter(isUuid))];
  if (!ids.length) return back('error=delete_pick');

  const { supabase } = locals;
  const { data: rows } = await supabase.from('generations').select('id, video_id').eq('project_id', projectId).in('id', ids);
  if (!rows?.length) return back('error=delete_pick');

  const byVideo = new Map<string, string[]>();
  for (const row of rows) byVideo.set(row.video_id as string, [...(byVideo.get(row.video_id as string) ?? []), row.id as string]);

  let deleted = 0;
  let skipped = false;
  for (const [videoId, generationIds] of byVideo) {
    const result = await deleteGenerations(supabase, videoId, generationIds);
    deleted += result.deleted;
    skipped ||= result.skippedCurrent;
  }
  if (!deleted) return back(skipped ? 'error=delete_current' : 'error=delete_failed');
  return back(`ok=deleted&n=${deleted}${skipped ? '&skipped=1' : ''}`);
};
