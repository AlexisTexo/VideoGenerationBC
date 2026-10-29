import type { APIRoute } from 'astro';
import { VOICE_ID_RE, synthesize } from '../../../lib/elevenlabs';
import { abandonGeneration, finishGeneration, snapshotOf, startGeneration } from '../../../lib/generations';
import { PROJECT_COLUMNS, isUuid, type Project } from '../../../lib/projects';
import type { Scene, VisualSlot } from '../../../lib/video-ai';
import { ASSET_BUCKET, generateAssets, normalizeAssets } from '../../../lib/video-assets';
import { canCreate } from '../../../lib/video-data';
import { isFormatId, type FormatId } from '../../../lib/video-format';
import { alignScenes, scaleVisuals } from '../../../lib/video-script';

export const prerender = false;

const VIDEO_COLUMNS =
  'id, project_id, title, idea, voice_id, voice_name, target_seconds, audio_seconds, audio_path, script, visuals, words, assets, formats, sfx, music_track_id, script_approved, generated_at';

/**
 * Genera los contenidos del video y los guarda como una generación nueva (GEN-00012):
 *  1. La voz (ElevenLabs) con tiempos reales; guion y visuales se ajustan a ella.
 *  2. Las imágenes (Gemini, por formato) y los clips (Pixabay) del plan de visuales.
 * Sin "force" solo se rehace lo que falta, cambió o falló; lo demás se reutiliza de generaciones anteriores.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });
  const force = form.get('force') === '1';

  const { supabase } = locals;
  const { data: video } = await supabase.from('videos').select(VIDEO_COLUMNS).eq('id', videoId).maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const back = (query: string) =>
    redirect(`/projects/${video.project_id}/videos/${video.id}?step=contenidos&${query}`, 303);

  const scenes = video.script as Scene[];
  let visuals = video.visuals as VisualSlot[];
  if (!video.script_approved || !visuals.length || !VOICE_ID_RE.test(video.voice_id)) return back('error=notready');

  const { data: projectRow } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', video.project_id).maybeSingle();
  const project = projectRow as unknown as Project | null;
  if (!project) return new Response('No encontrado', { status: 404 });

  const first = !video.generated_at;
  const generation = await startGeneration(supabase, {
    videoId: video.id,
    projectId: video.project_id,
    kind: 'generate',
    note: force ? 'Todo rehecho' : first ? 'Primera generación' : 'Completada o actualizada',
    email: locals.user?.email ?? '',
  });
  if (!generation) return back('error=history');

  // Si algo falla antes de terminar, la generación se descarta para no dejar historial vacío.
  const abort = async (query: string) => {
    await abandonGeneration(supabase, generation.id);
    return back(query);
  };

  // 1. Voz: solo si no existe (editar el guion la borra) o si se pide rehacerla.
  if (force || !video.audio_path) {
    const speech = await synthesize(video.voice_id, scenes.map((s) => s.narration).join(' '));
    if (!speech.ok) return abort(`error=voice_${speech.reason}`);

    const aligned = alignScenes(scenes, speech.alignment);
    if (!aligned) return abort('error=align');

    const path = `${generation.folder}/voiceover.mp3`;
    const { error: uploadError } = await supabase.storage
      .from(ASSET_BUCKET)
      .upload(path, speech.audio, { contentType: 'audio/mpeg', upsert: true });
    if (uploadError) {
      console.error('subir audio falló:', uploadError.message);
      return abort('error=upload');
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
      return abort('error=save');
    }
  }

  // 2. Imágenes y clips, en la carpeta de esta generación.
  const formats = ((video.formats ?? []) as unknown[]).filter(isFormatId) as FormatId[];
  const assets = await generateAssets({
    supabase,
    folder: generation.folder,
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
    return abort('error=save');
  }

  // 3. La foto de esta generación, con el video tal como quedó.
  const { data: fresh } = await supabase.from('videos').select(VIDEO_COLUMNS).eq('id', video.id).single();
  await finishGeneration(supabase, generation.id, video.id, await snapshotOf(supabase, fresh ?? video));

  const failed = assets.filter((a) => a.status === 'error').length;
  return back(failed ? `ok=partial&failed=${failed}&gen=${generation.code}` : `ok=generated&gen=${generation.code}`);
};
