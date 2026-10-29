import type { SupabaseClient } from '@supabase/supabase-js';
import { generationCode } from './generations';
import { FINAL_BUCKET } from './submissions';
import { ASSET_BUCKET, normalizeAssets } from './video-assets';

/** Todos los archivos (con ruta completa) dentro de una carpeta del almacenamiento, bajando por subcarpetas. */
async function listFiles(supabase: SupabaseClient, bucket: string, folder: string, depth = 0): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
  if (error) {
    console.error('listar archivos falló:', bucket, folder, error.message);
    return [];
  }
  const files: string[] = [];
  for (const entry of data ?? []) {
    const path = `${folder}/${entry.name}`;
    // Las carpetas no traen id.
    if (entry.id) files.push(path);
    else if (depth < 3) files.push(...(await listFiles(supabase, bucket, path, depth + 1)));
  }
  return files;
}

async function removeFiles(supabase: SupabaseClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) console.error('borrar archivos falló:', bucket, error.message);
  }
}

const pathsOf = (snapshot: { assets?: unknown; audio_path?: unknown } | null | undefined): string[] => [
  ...normalizeAssets(snapshot?.assets).map((a) => a.path),
  ...(typeof snapshot?.audio_path === 'string' && snapshot.audio_path ? [snapshot.audio_path] : []),
];

/**
 * Borra generaciones del historial de un video y los archivos que solo ellas usaban.
 * Una generación nueva reutiliza archivos de las anteriores (lo que no se rehízo), así que nunca se
 * borra lo que siga usando el video vigente o una generación que se queda. La vigente no se borra.
 */
export async function deleteGenerations(
  supabase: SupabaseClient,
  videoId: string,
  generationIds: string[],
): Promise<{ deleted: number; skippedCurrent: boolean }> {
  const [{ data: video }, { data: rows }] = await Promise.all([
    supabase.from('videos').select('assets, audio_path, current_generation_id').eq('id', videoId).maybeSingle(),
    supabase.from('generations').select('id, number, snapshot').eq('video_id', videoId),
  ]);
  if (!video || !rows) return { deleted: 0, skippedCurrent: false };

  const current = video.current_generation_id as string | null;
  const asked = new Set(generationIds);
  const doomed = rows.filter((r) => asked.has(r.id as string) && r.id !== current);
  const skippedCurrent = generationIds.includes(current ?? '');
  if (!doomed.length) return { deleted: 0, skippedCurrent };

  const doomedIds = new Set(doomed.map((r) => r.id as string));
  const keep = new Set<string>([
    ...pathsOf({ assets: video.assets, audio_path: video.audio_path }),
    ...rows.filter((r) => !doomedIds.has(r.id as string)).flatMap((r) => pathsOf(r.snapshot as never)),
  ]);

  const candidates = new Set<string>();
  for (const row of doomed) {
    pathsOf(row.snapshot as never).forEach((p) => candidates.add(p));
    (await listFiles(supabase, ASSET_BUCKET, `${videoId}/${generationCode(Number(row.number))}`)).forEach((p) => candidates.add(p));
  }
  // Solo carpetas de este video: nunca la biblioteca de música ni nada compartido.
  const remove = [...candidates].filter((p) => p.startsWith(`${videoId}/`) && !keep.has(p));
  await removeFiles(supabase, ASSET_BUCKET, remove);

  const { error } = await supabase.from('generations').delete().in('id', [...doomedIds]);
  if (error) {
    console.error('borrar generaciones falló:', error.code, error.message);
    return { deleted: 0, skippedCurrent };
  }
  return { deleted: doomed.length, skippedCurrent };
}

/** Borra un video completo: sus archivos (assets y videos finales) y, en cascada, generaciones y entregas. */
export async function deleteVideo(supabase: SupabaseClient, videoId: string): Promise<boolean> {
  const { data: video } = await supabase.from('videos').select('id, audio_path').eq('id', videoId).maybeSingle();
  if (!video) return false;

  const [assetFiles, finalFiles] = await Promise.all([
    listFiles(supabase, ASSET_BUCKET, videoId),
    listFiles(supabase, FINAL_BUCKET, videoId),
  ]);
  const audio = typeof video.audio_path === 'string' && video.audio_path.startsWith(`${videoId}/`) ? [video.audio_path] : [];
  await removeFiles(supabase, ASSET_BUCKET, [...new Set([...assetFiles, ...audio])]);
  await removeFiles(supabase, FINAL_BUCKET, finalFiles);

  const { error } = await supabase.from('videos').delete().eq('id', videoId);
  if (error) {
    console.error('borrar video falló:', error.code, error.message);
    return false;
  }
  return true;
}
