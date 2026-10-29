import type { SupabaseClient } from '@supabase/supabase-js';
import { isFormatId, type FormatId } from './video-format';
import { LIMITS, recommendedVisuals, type VisualCounts } from './video-plan';

export interface Preferences {
  voice_id: string;
  voice_name: string;
  formats: FormatId[];
  sfx: boolean;
  seconds: number;
  image_share: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  voice_id: '',
  voice_name: '',
  formats: ['9:16'],
  sfx: false,
  seconds: 45,
  image_share: 0.6,
};

const COLUMNS = 'voice_id, voice_name, formats, sfx, seconds, image_share';

/** Lo último que eligió el usuario. `saved` indica si ya hay algo guardado. */
export async function loadPreferences(
  supabase: SupabaseClient,
  userId: string | undefined,
): Promise<{ prefs: Preferences; saved: boolean }> {
  if (!userId) return { prefs: DEFAULT_PREFERENCES, saved: false };

  const { data, error } = await supabase.from('user_preferences').select(COLUMNS).eq('user_id', userId).maybeSingle();
  // Sin tabla (migración pendiente) o sin fila: se usan los valores de fábrica.
  if (error || !data) return { prefs: DEFAULT_PREFERENCES, saved: false };

  const formats = ((data.formats ?? []) as unknown[]).filter(isFormatId) as FormatId[];
  return {
    saved: true,
    prefs: {
      voice_id: data.voice_id ?? '',
      voice_name: data.voice_name ?? '',
      formats: formats.length ? formats : DEFAULT_PREFERENCES.formats,
      sfx: Boolean(data.sfx),
      seconds: Number(data.seconds) || DEFAULT_PREFERENCES.seconds,
      // 0 es válido (solo clips), por eso no se usa ||.
      image_share: Number.isFinite(Number(data.image_share)) ? Number(data.image_share) : DEFAULT_PREFERENCES.image_share,
    },
  };
}

/** Recuerda una elección. Es de mejor esfuerzo: si falla, el flujo principal no se rompe. */
export async function savePreferences(
  supabase: SupabaseClient,
  userId: string | undefined,
  patch: Partial<Preferences>,
): Promise<void> {
  if (!userId) return;
  const { error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) console.error('guardar preferencias falló:', error.code, error.message);
}

export async function resetPreferences(supabase: SupabaseClient, userId: string | undefined): Promise<void> {
  if (!userId) return;
  const { error } = await supabase.from('user_preferences').delete().eq('user_id', userId);
  if (error) console.error('restablecer preferencias falló:', error.code, error.message);
}

/** Cantidades de imágenes y clips para una duración, respetando la proporción que el usuario prefiere. */
export function visualsFor(seconds: number, imageShare: number): VisualCounts {
  const { images, clips } = recommendedVisuals(seconds);
  const total = Math.min(LIMITS.maxVisuals, images + clips);
  const wanted = Math.round(total * imageShare);
  return { images: wanted, clips: total - wanted };
}

/** La proporción de imágenes de unas cantidades elegidas (para recordarla). */
export const shareOf = (counts: VisualCounts) => {
  const total = counts.images + counts.clips;
  return total ? Math.round((counts.images / total) * 100) / 100 : DEFAULT_PREFERENCES.image_share;
};
