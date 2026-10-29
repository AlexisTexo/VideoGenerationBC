import type { APIRoute } from 'astro';
import { AiError } from '../../../lib/gemini';
import { PROJECT_COLUMNS, isUuid, type Project } from '../../../lib/projects';
import { writeScript } from '../../../lib/video-ai';
import { parseSeconds } from '../../../lib/video-plan';
import { loadPreferences, savePreferences } from '../../../lib/preferences';
import { VOICE_ID_RE } from '../../../lib/elevenlabs';
import { canCreate, loadIdeas } from '../../../lib/video-data';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const projectId = String(form.get('project_id') ?? '');
  if (!isUuid(projectId)) return new Response('No encontrado', { status: 404 });

  const back = (error: string) => redirect(`/projects/${projectId}?error=${error}`, 303);

  const idea = String(form.get('idea') ?? '').trim().slice(0, 2000);
  if (idea.length < 5) return back('idea');

  const seconds = parseSeconds(form);
  if (!seconds) return back('plan');
  const ideaId = String(form.get('idea_id') ?? '');

  const { supabase } = locals;
  const { data } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', projectId).maybeSingle();
  const project = data as unknown as Project | null;
  if (!project) return new Response('No encontrado', { status: 404 });

  const history = await loadIdeas(supabase, projectId);

  let script;
  try {
    script = await writeScript(project, history, idea, seconds);
  } catch (error) {
    return back(error instanceof AiError && error.code === 'config' ? 'config' : 'ai');
  }

  // La idea se marca como usada; si el usuario escribió la suya, queda registrada en el historial.
  let linkedIdeaId: string | null = null;
  if (isUuid(ideaId) && history.some((h) => h.id === ideaId)) {
    await supabase.from('ideas').update({ status: 'used' }).eq('id', ideaId);
    linkedIdeaId = ideaId;
  } else {
    const { data: created } = await supabase
      .from('ideas')
      .insert({
        project_id: projectId,
        title: (script.title || idea).slice(0, 160),
        angle: script.adjustedIdea.slice(0, 1000),
        source: 'user',
        status: 'used',
      })
      .select('id')
      .single();
    linkedIdeaId = created?.id ?? null;
  }

  const { prefs, saved: prefsSaved } = await loadPreferences(supabase, locals.user?.id);
  await savePreferences(supabase, locals.user?.id, { seconds });

  // La música predeterminada de la biblioteca se aplica sola a cada video nuevo.
  const { data: defaultTrack } = await supabase.from('music_tracks').select('id').eq('is_default', true).maybeSingle();

  const { data: video, error } = await supabase
    .from('videos')
    .insert({
      ...(defaultTrack ? { music_track_id: defaultTrack.id } : {}),
      // Lo último que eligió el usuario arranca preseleccionado.
      ...(prefsSaved
        ? {
            formats: prefs.formats,
            sfx: prefs.sfx,
            ...(VOICE_ID_RE.test(prefs.voice_id) ? { voice_id: prefs.voice_id, voice_name: prefs.voice_name } : {}),
          }
        : {}),
      project_id: projectId,
      idea_id: linkedIdeaId,
      title: script.title,
      idea: script.adjustedIdea,
      target_seconds: seconds,
      script: script.scenes,
    })
    .select('id')
    .single();

  if (error || !video) {
    console.error('crear video falló:', error?.code, error?.message);
    return back('save');
  }

  return redirect(`/projects/${projectId}/videos/${video.id}`, 303);
};
