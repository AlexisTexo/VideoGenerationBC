import type { SupabaseClient } from '@supabase/supabase-js';
import { VOICE_ID_RE } from './elevenlabs';
import { loadPreferences, visualsFor, type Preferences } from './preferences';
import { recommendedVisuals, type VisualCounts } from './video-plan';

/**
 * Lo que lleva por defecto un video nuevo: las últimas elecciones de esta persona (formatos,
 * efectos, voz) y la música predeterminada. Lo usan tanto crear un video como crear varios.
 */
export async function newVideoDefaults(supabase: SupabaseClient, userId: string | undefined) {
  const { prefs, saved } = await loadPreferences(supabase, userId);
  const { data: defaultTrack } = await supabase.from('music_tracks').select('id').eq('is_default', true).maybeSingle();

  const fields = {
    ...(defaultTrack ? { music_track_id: defaultTrack.id as string } : {}),
    ...(saved
      ? {
          formats: prefs.formats,
          sfx: prefs.sfx,
          ...(VOICE_ID_RE.test(prefs.voice_id) ? { voice_id: prefs.voice_id, voice_name: prefs.voice_name } : {}),
        }
      : {}),
  };

  /** Cuántas imágenes y clips pide esta persona para una duración dada. */
  const visualCounts = (seconds: number): VisualCounts =>
    saved ? visualsFor(seconds, prefs.image_share) : recommendedVisuals(seconds);

  return { fields, prefs: prefs as Preferences, saved, visualCounts };
}
