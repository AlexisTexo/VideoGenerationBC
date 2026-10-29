/** Decisiones del usuario sobre el video. Sin dependencias de servidor: lo usa también el navegador. */

export const LIMITS = { minSeconds: 10, maxSeconds: 300, maxVisuals: 30 } as const;

/** Tope al crear varios videos de golpe: ideas elegidas, videos por idea y total (cada uno cuesta llamadas a la IA). */
export const BULK_LIMITS = { ideas: 8, perIdea: 3, total: 12 } as const;

export const PRESET_SECONDS = [30, 45, 60, 90] as const;

/** Velocidad de lectura de la voz, en palabras por segundo. */
export const WORDS_PER_SECOND = 2.5;

export interface VisualCounts {
  images: number;
  clips: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Una imagen o clip cada ~5 segundos, con más imágenes que clips. */
export function recommendedVisuals(seconds: number): VisualCounts {
  const total = clamp(Math.round(seconds / 5), 1, LIMITS.maxVisuals);
  const images = Math.ceil(total * 0.6);
  return { images, clips: total - images };
}

const int = (form: FormData, key: string) => {
  const raw = String(form.get(key) ?? '').trim();
  return /^\d+$/.test(raw) ? Number(raw) : NaN;
};

/** Duración en segundos; null si está fuera de rango. */
export function parseSeconds(form: FormData): number | null {
  const seconds = int(form, 'seconds');
  return Number.isFinite(seconds) && seconds >= LIMITS.minSeconds && seconds <= LIMITS.maxSeconds ? seconds : null;
}

/** Cantidad de imágenes y clips; null si falta alguno o el total está fuera de rango. */
export function parseVisualCounts(form: FormData): VisualCounts | null {
  const images = int(form, 'images');
  const clips = int(form, 'clips');
  if (![images, clips].every(Number.isFinite)) return null;
  const total = images + clips;
  return total >= 1 && total <= LIMITS.maxVisuals ? { images, clips } : null;
}
