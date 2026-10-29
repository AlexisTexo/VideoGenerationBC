import type { APIRoute } from 'astro';
import { AiError } from '../../../lib/gemini';
import { mapLimit } from '../../../lib/pool';
import { PROJECT_COLUMNS, isUuid, type Project } from '../../../lib/projects';
import { newVideoDefaults } from '../../../lib/video-defaults';
import { planVisuals, writeScript, type Scene, type ScriptDraft, type VisualSlot } from '../../../lib/video-ai';
import { canCreate, loadIdeas } from '../../../lib/video-data';
import { BULK_LIMITS, parseSeconds } from '../../../lib/video-plan';
import { writeVariants } from '../../../lib/video-variants';

export const prerender = false;

// Pocas llamadas a Gemini a la vez para no topar con su límite por minuto.
const PARALLEL = 3;

interface Made {
  ideaId: string;
  drafts: { draft: ScriptDraft; visuals: VisualSlot[] }[];
}

/**
 * Crea varios videos de golpe a partir de las ideas elegidas: un guion por idea (o varios, con otro
 * gancho cada uno) y su plan de visuales, con las últimas elecciones de quien los pide. Quedan como
 * borradores: se aprueba cada guion y se generan sus contenidos como en cualquier video.
 * Es independiente de las variantes, que nacen de un video ya aprobado.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const projectId = String(form.get('project_id') ?? '');
  if (!isUuid(projectId)) return new Response('No encontrado', { status: 404 });
  const back = (query: string) => redirect(`/projects/${projectId}?${query}`, 303);

  const ideaIds = [...new Set(form.getAll('idea_ids').map(String).filter(isUuid))];
  const perIdea = Number(form.get('per_idea') ?? 1);
  const seconds = parseSeconds(form);
  if (!seconds) return back('error=plan');
  if (!ideaIds.length || !Number.isInteger(perIdea) || perIdea < 1) return back('error=bulk_pick');
  if (ideaIds.length > BULK_LIMITS.ideas || perIdea > BULK_LIMITS.perIdea || ideaIds.length * perIdea > BULK_LIMITS.total) {
    return back('error=bulk_limit');
  }

  const { supabase } = locals;
  const { data } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', projectId).maybeSingle();
  const project = data as unknown as Project | null;
  if (!project) return new Response('No encontrado', { status: 404 });

  const history = await loadIdeas(supabase, projectId);
  const picked = history.filter((h) => ideaIds.includes(h.id) && h.status === 'suggested');
  if (!picked.length) return back('error=bulk_pick');

  const defaults = await newVideoDefaults(supabase, locals.user?.id);
  const counts = defaults.visualCounts(seconds);

  const plan = (scenes: Scene[], avoid: string[] = []) =>
    planVisuals(project, scenes, counts, avoid).catch((error) => {
      console.error('visuales del lote fallaron:', error instanceof Error ? error.message : error);
      return [] as VisualSlot[];
    });

  let configMissing = false;
  const made = await mapLimit(picked, PARALLEL, async (idea): Promise<Made | null> => {
    try {
      // Sin la propia idea en el historial: si no, la IA la "modifica" por parecerse a sí misma.
      const others = history.filter((h) => h.id !== idea.id);
      const text = idea.angle ? `${idea.title}. ${idea.angle}` : idea.title;
      const first = await writeScript(project, others, text, seconds);
      const firstVisuals = await plan(first.scenes);
      const drafts = [{ draft: first, visuals: firstVisuals }];

      if (perIdea > 1) {
        // Más videos de la misma idea: otro gancho y otras escenas que el primero.
        const avoid = firstVisuals.map((v) => v.prompt.trim().slice(0, 140)).filter(Boolean).slice(0, 12);
        const extra = await writeVariants({
          project,
          history: others,
          source: { title: first.title, idea: first.adjustedIdea, scenes: first.scenes },
          seconds,
          count: perIdea - 1,
          direction: '',
          existing: [],
        }).catch(() => []);
        const visuals = await Promise.all(extra.map((d) => plan(d.scenes, avoid)));
        extra.forEach((draft, i) => drafts.push({ draft, visuals: visuals[i] }));
      }
      return { ideaId: idea.id, drafts };
    } catch (error) {
      if (error instanceof AiError && error.code === 'config') configMissing = true;
      console.error('video del lote falló:', idea.id, error instanceof Error ? error.message : error);
      return null;
    }
  });

  const done = made.filter((m): m is Made => m !== null);
  if (!done.length) return back(configMissing ? 'error=config' : 'error=bulk_ai');

  const rows = done.flatMap((m) =>
    m.drafts.map(({ draft, visuals }) => ({
      ...defaults.fields,
      project_id: projectId,
      idea_id: m.ideaId,
      title: draft.title,
      idea: draft.adjustedIdea,
      target_seconds: seconds,
      script: draft.scenes,
      visuals,
    })),
  );
  const { data: created, error } = await supabase.from('videos').insert(rows).select('id');
  if (error || !created?.length) {
    console.error('crear videos del lote falló:', error?.code, error?.message);
    return back('error=bulk_save');
  }

  await supabase.from('ideas').update({ status: 'used' }).in('id', done.map((m) => m.ideaId));

  const failed = picked.length - done.length;
  const unplanned = rows.filter((r) => !r.visuals.length).length;
  return back(`ok=bulk&n=${created.length}${failed ? `&failed=${failed}` : ''}${unplanned ? `&unplanned=${unplanned}` : ''}&tab=videos`);
};
