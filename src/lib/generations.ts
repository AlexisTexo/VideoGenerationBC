import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMusic } from './video-data';
import type { PackageVideo } from './video-package';

export type GenerationKind = 'generate' | 'remake';

/** Todo lo producido en una generación, tal como quedó. */
export interface GenerationSnapshot extends PackageVideo {
  audio_path: string;
}

export interface Generation {
  id: string;
  number: number;
  video_id: string;
  project_id: string;
  kind: GenerationKind;
  note: string;
  created_by_email: string;
  created_at: string;
}

export const GENERATION_COLUMNS = 'id, number, video_id, project_id, kind, note, created_by_email, created_at';

/** Código visible de una generación: GEN-00012. También nombra su carpeta y su ZIP. */
export const generationCode = (number: number) => `GEN-${String(number).padStart(5, '0')}`;

export const KIND_LABELS: Record<GenerationKind, string> = {
  generate: 'Generación',
  remake: 'Rehecho',
};

/** Abre una generación para obtener su código antes de crear archivos. Devuelve null si falla. */
export async function startGeneration(
  supabase: SupabaseClient,
  options: { videoId: string; projectId: string; kind: GenerationKind; note: string; email: string },
): Promise<{ id: string; code: string; folder: string } | null> {
  const { data, error } = await supabase
    .from('generations')
    .insert({
      video_id: options.videoId,
      project_id: options.projectId,
      kind: options.kind,
      note: options.note.slice(0, 300),
      created_by_email: options.email.slice(0, 200),
    })
    .select('id, number')
    .single();
  if (error || !data) {
    console.error('abrir generación falló:', error?.code, error?.message);
    return null;
  }
  const code = generationCode(Number(data.number));
  return { id: data.id as string, code, folder: `${options.videoId}/${code}` };
}

/** Guarda la foto final de la generación y la deja como la vigente del video. */
export async function finishGeneration(
  supabase: SupabaseClient,
  generationId: string,
  videoId: string,
  snapshot: GenerationSnapshot,
): Promise<boolean> {
  const { error } = await supabase.from('generations').update({ snapshot }).eq('id', generationId);
  if (error) {
    console.error('guardar generación falló:', error.code, error.message);
    return false;
  }
  const { error: linkError } = await supabase.from('videos').update({ current_generation_id: generationId }).eq('id', videoId);
  if (linkError) console.error('marcar generación vigente falló:', linkError.code, linkError.message);
  return true;
}

/** Descarta una generación que no llegó a completarse. */
export async function abandonGeneration(supabase: SupabaseClient, generationId: string): Promise<void> {
  const { error } = await supabase.from('generations').delete().eq('id', generationId);
  if (error) console.error('descartar generación falló:', error.code, error.message);
}

/** Arma la foto del video tal como está ahora (ya con los cambios de esta generación). */
export async function snapshotOf(
  supabase: SupabaseClient,
  video: Record<string, any>,
): Promise<GenerationSnapshot> {
  const { music } = await loadMusic(supabase, (video.music_track_id as string | null) ?? null);
  return {
    title: video.title ?? '',
    idea: video.idea ?? '',
    voice_id: video.voice_id ?? '',
    voice_name: video.voice_name ?? '',
    target_seconds: video.target_seconds,
    audio_seconds: video.audio_seconds ?? null,
    audio_path: video.audio_path ?? '',
    script: video.script ?? [],
    visuals: video.visuals ?? [],
    words: video.words ?? [],
    assets: video.assets ?? [],
    formats: video.formats ?? ['9:16'],
    sfx: Boolean(video.sfx),
    music,
  };
}
