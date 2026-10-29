import { AiError, generateJson } from './gemini';
import { projectToContext } from './project-context';
import type { ProjectInput } from './projects';

/** Límites de cada plataforma. "Ideal" es lo que se pide a la IA; "max" lo que se hace cumplir. */
export const LIMITS = {
  youtube: {
    title: { ideal: 60, max: 70 },
    description: { ideal: 300, max: 450 },
    tagsTotal: 480,
    tagsCount: 12,
    hashtags: 3,
  },
  meta: {
    caption: { ideal: 125, max: 220 },
    hashtags: 5,
  },
  tiktok: {
    caption: { ideal: 90, max: 150 },
    hashtags: 5,
  },
} as const;

export interface Social {
  youtube: { title: string; description: string; tags: string[]; hashtags: string[] };
  meta: { caption: string; hashtags: string[] };
  tiktok: { caption: string; hashtags: string[] };
}

export const EMPTY_SOCIAL: Social = {
  youtube: { title: '', description: '', tags: [], hashtags: [] },
  meta: { caption: '', hashtags: [] },
  tiktok: { caption: '', hashtags: [] },
};

/** Corta en el límite sin partir palabras ni dejar signos colgando. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s,;:\-–—(]+$/, '').trim();
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** Una etiqueta o hashtag limpio: sin # ni espacios ni signos, o '' si no sirve. */
function cleanTag(value: unknown, hashtag: boolean): string {
  const text = str(value).replace(/^#+/, '').trim();
  if (!text) return '';
  if (hashtag) return text.replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 30);
  return text.replace(/\s+/g, ' ').replace(/[<>"#,]/g, '').slice(0, 40);
}

function uniqueTags(input: unknown, hashtag: boolean, maxCount: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(input) ? input : []) {
    const tag = cleanTag(item, hashtag);
    const key = tag.toLowerCase();
    if (tag.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= maxCount) break;
  }
  return out;
}

/** YouTube cuenta las etiquetas separadas por coma (y las que llevan espacios, entre comillas). */
export function tagsLength(tags: string[]): number {
  return tags.reduce((sum, t) => sum + t.length + (t.includes(' ') ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

function fitTags(tags: string[], budget: number): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    if (tagsLength([...out, tag]) > budget) break;
    out.push(tag);
  }
  return out;
}

const SHOUTING = /^[^a-záéíóúñ]*$/;

/**
 * Deja los textos dentro de los límites y avisa de lo que no cumple lo pedido.
 * `issues` solo lista lo que estaba fuera de lo ideal ANTES de recortar; sirve para reintentar.
 */
export function normalizeSocial(input: unknown): { social: Social; issues: string[] } {
  const raw = (input ?? {}) as Record<string, any>;
  const issues: string[] = [];
  const L = LIMITS;

  const check = (label: string, text: string, ideal: number) => {
    if (!text) issues.push(`${label} está vacío`);
    else if (text.length > ideal) issues.push(`${label} tiene ${text.length} caracteres y debe tener máximo ${ideal}`);
  };

  const ytTitleRaw = str(raw.youtube?.title).replace(/\s+/g, ' ').trim();
  const ytDescRaw = str(raw.youtube?.description).trim();
  const metaRaw = str(raw.meta?.caption).replace(/\s+/g, ' ').trim();
  const tiktokRaw = str(raw.tiktok?.caption).replace(/\s+/g, ' ').trim();

  check('El título de YouTube', ytTitleRaw, L.youtube.title.max);
  check('La descripción de YouTube', ytDescRaw, L.youtube.description.max);
  check('El texto de Meta', metaRaw, L.meta.caption.max);
  check('El texto de TikTok', tiktokRaw, L.tiktok.caption.max);
  if (ytTitleRaw.length > 8 && SHOUTING.test(ytTitleRaw)) issues.push('El título de YouTube está todo en mayúsculas');
  if (/[.…]{2,}$|…$/.test(ytTitleRaw)) issues.push('El título de YouTube termina en puntos suspensivos');

  const social: Social = {
    youtube: {
      title: clip(ytTitleRaw, L.youtube.title.max),
      description: clip(ytDescRaw.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'), L.youtube.description.max),
      tags: fitTags(uniqueTags(raw.youtube?.tags, false, L.youtube.tagsCount), L.youtube.tagsTotal),
      hashtags: uniqueTags(raw.youtube?.hashtags, true, L.youtube.hashtags),
    },
    meta: {
      caption: clip(metaRaw, L.meta.caption.max),
      hashtags: uniqueTags(raw.meta?.hashtags, true, L.meta.hashtags),
    },
    tiktok: {
      caption: clip(tiktokRaw, L.tiktok.caption.max),
      hashtags: uniqueTags(raw.tiktok?.hashtags, true, L.tiktok.hashtags),
    },
  };

  if (social.youtube.tags.length < 3) issues.push('Faltan etiquetas de YouTube (mínimo 3)');
  if (social.tiktok.hashtags.length < 3) issues.push('Faltan hashtags de TikTok (mínimo 3)');
  return { social, issues };
}

/** Lee lo guardado en la base y lo lleva a la forma esperada (sin avisos ni IA). */
export function readSocial(input: unknown): Social | null {
  if (!input || typeof input !== 'object' || !('youtube' in input)) return null;
  return normalizeSocial(input).social;
}

const SYSTEM =
  'Eres un redactor de redes para marcas B2B. Escribes textos breves, concretos y sin relleno. ' +
  'Respondes únicamente con JSON válido, sin texto adicional.';

/**
 * Escribe títulos, descripciones y etiquetas para YouTube, Meta (Facebook e Instagram) y TikTok.
 * Valida límites y brevedad; si algo se pasa, reintenta una vez diciéndole a la IA qué corregir.
 */
export async function generateSocial(options: {
  project: ProjectInput;
  title: string;
  narration: string;
  seconds: number;
  note?: string;
}): Promise<Social> {
  const { youtube: yt, meta, tiktok } = LIMITS;
  const base = `Contexto del producto:
${projectToContext(options.project)}

Video terminado (${Math.round(options.seconds)} segundos). Tema: ${options.title || 'sin título'}
${options.note ? `Nota de quien lo subió: ${options.note}\n` : ''}Narración del video:
${options.narration || '(sin guion registrado)'}

Escribe los textos para publicarlo. Reglas generales:
- Breves, contundentes y concretos: cada palabra aporta. Sin relleno, sin frases genéricas ("descubre cómo", "en este video"), sin promesas que el producto no cumple.
- Primero lo más importante: el beneficio o el dato clave va al inicio.
- Mismo idioma y tono que el producto. Respeta sus reglas (qué sí y qué no decir).
- Máximo un emoji por texto, y solo si aporta. Nada de MAYÚSCULAS sostenidas ni puntos suspensivos al final del título.
- Cierra con el llamado a la acción del producto cuando exista, en una frase corta.

Límites (se cortan si se pasan):
- YouTube "title": máximo ${yt.title.ideal} caracteres, con la palabra clave principal al inicio.
- YouTube "description": máximo ${yt.description.ideal} caracteres. Las primeras 2 líneas se ven antes de "ver más": ahí va lo esencial.
- YouTube "tags": ${yt.tagsCount} etiquetas como máximo, de 1 a 3 palabras, sin #, específicas del tema.
- YouTube "hashtags": ${yt.hashtags}, sin #.
- Meta "caption" (Facebook e Instagram): máximo ${meta.caption.ideal} caracteres, lo esencial en los primeros 125. "hashtags": hasta ${meta.hashtags}, sin #.
- TikTok "caption": máximo ${tiktok.caption.ideal} caracteres, directa y con gancho. "hashtags": de 3 a ${tiktok.hashtags}, sin #.

Responde con este JSON exacto:
{"youtube":{"title":"","description":"","tags":[""],"hashtags":[""]},"meta":{"caption":"","hashtags":[""]},"tiktok":{"caption":"","hashtags":[""]}}`;

  let prompt = base;
  let best: Social | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await generateJson({ system: SYSTEM, prompt, temperature: 0.6 });
    const { social, issues } = normalizeSocial(raw);
    best = social;
    if (!issues.length) return social;
    console.info('[social] reintento por:', issues.join('; '));
    prompt = `${base}\n\nTu intento anterior tuvo estos problemas, corrígelos:\n- ${issues.join('\n- ')}`;
  }
  // Tras el reintento lo que quede ya está recortado a los límites duros.
  if (best && best.youtube.title && best.meta.caption && best.tiktok.caption) return best;
  throw new AiError('Gemini no devolvió textos completos para las redes', 'format');
}
