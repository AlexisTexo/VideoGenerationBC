import { AiError, generateJson } from './gemini';
import { projectToContext } from './project-context';
import type { ProjectInput } from './projects';

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

export const VISUAL_TYPES = ['gemini_image', 'pexels_clip', 'text_card'] as const;
export type VisualType = (typeof VISUAL_TYPES)[number];

export const VISUAL_LABELS: Record<VisualType, string> = {
  gemini_image: 'Imagen (Gemini)',
  pexels_clip: 'Clip (Pexels)',
  text_card: 'Texto en pantalla',
};

export interface Scene {
  start: number;
  end: number;
  narration: string;
  visual: { type: VisualType; prompt: string };
}

export const DURATIONS = [30, 45, 60, 90] as const;

const SYSTEM =
  'Eres un estratega de contenido para videos cortos en redes (YouTube Shorts, Reels, TikTok). ' +
  'Respondes únicamente con JSON válido, sin texto adicional.';

const WORDS_PER_SECOND = 2.5;

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
- Divide en escenas de 2 a 8 segundos. "start" y "end" están en segundos, son continuos desde 0 y terminan cerca de ${seconds}.
- "narration" es el texto exacto que dirá la voz en esa escena.
- "visual.type" es "gemini_image" (imagen generada: "prompt" es una descripción en inglés), "pexels_clip" (video de stock: "prompt" son 2 a 5 palabras de búsqueda en inglés) o "text_card" (texto corto en pantalla: "prompt" es ese texto).

Responde con este JSON exacto:
{"title":"título del video","adjusted_idea":"la idea final en una o dos frases","scenes":[{"start":0,"end":4,"narration":"...","visual":{"type":"gemini_image","prompt":"..."}}]}`;

  const raw = (await generateJson({ system: SYSTEM, prompt, temperature: 0.8 })) as {
    title?: unknown;
    adjusted_idea?: unknown;
    scenes?: unknown;
  };

  const scenes = normalizeScenes(raw?.scenes);
  if (!scenes) throw new AiError('Formato de guion inesperado', 'format');

  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 160) : '';
  const adjusted = typeof raw.adjusted_idea === 'string' ? raw.adjusted_idea.trim().slice(0, 2000) : '';
  return { title, adjustedIdea: adjusted || idea, scenes };
}

/** Valida las escenas y las deja continuas desde 0; las duraciones raras se corrigen. */
export function normalizeScenes(input: unknown): Scene[] | null {
  if (!Array.isArray(input) || input.length < 2 || input.length > 40) return null;

  const scenes: Scene[] = [];
  let cursor = 0;
  for (const item of input as Record<string, any>[]) {
    const narration = typeof item?.narration === 'string' ? item.narration.trim().slice(0, 1000) : '';
    if (!narration) return null;

    const requested = Number(item.end) - Number(item.start);
    const estimated = narration.split(/\s+/).length / WORDS_PER_SECOND;
    const duration = Math.min(15, Math.max(1, Number.isFinite(requested) && requested > 0 ? requested : estimated));

    const type = VISUAL_TYPES.includes(item.visual?.type) ? (item.visual.type as VisualType) : 'gemini_image';
    const prompt = typeof item.visual?.prompt === 'string' ? item.visual.prompt.trim().slice(0, 500) : '';

    const start = Math.round(cursor * 10) / 10;
    const end = Math.round((cursor + duration) * 10) / 10;
    scenes.push({ start, end, narration, visual: { type, prompt } });
    cursor = end;
  }
  return scenes;
}
