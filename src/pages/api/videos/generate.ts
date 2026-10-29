import type { APIRoute } from 'astro';
import { VOICE_ID_RE, synthesize } from '../../../lib/elevenlabs';
import { PROJECT_COLUMNS, isUuid, type Project } from '../../../lib/projects';
import type { Scene, VisualSlot } from '../../../lib/video-ai';
import { ASSET_BUCKET, generateAssets, normalizeAssets } from '../../../lib/video-assets';
import { isFormatId, type FormatId } from '../../../lib/video-format';
import { canCreate } from '../../../lib/video-data';
import { alignScenes, scaleVisuals } from '../../../lib/video-script';

export const prerender = false;

/**
 * Genera los contenidos del video:
 *  1. La voz (ElevenLabs) con tiempos reales; guion y visuales se ajustan a ella.
 *  2. Las imágenes (Gemini) y los clips (Pixabay) del plan de visuales.
 * Sin "force" solo se rehace lo que falta, cambió o falló.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });
  const force = form.get('force') === '1';

  const { supabase } = locals;
  const { data: video } = await supabase
    .from('videos')
    .select('id, project_id, voice_id, script, visuals, script_approved, audio_path, assets, formats')
    .eq('id', videoId)
    .maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const back = (query: string) =>
    redirect(`/projects/${video.project_id}/videos/${video.id}?step=contenidos&${query}`, 303);

  const scenes = video.script as Scene[];
  let visuals = video.visuals as VisualSlot[];
  if (!video.script_approved || !visuals.length || !VOICE_ID_RE.test(video.voice_id)) return back('error=notready');

  const { data: projectRow } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', video.project_id).maybeSingle();
  const project = projectRow as unknown as Project | null;
  if (!project) return new Response('No encontrado', { status: 404 });

  // 1. Voz: solo si no existe (editar el guion la borra) o si se pide rehacerla.
  if (force || !video.audio_path) {
    const speech = await synthesize(video.voice_id, scenes.map((s) => s.narration).join(' '));
    if (!speech.ok) return back(`error=voice_${speech.reason}`);

    const aligned = alignScenes(scenes, speech.alignment);
    if (!aligned) return back('error=align');

    const path = `${video.id}/voiceover.mp3`;
    const { error: uploadError } = await supabase.storage
      .from(ASSET_BUCKET)
      .upload(path, speech.audio, { contentType: 'audio/mpeg', upsert: true });
    if (uploadError) {
      console.error('subir audio falló:', uploadError.message);
      return back('error=upload');
    }

    visuals = scaleVisuals(visuals, aligned.duration);
    const { error } = await supabase
      .from('videos')
      .update({
        script: aligned.scenes,
        visuals,
        words: aligned.words,
        audio_path: path,
        audio_seconds: aligned.duration,
      })
      .eq('id', video.id);
    if (error) {
      console.error('guardar voz falló:', error.code, error.message);
      return back('error=save');
    }
  }

  // 2. Imágenes y clips.
  const formats = ((video.formats ?? []) as unknown[]).filter(isFormatId) as FormatId[];
  const assets = await generateAssets({
    supabase,
    videoId: video.id,
    project,
    visuals,
    formats: formats.length ? formats : ['9:16'],
    existing: normalizeAssets(video.assets),
    force,
  });

  const { error } = await supabase
    .from('videos')
    .update({ assets, generated_at: new Date().toISOString() })
    .eq('id', video.id);
  if (error) {
    console.error('guardar contenidos falló:', error.code, error.message);
    return back('error=save');
  }

  const failed = assets.filter((a) => a.status === 'error').length;
  return back(failed ? `ok=partial&failed=${failed}` : 'ok=generated');
};
