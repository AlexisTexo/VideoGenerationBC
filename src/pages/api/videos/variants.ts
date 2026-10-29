import type { APIRoute } from 'astro';
import { AiError } from '../../../lib/gemini';
import { PROJECT_COLUMNS, isUuid, type Project } from '../../../lib/projects';
import { planVisuals, type Scene, type VisualSlot } from '../../../lib/video-ai';
import { canCreate, loadIdeas } from '../../../lib/video-data';
import { recommendedVisuals } from '../../../lib/video-plan';
import { MAX_VARIANTS, writeVariants } from '../../../lib/video-variants';

export const prerender = false;

const VIDEO_COLUMNS =
  'id, project_id, title, idea, voice_id, voice_name, target_seconds, script, visuals, formats, sfx, music_track_id, current_generation_id';

/**
 * Crea variantes de un video ya aprobado: guion nuevo (otro gancho y ángulo) y visuales distintos,
 * con base en su guion, su generación y el historial de ideas. Quedan como borradores del mismo
 * proyecto: se aprueba cada guion y se generan sus contenidos como en cualquier video.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  const count = Number(form.get('count'));
  const direction = String(form.get('direction') ?? '').trim().slice(0, 300);
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: source } = await supabase.from('videos').select(VIDEO_COLUMNS).eq('id', videoId).maybeSingle();
  if (!source) return new Response('No encontrado', { status: 404 });

  const back = (query: string) => redirect(`/projects/${source.project_id}/videos/${source.id}?step=entrega&${query}#variantes`, 303);
  if (!Number.isInteger(count) || count < 1 || count > MAX_VARIANTS) return back('error=variant_count');

  // Solo de videos que ya se aprobaron.
  const { count: approved } = await supabase
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('video_id', source.id)
    .eq('status', 'approved');
  if (!approved) return back('error=variant_not_approved');

  const { data: projectRow } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', source.project_id).maybeSingle();
  const project = projectRow as unknown as Project | null;
  if (!project) return new Response('No encontrado', { status: 404 });

  const [history, { data: siblings }] = await Promise.all([
    loadIdeas(supabase, source.project_id),
    supabase.from('videos').select('script').eq('parent_video_id', source.id),
  ]);
  const existing = (siblings ?? []).map((s) => ((s.script ?? []) as Scene[]).map((x) => x.narration).join(' '));
  const scenes = source.script as Scene[];
  const seconds = Number(source.target_seconds);

  let drafts;
  try {
    drafts = await writeVariants({
      project,
      history,
      source: { title: source.title, idea: source.idea, scenes },
      seconds,
      count,
      direction,
      existing,
    });
  } catch (error) {
    console.error('variantes fallaron:', error instanceof Error ? error.message : error);
    return back(error instanceof AiError && error.code === 'config' ? 'error=config' : 'error=variant_ai');
  }

  // Mismas cantidades de imágenes y clips que el original, pero pidiendo escenas distintas.
  const sourceVisuals = (source.visuals ?? []) as VisualSlot[];
  const counts = sourceVisuals.length
    ? {
        images: sourceVisuals.filter((v) => v.type === 'gemini_image').length,
        clips: sourceVisuals.filter((v) => v.type === 'pexels_clip').length,
      }
    : recommendedVisuals(seconds);
  const avoid = sourceVisuals.map((v) => v.prompt.trim().slice(0, 140)).filter(Boolean).slice(0, 12);

  // Si el plan de visuales de una variante falla, queda sin plan y se arma desde su pestaña Visuales.
  const visuals = await Promise.all(
    drafts.map((draft) =>
      planVisuals(project, draft.scenes, counts, avoid).catch((error) => {
        console.error('visuales de variante fallaron:', error instanceof Error ? error.message : error);
        return [] as VisualSlot[];
      }),
    ),
  );

  const { data: ideas } = await supabase
    .from('ideas')
    .insert(
      drafts.map((d) => ({
        project_id: source.project_id,
        title: (d.title || source.title || source.idea).slice(0, 160),
        angle: d.adjustedIdea.slice(0, 1000),
        source: 'ai',
        status: 'used',
      })),
    )
    .select('id');

  const { data: created, error } = await supabase
    .from('videos')
    .insert(
      drafts.map((d, i) => ({
        project_id: source.project_id,
        idea_id: ideas?.[i]?.id ?? null,
        title: d.title,
        idea: d.adjustedIdea,
        voice_id: source.voice_id,
        voice_name: source.voice_name,
        target_seconds: seconds,
        script: d.scenes,
        visuals: visuals[i],
        formats: source.formats,
        sfx: source.sfx,
        music_track_id: source.music_track_id,
        parent_video_id: source.id,
        parent_generation_id: source.current_generation_id ?? null,
      })),
    )
    .select('id');
  if (error || !created?.length) {
    console.error('crear variantes falló:', error?.code, error?.message);
    return back('error=variant_save');
  }

  const unplanned = visuals.filter((v) => !v.length).length;
  return back(`ok=variants&n=${created.length}${created.length < count ? `&asked=${count}` : ''}${unplanned ? `&unplanned=${unplanned}` : ''}`);
};
