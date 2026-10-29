import type { APIRoute } from 'astro';
import { isUuid } from '../../../lib/projects';
import { savePreferences } from '../../../lib/preferences';
import { canCreate } from '../../../lib/video-data';

export const prerender = false;

/** Guarda la música elegida para este video y si lleva efectos de sonido. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: video } = await supabase.from('videos').select('id, project_id').eq('id', videoId).maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const back = (query: string) => redirect(`/projects/${video.project_id}/videos/${video.id}?step=audio&${query}`, 303);

  const trackId = String(form.get('music_track_id') ?? '');
  if (trackId && !isUuid(trackId)) return back('error=music_save');

  const { error } = await supabase
    .from('videos')
    .update({ music_track_id: trackId || null, sfx: form.get('sfx') === 'on' })
    .eq('id', video.id);
  if (error) {
    console.error('guardar audio falló:', error.code, error.message);
    return back('error=music_save');
  }
  await savePreferences(supabase, locals.user?.id, { sfx: form.get('sfx') === 'on' });
  return back('ok=audio');
};
