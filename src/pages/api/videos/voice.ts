import type { APIRoute } from 'astro';
import { VOICE_ID_RE } from '../../../lib/elevenlabs';
import { isUuid } from '../../../lib/projects';
import { canCreate } from '../../../lib/video-data';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });

  const { data: video } = await locals.supabase.from('videos').select('id, project_id').eq('id', videoId).maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const back = (query: string) => redirect(`/projects/${video.project_id}/videos/${video.id}?step=voz&${query}`, 303);

  const voiceId = String(form.get('voice_id') ?? '').trim();
  if (voiceId && !VOICE_ID_RE.test(voiceId)) return back('error=voice');

  const { error } = await locals.supabase
    .from('videos')
    .update({ voice_id: voiceId, voice_name: voiceId ? String(form.get('voice_name') ?? '').trim().slice(0, 100) : '' })
    .eq('id', video.id);

  if (error) {
    console.error('guardar voz falló:', error.code, error.message);
    return back('error=save');
  }
  return back('ok=1');
};
