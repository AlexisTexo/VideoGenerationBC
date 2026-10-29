import type { SupabaseClient } from '@supabase/supabase-js';
import type { Idea } from './video-ai';

export const IDEA_COLUMNS = 'id, title, angle, status, created_at';

/** Todas las ideas del proyecto (más recientes primero), para no repetirlas. */
export async function loadIdeas(supabase: SupabaseClient, projectId: string, limit = 80): Promise<Idea[]> {
  const { data, error } = await supabase
    .from('ideas')
    .select(IDEA_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('cargar ideas falló:', error.code, error.message);
    return [];
  }
  return (data ?? []) as Idea[];
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const canCreate = (role: string | null) => role === 'admin' || role === 'editor';

/** La pista de música elegida para un video (nombre y ruta), si hay. */
export async function loadMusic(supabase: SupabaseClient, trackId: string | null) {
  if (!trackId) return { music: null };
  const { data } = await supabase.from('music_tracks').select('name, path').eq('id', trackId).maybeSingle();
  return { music: data ? { name: data.name as string, path: data.path as string } : null };
}
