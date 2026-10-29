import { AiError, generateJson } from './gemini';
import { projectToContext } from './project-context';
import type { ProjectInput } from './projects';
import { WORDS_PER_SECOND, type VisualCounts } from './video-plan';

export const IDEA_STATUSES = ['suggested', 'used', 'discarded'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  suggested: 'Sugerida',
  used: 'Usada',
  discarded: 'Descartada',
};

export interface Idea {
  id: string;
  title: string;
  angle: string;
  status: IdeaStatus;
  created_at: string;
}

export const VISUAL_TYPES = ['gemini_image', 'pexels_clip'] as const;
export type VisualType = (typeof VISUAL_TYPES)[number];

export const VISUAL_LABELS: Record<VisualType, string> = {
  gemini_image: 'Imagen (Gemini)',
  pexels_clip: 'Video (Pexels)',
};

/** Un tramo de narración. */
export interface Scene {
  start: number;
  end: number;
  narration: string;
}

/** Una imagen o clip que cubre un tramo del video. */
export interface VisualSlot {
  start: number;
  end: number;
  type: VisualType;
  prompt: string;
}

const SYSTEM =
  'Eres un estratega de contenido para videos cortos en redes (YouTube Shorts, Reels, TikTok). ' +
  'Respondes únicamente con JSON válido, sin texto adicional.';

// ---------- Historial y similitud ----------

const tokens = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3),
  );

/** Parecido entre dos textos (0 a 1) por palabras en común. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const word of ta) if (tb.has(word)) shared++;
  return shared / (ta.size + tb.size - shared);
}

const SIMILAR_THRESHOLD = 0.6;

export function isRepeat(candidate: string, history: Pick<Idea, 'title' | 'angle'>[]): boolean {
  return history.some((h) => similarity(candidate, h.title) >= SIMILAR_THRESHOLD || similarity(candidate, `${h.title} ${h.angle}`) >= SIMILAR_THRESHOLD);
}

function historyBlock(history: Pick<Idea, 'title' | 'angle' | 'status'>[]): string {
  if (!history.length) return '(todavía no hay ideas previas)';
  return history
    .map((h) => `- ${h.title}${h.angle ? ` — ${h.angle}` : ''} [${IDEA_STATUS_LABELS[h.status].toLowerCase()}]`)
    .join('\n');
}

// ---------- Ideas ----------

export interface IdeaDraft {
  title: string;
  angle: string;
}

export async function suggestIdeas(
  project: ProjectInput,
  history: Pick<Idea, 'title' | 'angle' | 'status'>[],
  direction: string,
): Promise<IdeaDraft[]> {
  const prompt = `Contexto del producto:
${projectToContext(project)}

Ideas que ya se propusieron o se usaron. NO las repitas ni las parafrasees; cambia el ángulo, el gancho y el formato:
${historyBlock(history)}

${direction ? `El usuario quiere ideas orientadas a: ${direction}\n\n` : ''}Propón 5 ideas nuevas y distintas entre sí para videos de 30 a 60 segundos. Respeta las reglas y el tono del producto, y no afirmes nada que no esté en el contexto.

Responde con este JSON exacto:
{"ideas":[{"title":"gancho o título corto, máximo 80 caracteres","angle":"1 o 2 frases: qué se cuenta y por qué engancha"}]}`;

  const raw = (await generateJson({ system: SYSTEM, prompt, temperature: 1 })) as { ideas?: unknown };
  if (!Array.isArray(raw?.ideas)) throw new AiError('Formato de ideas inesperado', 'format');

  const drafts: IdeaDraft[] = [];
  for (const item of raw.ideas as { title?: unknown; angle?: unknown }[]) {
    const title = typeof item?.title === 'string' ? item.title.trim().slice(0, 160) : '';
    const angle = typeof item?.angle === 'string' ? item.angle.trim().slice(0, 1000) : '';
    if (!title) continue;
    // Descarta lo que se parece a una idea previa o a otra de este mismo lote.
    if (isRepeat(`${title} ${angle}`, [...history, ...drafts])) continue;
    drafts.push({ title, angle });
  }
  return drafts;
}

// ---------- Guion ----------

export interface ScriptDraft {
  title: string;
  adjustedIdea: string;
  scenes: Scene[];
}

export async function writeScript(
  project: ProjectInput,
  history: Pick<Idea, 'title' | 'angle' | 'status'>[],
  idea: string,
  seconds: number,
): Promise<ScriptDraft> {
  const prompt = `Contexto del producto:
${projectToContext(project)}

Ideas anteriores de este producto, para no repetirte:
${historyBlock(history)}

Idea del usuario: "${idea}"
Duración objetivo: ${seconds} segundos (la voz habla a unas ${WORDS_PER_SECOND} palabras por segundo).

Instrucciones:
- Si la idea se parece a una anterior, modifícala un poco: cambia el ángulo, el gancho y los ejemplos para que se sienta distinta, conservando su intención. Devuelve la idea final en "adjusted_idea".
- Escribe la narración en el idioma del contexto del producto (español por defecto), con el tono y las reglas indicadas. No inventes datos, cifras ni funciones que no estén en el contexto.
- El gancho va en los primeros 3 segundos. Cierra con el llamado a la acción del producto, si existe.
- Divide la narración en escenas de 2 a 8 segundos. "start" y "end" están en segundos, son continuos desde 0 y la última termina cerca de ${seconds}.
- "narration" es el texto exacto que dirá la voz en esa escena.

Responde con este JSON exacto:
{"title":"título del video","adjusted_idea":"la idea final en una o dos frases","scenes":[{"start":0,"end":4,"narration":"..."}]}`;

  const raw = (await generateJson({ system: SYSTEM, prompt, temperature: 0.8 })) as {
    title?: unknown;
    adjusted_idea?: unknown;
    scenes?: unknown;
  };

  const scenes = normalizeScenes(raw?.scenes, seconds);
  if (!scenes) throw new AiError('Formato de guion inesperado', 'format');

  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 160) : '';
  const adjusted = typeof raw.adjusted_idea === 'string' ? raw.adjusted_idea.trim().slice(0, 2000) : '';
  return { title, adjustedIdea: adjusted || idea, scenes };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Deja una lista de tramos continua desde 0. Si el total se aleja más de 25% del objetivo,
 * se reescala para que cuadre.
 */
