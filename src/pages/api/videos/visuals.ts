import type { APIRoute } from 'astro';
import { AiError } from '../../../lib/gemini';
import { PROJECT_COLUMNS, isUuid, type Project } from '../../../lib/projects';
import { planVisuals, type Scene } from '../../../lib/video-ai';
import { parseVisualCounts } from '../../../lib/video-plan';
import { canCreate } from '../../../lib/video-data';

export const prerender = false;

/** Reparte imágenes (Gemini) y videos (Pexels) sobre el guion ya escrito. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: video } = await supabase
    .from('videos')
    .select('id, project_id, script')
    .eq('id', videoId)
    .maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const back = (query: string) => redirect(`/projects/${video.project_id}/videos/${video.id}?step=visuales&${query}`, 303);

  const counts = parseVisualCounts(form);
  if (!counts) return back('error=counts');

  const { data } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', video.project_id).maybeSingle();
  const project = data as unknown as Project | null;
  if (!project) return new Response('No encontrado', { status: 404 });

  let visuals;
  try {
    visuals = await planVisuals(project, video.script as Scene[], counts);
  } catch (error) {
    return back(error instanceof AiError && error.code === 'config' ? 'error=config' : 'error=ai');
  }

  const { error } = await supabase.from('videos').update({ visuals }).eq('id', video.id);
  if (error) {
    console.error('guardar visuales falló:', error.code, error.message);
    return back('error=save');
  }
  return back('ok=1');
};
