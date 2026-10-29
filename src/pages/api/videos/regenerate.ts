import type { APIRoute } from 'astro';
import { PROJECT_COLUMNS, isUuid, type Project } from '../../../lib/projects';
import type { VisualSlot } from '../../../lib/video-ai';
import { normalizeAssets, remakeAsset } from '../../../lib/video-assets';
import { isFormatId, type FormatId } from '../../../lib/video-format';
import { canCreate } from '../../../lib/video-data';

export const prerender = false;

/** Rehace una sola imagen (de un formato) o un solo clip, sin tocar el resto. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  const index = Number(form.get('index'));
  const format = String(form.get('format') ?? '');
  if (!isUuid(videoId) || !Number.isInteger(index) || index < 0) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: video } = await supabase
    .from('videos')
    .select('id, project_id, visuals, assets, formats')
    .eq('id', videoId)
    .maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const back = (query: string) =>
    redirect(`/projects/${video.project_id}/videos/${video.id}?step=contenidos&${query}#visual-${index}`, 303);

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

  let assets = normalizeAssets(video.assets);
  const remadeAll = await Promise.all(
    targets.map((wanted) =>
      remakeAsset({
        supabase,
        videoId: video.id,
        project,
        slot,
        index,
        format: wanted,
        formats: formats.length ? formats : ['9:16'],
        previous: assets.find((a) => a.index === index && a.format === wanted),
      }),
    ),
  );

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
    return back('error=save');
  }
  const failed = remadeAll.find((r) => r.status === 'error');
  return back(failed ? `error=remake_failed&detail=${encodeURIComponent(failed.error ?? '')}` : 'ok=remade');
};
