import type { APIRoute } from 'astro';
import { AiError } from '../../../lib/gemini';
import { PROJECT_COLUMNS, isUuid, type Project } from '../../../lib/projects';
import { suggestIdeas } from '../../../lib/video-ai';
import { IDEA_COLUMNS, canCreate, json, loadIdeas } from '../../../lib/video-data';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!canCreate(locals.role)) return json({ error: 'forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as { project_id?: string; direction?: string } | null;
  const projectId = body?.project_id ?? '';
  if (!isUuid(projectId)) return json({ error: 'invalid' }, 400);

  const { supabase } = locals;
  const { data } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', projectId).maybeSingle();
  const project = data as unknown as Project | null;
  if (!project) return json({ error: 'not_found' }, 404);

  const history = await loadIdeas(supabase, projectId);

  let drafts;
  try {
    drafts = await suggestIdeas(project, history, String(body?.direction ?? '').trim().slice(0, 500));
  } catch (error) {
    const code = error instanceof AiError ? error.code : 'request';
    return json({ error: code }, code === 'config' ? 501 : 502);
  }

  if (!drafts.length) return json({ ideas: [] });

  const { data: saved, error } = await supabase
    .from('ideas')
    .insert(drafts.map((d) => ({ project_id: projectId, title: d.title, angle: d.angle, source: 'ai' })))
    .select(IDEA_COLUMNS);

  if (error) {
    console.error('guardar ideas falló:', error.code, error.message);
    return json({ error: 'save' }, 500);
  }
  return json({ ideas: saved });
};
