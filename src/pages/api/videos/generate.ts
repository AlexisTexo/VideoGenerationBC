import type { APIRoute } from 'astro';
import { VOICE_ID_RE, synthesize } from '../../../lib/elevenlabs';
import { isUuid } from '../../../lib/projects';
import type { Scene, VisualSlot } from '../../../lib/video-ai';
import { canCreate } from '../../../lib/video-data';
import { alignScenes, scaleVisuals } from '../../../lib/video-script';

export const prerender = false;

const BUCKET = 'video-assets';

/** Genera los contenidos del video: la voz con tiempos reales por palabra, y ajusta guion y visuales a ella. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: video } = await supabase
    .from('videos')
    .select('id, project_id, voice_id, script, visuals, script_approved')
    .eq('id', videoId)
    .maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const back = (query: string) =>
    redirect(`/projects/${video.project_id}/videos/${video.id}?step=contenidos&${query}`, 303);

  const scenes = video.script as Scene[];
  const visuals = video.visuals as VisualSlot[];
  if (!video.script_approved || !visuals.length || !VOICE_ID_RE.test(video.voice_id)) return back('error=notready');

  const text = scenes.map((s) => s.narration).join(' ');
  const speech = await synthesize(video.voice_id, text);
  if (!speech.ok) return back(`error=${speech.reason === 'request' ? 'voice_request' : `voice_${speech.reason}`}`);

  const aligned = alignScenes(scenes, speech.alignment);
  if (!aligned) return back('error=align');

  const path = `${video.id}/voiceover.mp3`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, speech.audio, { contentType: 'audio/mpeg', upsert: true });
  if (uploadError) {
    console.error('subir audio falló:', uploadError.message);
    return back('error=upload');
  }

  const { error } = await supabase
    .from('videos')
    .update({
      script: aligned.scenes,
      visuals: scaleVisuals(visuals, aligned.duration),
      words: aligned.words,
      audio_path: path,
      audio_seconds: aligned.duration,
      generated_at: new Date().toISOString(),
    })
    .eq('id', video.id);

  if (error) {
    console.error('guardar contenidos falló:', error.code, error.message);
    return back('error=save');
  }
  return back('ok=generated');
};
