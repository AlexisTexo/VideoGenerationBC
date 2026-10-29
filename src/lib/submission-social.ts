import type { SupabaseClient } from '@supabase/supabase-js';
import { PROJECT_COLUMNS, type Project } from './projects';
import { generateSocial, type Social } from './social';
import { narrationOf, type Submission } from './submissions';

/** Escribe los textos de redes de una entrega con el contexto del proyecto y el guion, y los guarda. */
export async function writeSocial(
  supabase: SupabaseClient,
  submission: Pick<Submission, 'id' | 'video_id' | 'project_id' | 'note' | 'seconds'>,
): Promise<Social> {
  const [{ data: projectRow }, { data: video }] = await Promise.all([
    supabase.from('projects').select(PROJECT_COLUMNS).eq('id', submission.project_id).maybeSingle(),
    supabase.from('videos').select('title, idea, script, target_seconds').eq('id', submission.video_id).maybeSingle(),
  ]);
  const project = projectRow as unknown as Project | null;
  if (!project || !video) throw new Error('Falta el proyecto o el video de la entrega');

  const social = await generateSocial({
    project,
    title: String(video.title || video.idea || ''),
    narration: narrationOf(video.script),
    seconds: Number(submission.seconds) || Number(video.target_seconds) || 0,
    note: submission.note,
  });
  const { error } = await supabase.from('submissions').update({ social }).eq('id', submission.id);
  if (error) throw new Error(`No se pudieron guardar los textos: ${error.message}`);
  return social;
}
