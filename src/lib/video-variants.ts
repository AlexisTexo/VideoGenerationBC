import { AiError, generateJson } from './gemini';
import { projectToContext } from './project-context';
import type { ProjectInput } from './projects';
import { SYSTEM, historyBlock, normalizeScenes, similarity, type Idea, type Scene } from './video-ai';
import { WORDS_PER_SECOND } from './video-plan';

export const MAX_VARIANTS = 5;

/** El video aprobado del que nacen las variantes. */
export interface VariantSource {
  title: string;
  idea: string;
  scenes: Scene[];
}

export interface VariantDraft {
  title: string;
  adjustedIdea: string;
  scenes: Scene[];
}

// Una variante comparte producto y mensaje con el original, así que se tolera más parecido que entre ideas.
const TOO_CLOSE = 0.6;

const narrationOf = (scenes: Scene[]) => scenes.map((s) => s.narration).join(' ');

/**
 * Valida lo que devolvió la IA: guion bien formado y claramente distinto del original,
 * de las variantes que ya existen y de las otras de este mismo lote.
 */
export function acceptVariants(raw: unknown, seconds: number, source: VariantSource, taken: string[]): VariantDraft[] {
  const list = (raw as { variants?: unknown })?.variants;
  if (!Array.isArray(list)) return [];

  const compare = [narrationOf(source.scenes), ...taken];
  const accepted: VariantDraft[] = [];
  for (const item of list as Record<string, unknown>[]) {
    const scenes = normalizeScenes(item?.scenes, seconds);
    if (!scenes) continue;
    const text = narrationOf(scenes);
    if (compare.some((other) => similarity(text, other) >= TOO_CLOSE)) continue;
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 160) : '';
    const adjusted = typeof item.adjusted_idea === 'string' ? item.adjusted_idea.trim().slice(0, 2000) : '';
    accepted.push({ title, adjustedIdea: adjusted || source.idea, scenes });
    compare.push(text);
  }
  return accepted;
}

/**
 * Escribe variantes del guion de un video aprobado: mismo mensaje y duración, otro gancho, otro
 * ángulo y otros ejemplos. Se apoya en el historial de ideas y en las variantes que ya existen.
 * Si alguna sale demasiado parecida se descarta y se pide lo que falta una vez más.
 */
export async function writeVariants(options: {
  project: ProjectInput;
  history: Pick<Idea, 'title' | 'angle' | 'status'>[];
  source: VariantSource;
  seconds: number;
  count: number;
  direction: string;
  /** Narraciones de variantes que ya existen de este video. */
  existing: string[];
}): Promise<VariantDraft[]> {
  const { project, history, source, seconds, direction, existing } = options;
  const original = source.scenes.map((s) => `[${s.start}–${s.end} s] ${s.narration}`).join('\n');
  const done: VariantDraft[] = [];

  for (let attempt = 0; attempt < 2 && done.length < options.count; attempt++) {
    const missing = options.count - done.length;
    const taken = [...existing, ...done.map((d) => narrationOf(d.scenes))];
    const prompt = `Contexto del producto:
${projectToContext(project)}

Ideas anteriores de este producto, para no repetirte:
${historyBlock(history)}

Video ya aprobado, que sirve de base ("${source.title || source.idea}"):
${original}
${taken.length ? `\nVariantes que ya existen de este video (no las repitas):\n${taken.map((t) => `- ${t}`).join('\n')}\n` : ''}
Escribe ${missing} variante${missing === 1 ? '' : 's'} nueva${missing === 1 ? '' : 's'} de este video.${direction ? ` Orientación del usuario: ${direction}.` : ''}
- Conserva el mensaje, el producto y el llamado a la acción, pero cambia el gancho (primeros 3 segundos), el ángulo, los ejemplos y el orden de las ideas. No copies frases del original ni de las otras variantes.
- Cada variante debe sentirse como un video distinto, no como una paráfrasis.
- Duración objetivo: ${seconds} segundos (la voz habla a unas ${WORDS_PER_SECOND} palabras por segundo). Escenas de 2 a 8 segundos, con "start" y "end" continuos desde 0.
- Mismo idioma, tono y reglas del producto. No inventes datos, cifras ni funciones que no estén en el contexto.
- "narration" es el texto exacto que dirá la voz.

Responde con este JSON exacto:
{"variants":[{"title":"título del video","adjusted_idea":"qué cuenta esta variante en una o dos frases","scenes":[{"start":0,"end":4,"narration":"..."}]}]}`;

    const raw = await generateJson({ system: SYSTEM, prompt, temperature: 1 });
    done.push(...acceptVariants(raw, seconds, source, taken).slice(0, missing));
  }

  if (!done.length) throw new AiError('Las variantes salieron demasiado parecidas al original', 'format');
  return done;
}
