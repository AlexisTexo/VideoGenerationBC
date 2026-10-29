import type { APIRoute } from 'astro';
import { isUuid } from '../../../lib/projects';
import type { Scene, VisualSlot } from '../../../lib/video-ai';
import { canCreate } from '../../../lib/video-data';
import { applyEdits, scaleVisuals } from '../../../lib/video-script';

export const prerender = false;

/** Guarda el texto editado del guion, o lo aprueba (action = approve). Editar quita la aprobación. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: video } = await supabase
    .from('videos')
    .select('id, project_id, script, visuals, script_approved')
    .eq('id', videoId)
    .maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const back = (query: string) => redirect(`/projects/${video.project_id}/videos/${video.id}?step=guion&${query}`, 303);

  const current = video.script as Scene[];
  const edited = applyEdits(current, form.getAll('narration').map(String));
  if (!edited) return back('error=script');

  const changed =
    edited.length !== current.length || edited.some((scene, i) => scene.narration !== current[i].narration);
  const approve = form.get('action') === 'approve';

  const update: Record<string, unknown> = { script_approved: approve };
  if (changed) {
    update.script = edited;
    update.visuals = scaleVisuals(video.visuals as VisualSlot[], edited.at(-1)?.end ?? 0);
    // Cambió el texto: el audio ya generado deja de corresponder al guion.
    update.audio_path = '';
    update.audio_seconds = null;
    update.words = [];
    update.generated_at = null;
  }

  const { error } = await supabase.from('videos').update(update).eq('id', video.id);
  if (error) {
    console.error('guardar guion falló:', error.code, error.message);
    return back('error=save');
  }
  return back(approve ? 'ok=approved' : 'ok=saved');
};
