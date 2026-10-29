import type { SupabaseClient } from '@supabase/supabase-js';
import { generationCode, type GenerationSnapshot } from './generations';
import { PROJECT_COLUMNS, isUuid, type Project } from './projects';
import { normalizeAssets } from './video-assets';
import { loadMusic } from './video-data';

interface GenRow {
  id: string;
  number: number;
  video_id: string;
  project_id: string;
  snapshot: GenerationSnapshot;
}

export interface PackageSource {
  project: Project;
  video: GenerationSnapshot;
  videoId: string;
  /** GEN-00012, o '' si el video aún no tiene generaciones (estado actual). */
  code: string;
  generationId: string | null;
}

const VIDEO_COLUMNS =
  'id, project_id, title, idea, voice_id, voice_name, target_seconds, audio_seconds, audio_path, script, visuals, words, assets, formats, sfx, music_track_id, current_generation_id';

/**
 * De dónde sale un paquete: de una generación concreta (su foto), de la vigente del video,
 * o, si el video aún no tiene ninguna, de su estado actual.
 */
export async function loadPackageSource(
  supabase: SupabaseClient,
  ids: { videoId?: string; generationId?: string },
): Promise<PackageSource | null> {
  const fetchGeneration = async (id: string): Promise<GenRow | null> => {
    const { data } = await supabase
      .from('generations')
      .select('id, number, video_id, project_id, snapshot')
      .eq('id', id)
      .maybeSingle();
    return (data as GenRow | null) ?? null;
  };

  let generation: GenRow | null = null;
  if (ids.generationId) {
    if (!isUuid(ids.generationId)) return null;
    generation = await fetchGeneration(ids.generationId);
    if (!generation) return null;
  } else if (ids.videoId && isUuid(ids.videoId)) {
    const { data: current } = await supabase.from('videos').select('current_generation_id').eq('id', ids.videoId).maybeSingle();
    if (current?.current_generation_id) generation = await fetchGeneration(current.current_generation_id);
  } else {
    return null;
  }

  const videoId = generation?.video_id ?? ids.videoId!;
  let snapshot = generation?.snapshot ?? null;
  let projectId = generation?.project_id ?? '';

  if (!snapshot || !snapshot.script) {
    const { data: live } = await supabase.from('videos').select(VIDEO_COLUMNS).eq('id', videoId).maybeSingle();
    if (!live) return null;
    const { music } = await loadMusic(supabase, live.music_track_id ?? null);
    snapshot = { ...(live as unknown as GenerationSnapshot), music };
    projectId = live.project_id;
  }

  const { data: projectRow } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', projectId).maybeSingle();
  if (!projectRow) return null;

  return {
    project: projectRow as unknown as Project,
    video: { ...snapshot, assets: normalizeAssets(snapshot.assets) },
    videoId,
    code: generation ? generationCode(Number(generation.number)) : '',
    generationId: generation?.id ?? null,
  };
}
