import type { APIRoute } from 'astro';
import { deleteVideo } from '../../../lib/cleanup';
import { isUuid } from '../../../lib/projects';

export const prerender = false;

/** Elimina un video con todo lo suyo (generaciones, entregas y archivos). Solo administrador. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (locals.role !== 'admin') return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: video } = await supabase.from('videos').select('project_id').eq('id', videoId).maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const back = (query: string) => redirect(`/projects/${video.project_id}?tab=videos&${query}`, 303);
  return (await deleteVideo(supabase, videoId)) ? back('ok=video_deleted') : back('error=video_delete');
};
