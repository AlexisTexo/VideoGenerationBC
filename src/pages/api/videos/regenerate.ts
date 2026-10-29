import type { APIRoute } from 'astro';
import { abandonGeneration, finishGeneration, snapshotOf, startGeneration } from '../../../lib/generations';
import { PROJECT_COLUMNS, isUuid, type Project } from '../../../lib/projects';
import type { VisualSlot } from '../../../lib/video-ai';
import { normalizeAssets, remakeAsset } from '../../../lib/video-assets';
import { canCreate } from '../../../lib/video-data';
import { FORMATS, isFormatId, type FormatId } from '../../../lib/video-format';

export const prerender = false;

const VIDEO_COLUMNS =
  'id, project_id, title, idea, voice_id, voice_name, target_seconds, audio_seconds, audio_path, script, visuals, words, assets, formats, sfx, music_track_id';

/**
 * Rehace una sola imagen (de un formato, o de todos) o un solo clip. Queda como una generación nueva
 * (la anterior no se toca) y el resto del video se conserva igual.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  const index = Number(form.get('index'));
  const format = String(form.get('format') ?? '');
  const returnTo = String(form.get('return_to') ?? '');
  if (!isUuid(videoId) || !Number.isInteger(index) || index < 0) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: video } = await supabase.from('videos').select(VIDEO_COLUMNS).eq('id', videoId).maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  // Se vuelve a la misma pantalla desde donde se pidió (pestaña Contenidos o historial).
  const base = returnTo.startsWith(`/projects/${video.project_id}/`)
    ? returnTo.split('?')[0].split('#')[0]
    : `/projects/${video.project_id}/videos/${video.id}`;
  const step = base === `/projects/${video.project_id}/videos/${video.id}` ? 'step=contenidos&' : '';
  const back = (query: string, to = base) => redirect(`${to}?${to === base ? step : ''}${query}#visual-${index}`, 303);
  const fromHistory = returnTo.startsWith(`/projects/${video.project_id}/history/`);

  const visuals = video.visuals as VisualSlot[];
  const slot = visuals[index];
  if (!slot) return back('error=remake');

  // Un clip es uno solo para todos los formatos. Una imagen se rehace por formato; "all" rehace las de todos.
  const formats = ((video.formats ?? []) as unknown[]).filter(isFormatId) as FormatId[];
  const targets: (FormatId | 'any')[] =
    slot.type === 'pexels_clip' ? ['any'] : format === 'all' ? formats : isFormatId(format) && formats.includes(format) ? [format] : [];
  if (!targets.length) return back('error=remake');

  const { data: projectRow } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', video.project_id).maybeSingle();
  const project = projectRow as unknown as Project | null;
  if (!project) return new Response('No encontrado', { status: 404 });

  const what =
    slot.type === 'pexels_clip'
      ? `Clip ${index + 1} cambiado`
      : `Imagen ${index + 1} rehecha${targets.length === 1 && targets[0] !== 'any' ? ` (${FORMATS[targets[0]].label})` : ''}`;
  const generation = await startGeneration(supabase, {
    videoId: video.id,
    projectId: video.project_id,
    kind: 'remake',
    note: what,
    email: locals.user?.email ?? '',
  });
  if (!generation) return back('error=history');

  let assets = normalizeAssets(video.assets);
  const remadeAll = await Promise.all(
    targets.map((wanted) =>
      remakeAsset({
        supabase,
        folder: generation.folder,
        project,
        slot,
        index,
        format: wanted,
        formats: formats.length ? formats : ['9:16'],
        previous: assets.find((a) => a.index === index && a.format === wanted),
      }),
    ),
  );

  // Si todo falló no cambió nada: no se deja una generación sin cambios.
  const failed = remadeAll.find((r) => r.status === 'error');
  if (remadeAll.every((r) => r.status === 'error')) {
    await abandonGeneration(supabase, generation.id);
    return back(`error=remake_failed&detail=${encodeURIComponent(failed?.error ?? '')}`);
  }

  // Si un intento falla y ya había uno bueno, se conserva el anterior (y se avisa).
  for (const [position, remade] of remadeAll.entries()) {
    const wanted = targets[position];
    const previous = assets.find((a) => a.index === index && a.format === wanted);
    const keepPrevious = remade.status === 'error' && previous?.status === 'done' && previous.type === slot.type;
    assets = assets.filter((a) => !(a.index === index && a.format === wanted));
    assets.push(keepPrevious ? previous : remade);
  }
  assets.sort((a, b) => a.index - b.index);

  const { error } = await supabase.from('videos').update({ assets }).eq('id', video.id);
  if (error) {
    console.error('guardar elemento rehecho falló:', error.code, error.message);
    await abandonGeneration(supabase, generation.id);
    return back('error=save');
  }

  await finishGeneration(supabase, generation.id, video.id, await snapshotOf(supabase, { ...video, assets }));
  // Desde el historial se abre la generación nueva, que ahora es la vigente.
  const next = fromHistory ? `/projects/${video.project_id}/history/${generation.id}` : base;
  return back(
    failed ? `error=remake_failed&detail=${encodeURIComponent(failed.error ?? '')}` : `ok=remade&gen=${generation.code}`,
    next,
  );
};
