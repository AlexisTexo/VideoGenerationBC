/** Formatos de video y su zona segura de subtítulos. Sin dependencias de servidor. */
import type { Word } from './video-script';

export const FORMAT_IDS = ['9:16', '16:9'] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

export function isFormatId(value: unknown): value is FormatId {
  return (FORMAT_IDS as readonly unknown[]).includes(value);
}

export interface SubtitleLayout {
  /** Márgenes (px) que la interfaz de la plataforma puede tapar: no poner texto ahí. */
  safe: { top: number; bottom: number; left: number; right: number };
  /** Caja donde van los subtítulos, dentro de la zona segura. */
  box: { x: number; y: number; width: number; height: number };
  fontSize: number;
  maxCharsPerLine: number;
  maxLines: number;
}

export interface FormatSpec {
  id: FormatId;
  label: string;
  platforms: string;
  width: number;
  height: number;
  /** Carpeta de las imágenes de este formato dentro del paquete. */
  dir: string;
  subtitles: SubtitleLayout;
}

export const FORMATS: Record<FormatId, FormatSpec> = {
  // Vertical: los botones y el texto de TikTok, Reels y Shorts tapan abajo (~25 %), arriba (~13 %) y a la derecha.
  '9:16': {
    id: '9:16',
    label: 'Vertical 9:16',
    platforms: 'TikTok, Reels y Shorts',
    width: 1080,
    height: 1920,
    dir: '9x16',
    subtitles: {
      safe: { top: 250, bottom: 480, left: 64, right: 160 },
      box: { x: 64, y: 1190, width: 856, height: 250 },
      fontSize: 72,
      maxCharsPerLine: 22,
      maxLines: 2,
    },
  },
  // Horizontal: la barra del reproductor de YouTube tapa abajo; se deja aire a los lados.
  '16:9': {
    id: '16:9',
    label: 'Horizontal 16:9',
    platforms: 'YouTube y Facebook',
    width: 1920,
    height: 1080,
    dir: '16x9',
    subtitles: {
      safe: { top: 60, bottom: 130, left: 160, right: 160 },
      box: { x: 160, y: 800, width: 1600, height: 150 },
      fontSize: 56,
      maxCharsPerLine: 42,
      maxLines: 2,
    },
  },
};

export interface Cue {
  start: number;
  end: number;
  text: string;
  lines: string[];
}

const SENTENCE_END = /[.!?…]$/;
const MAX_CUE_SECONDS = 4;

function splitLines(words: string[], maxChars: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Agrupa las palabras en subtítulos que caben en la caja del formato: máximo de líneas y de
 * caracteres por línea, corta al final de una frase y no deja un subtítulo más de 4 s en pantalla.
 */
export function buildCues(words: Word[], format: FormatId): Cue[] {
  const { maxCharsPerLine, maxLines } = FORMATS[format].subtitles;
  const capacity = maxCharsPerLine * maxLines;

  const groups: Word[][] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
  };

  for (const word of words) {
    const text = [...current, word].map((w) => w.text).join(' ');
    const tooLong = current.length > 0 && (splitLines(text.split(' '), maxCharsPerLine).length > maxLines || text.length > capacity);
    const tooSlow = current.length > 0 && word.end - current[0].start > MAX_CUE_SECONDS;
    const afterSentence = current.length >= 3 && SENTENCE_END.test(current[current.length - 1].text);
    if (tooLong || tooSlow || afterSentence) flush();
    current.push(word);
  }
  flush();

  return groups.map((group, i) => {
    const start = group[0].start;
    const nextStart = groups[i + 1]?.[0].start;
    const last = group[group.length - 1].end;
    // Si el siguiente subtítulo entra casi enseguida, este se extiende hasta ahí para no parpadear.
    const end = nextStart !== undefined && nextStart - last < 0.35 ? nextStart : last;
    const text = group.map((w) => w.text).join(' ');
    return { start, end: Math.round(end * 100) / 100, text, lines: splitLines(text.split(' '), maxCharsPerLine) };
  });
}