function chain<T extends { duration: number }>(items: T[], target: number): (Omit<T, 'duration'> & { start: number; end: number })[] {
  const sum = items.reduce((acc, i) => acc + i.duration, 0);
  const factor = Math.abs(sum - target) / target > 0.25 ? target / sum : 1;
  let cursor = 0;
  return items.map(({ duration, ...rest }) => {
    const start = round1(cursor);
    cursor += duration * factor;
    return { ...rest, start, end: round1(cursor) };
  });
}

/** Valida las escenas del guion: texto obligatorio, duraciones razonables y tiempos continuos. */
export function normalizeScenes(input: unknown, seconds: number): Scene[] | null {
  if (!Array.isArray(input) || input.length < 2 || input.length > 40) return null;

  const items: { narration: string; duration: number }[] = [];
  for (const item of input as Record<string, any>[]) {
    const narration = typeof item?.narration === 'string' ? item.narration.trim().slice(0, 1000) : '';
    if (!narration) return null;
    const requested = Number(item.end) - Number(item.start);
    const estimated = narration.split(/\s+/).length / WORDS_PER_SECOND;
    const duration = Math.min(15, Math.max(1, Number.isFinite(requested) && requested > 0 ? requested : estimated));
    items.push({ narration, duration });
  }
  return chain(items, seconds);
}

// ---------- Visuales ----------

/** Reparte imágenes y clips a lo largo del guion. Se hace después, con el guion ya escrito. */
export async function planVisuals(
  project: ProjectInput,
  scenes: Scene[],
  counts: VisualCounts,
): Promise<VisualSlot[]> {
  const total = counts.images + counts.clips;
  const duration = scenes.at(-1)?.end ?? 0;
  const script = scenes.map((s) => `[${s.start}–${s.end} s] ${s.narration}`).join('\n');

  const prompt = `Contexto del producto (incluye la paleta de marca):
${projectToContext(project)}

Guion del video (${duration} segundos):
${script}

Planea los visuales que cubren el video de principio a fin.
- Usa EXACTAMENTE ${total} visuales: ${counts.images} con "type" = "gemini_image" y ${counts.clips} con "type" = "pexels_clip". Mézclalos en el orden que mejor acompañe la narración.
- "start" y "end" son segundos, continuos desde 0 hasta ${duration}. Cada visual cubre el momento de la narración que ilustra.
- "gemini_image": "prompt" es una descripción de la imagen en inglés, coherente con la marca y sin texto ni logotipos dentro de la imagen.
- "pexels_clip": "prompt" son 2 a 5 palabras de búsqueda de video de stock en inglés.
- Respeta las reglas del producto (por ejemplo, qué no mostrar).

Responde con este JSON exacto:
{"visuals":[{"start":0,"end":4,"type":"gemini_image","prompt":"..."}]}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = (await generateJson({ system: SYSTEM, prompt, temperature: 0.7 })) as { visuals?: unknown };
    const slots = normalizeVisuals(raw?.visuals, duration, counts);
    if (slots) return slots;
  }
  throw new AiError('El plan de visuales no respetó la cantidad pedida', 'format');
}

/** Valida los visuales: cantidad exacta, tiempos continuos y tipos en las cantidades pedidas. */
export function normalizeVisuals(input: unknown, duration: number, counts: VisualCounts): VisualSlot[] | null {
  const total = counts.images + counts.clips;
  if (!Array.isArray(input) || input.length !== total || duration <= 0) return null;

  const items: { type: VisualType; prompt: string; duration: number }[] = [];
  for (const item of input as Record<string, any>[]) {
    const requested = Number(item?.end) - Number(item?.start);
    const length = Number.isFinite(requested) && requested > 0 ? requested : duration / total;
    const type = VISUAL_TYPES.includes(item?.type) ? (item.type as VisualType) : 'gemini_image';
    const prompt = typeof item?.prompt === 'string' ? item.prompt.trim().slice(0, 500) : '';
    items.push({ type, prompt, duration: length });
  }

  // Siempre se reescala a la duración real del guion: los visuales cubren todo el video.
  const sum = items.reduce((acc, i) => acc + i.duration, 0);
  let cursor = 0;
  const slots = items.map((item) => {
    const start = round1(cursor);
    cursor += (item.duration / sum) * duration;
    return { start, end: round1(cursor), type: item.type, prompt: item.prompt };
  });
  return assignVisualTypes(slots, counts);
}

/** Deja los tipos exactamente en las cantidades pedidas, respetando los que ya encajan. */
export function assignVisualTypes(slots: VisualSlot[], counts: VisualCounts): VisualSlot[] {
  const quota: Record<VisualType, number> = { gemini_image: counts.images, pexels_clip: counts.clips };
  const kept = slots.map((slot) => {
    if (quota[slot.type] > 0) {
      quota[slot.type]--;
      return slot.type;
    }
    return null;
  });
  return slots.map((slot, i) => {
    let type = kept[i];
    if (!type) {
      type = quota.gemini_image > 0 ? 'gemini_image' : 'pexels_clip';
      quota[type]--;
    }
    return { ...slot, type };
  });
}
