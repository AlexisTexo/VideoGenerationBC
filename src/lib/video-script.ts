import type { Scene, VisualSlot } from './video-ai';
import { WORDS_PER_SECOND } from './video-plan';

export interface Word {
  text: string;
  start: number;
  end: number;
}

/** Tiempos por carácter que devuelve ElevenLabs. */
export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Aplica el texto editado a cada escena (mismo orden). Una escena sin texto se elimina.
 * Las escenas que no cambiaron conservan su duración; las editadas se estiman por palabras.
 */
export function applyEdits(scenes: Scene[], narrations: string[]): Scene[] | null {
  if (narrations.length !== scenes.length) return null;

  const items: { narration: string; duration: number }[] = [];
  narrations.forEach((raw, i) => {
    const narration = raw.trim().slice(0, 1000);
    if (!narration) return;
    const changed = narration !== scenes[i].narration;
    const duration = changed
      ? Math.max(1, wordCount(narration) / WORDS_PER_SECOND)
      : scenes[i].end - scenes[i].start;
    items.push({ narration, duration });
  });
  if (items.length < 1) return null;

  let cursor = 0;
  return items.map(({ narration, duration }) => {
    const start = round1(cursor);
    cursor += duration;
    return { start, end: round1(cursor), narration };
  });
}

/** Reescala los visuales para que sigan cubriendo todo el video cuando cambia la duración. */
export function scaleVisuals(visuals: VisualSlot[], total: number): VisualSlot[] {
  const current = visuals.at(-1)?.end ?? 0;
  if (!visuals.length || current <= 0 || total <= 0) return visuals;
  const factor = total / current;
  return visuals.map((v, i) => ({
    ...v,
    start: round1(v.start * factor),
    end: i === visuals.length - 1 ? round1(total) : round1(v.end * factor),
  }));
}

/**
 * Pasa del texto del guion a tiempos reales: ajusta cada escena a lo que tardó la voz
 * y devuelve las palabras con su tiempo (para subtítulos).
 */
export function alignScenes(
  scenes: Scene[],
  alignment: Alignment,
): { scenes: Scene[]; words: Word[]; duration: number } | null {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  const n = characters.length;
  if (!n || starts.length !== n || ends.length !== n) return null;

  const fullText = scenes.map((s) => s.narration).join(' ');
  // Si ElevenLabs normaliza el texto y cambia el largo, se mapea de forma proporcional.
  const at = (i: number) => Math.max(0, Math.min(n - 1, Math.round((i * n) / fullText.length)));

  let offset = 0;
  const ranges = scenes.map((scene) => {
    const from = offset;
    offset += scene.narration.length + 1; // +1 por el espacio que une las escenas
    return { from, to: from + scene.narration.length };
  });

  const duration = ends[n - 1];
  const aligned = scenes.map((scene, i) => ({
    narration: scene.narration,
    start: i === 0 ? 0 : starts[at(ranges[i].from)],
    end: i === scenes.length - 1 ? duration : starts[at(ranges[i + 1].from)],
  }));

  const words: Word[] = [];
  let current = '';
  let wordStart = 0;
  let wordEnd = 0;
  for (let i = 0; i < n; i++) {
    const char = characters[i];
    if (/\s/.test(char)) {
      if (current) words.push({ text: current, start: round2(wordStart), end: round2(wordEnd) });
      current = '';
    } else {
      if (!current) wordStart = starts[i];
      current += char;
      wordEnd = ends[i];
    }
  }
  if (current) words.push({ text: current, start: round2(wordStart), end: round2(wordEnd) });

  return {
    scenes: aligned.map((s) => ({ ...s, start: round2(s.start), end: round2(s.end) })),
    words,
    duration: round2(duration),
  };
}
