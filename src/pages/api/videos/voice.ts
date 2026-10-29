import type { APIRoute } from 'astro';
import { VOICE_ID_RE } from '../../../lib/elevenlabs';
import { isUuid } from '../../../lib/projects';
import { savePreferences } from '../../../lib/preferences';
import { rememberVoice } from '../../../lib/voices';
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

  const voiceName = voiceId ? String(form.get('voice_name') ?? '').trim().slice(0, 100) : '';
  const { error } = await locals.supabase
    .from('videos')
    .update({ voice_id: voiceId, voice_name: voiceName })
    .eq('id', video.id);

  if (error) {
    console.error('guardar voz falló:', error.code, error.message);
    return back('error=save');
  }
  // Se recuerda para los videos nuevos (si quitó la voz, también se olvida).
  await savePreferences(locals.supabase, locals.user?.id, { voice_id: voiceId, voice_name: voiceName });
  // La voz usada pasa sola a la biblioteca, como la última usada.
  if (voiceId) await rememberVoice(locals.supabase, voiceId, voiceName);
  return back(voiceId ? 'ok=voice' : 'ok=1');
};
