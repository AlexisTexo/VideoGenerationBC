import type { SupabaseClient } from '@supabase/supabase-js';
import { AiError, generateImage } from './gemini';
import { downloadClip, findClip, type Orientation } from './pixabay';
import type { ProjectInput } from './projects';
import type { VisualSlot, VisualType } from './video-ai';
import { FORMATS, type FormatId } from './video-format';

export const ASSET_BUCKET = 'video-assets';

/**
 * Una imagen o clip generado para el visual número `index`.
 * Las imágenes se generan una por formato; un clip sirve para todos ('any') y se recorta al editar.
 */
export interface Asset {
  index: number;
  format: FormatId | 'any';
  type: VisualType;
  status: 'done' | 'error';
  path: string;
  mime: string;
  prompt: string;
  credit?: string;
  error?: string;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};

/** Los assets viejos no traían formato: las imágenes eran 9:16 y los clips valen para todos. */
export function normalizeAssets(raw: unknown): Asset[] {
  return ((Array.isArray(raw) ? raw : []) as Asset[]).map((a) => ({
    ...a,
    format: a.format ?? (a.type === 'pexels_clip' ? 'any' : '9:16'),
  }));
}

/** El asset vigente (mismo tipo y prompt) de un visual para un formato, si existe. */
export function assetFor(assets: Asset[], index: number, slot: VisualSlot, format: FormatId): Asset | null {
  const wanted = slot.type === 'pexels_clip' ? 'any' : format;
  return assets.find((a) => a.index === index && a.format === wanted && a.type === slot.type && a.prompt === slot.prompt) ?? null;
}

/** Ruta del archivo dentro del paquete (sin el id del video). */
export const packageName = (path: string, videoId: string) => path.replace(`${videoId}/`, '');

const pad = (n: number) => String(n).padStart(2, '0');

function imagePrompt(project: ProjectInput, slot: VisualSlot, format: FormatId): string {
  const palette = project.brand_colors.map((c) => `${c.name} ${c.hex}`).join(', ');
  const rules = project.rules.trim().slice(0, 500);
  return [
    slot.prompt,
    palette ? `Use this brand color palette: ${palette}.` : '',
    `${format === '9:16' ? 'Vertical 9:16' : 'Horizontal 16:9'} composition, clean modern look. Leave the lower third calm: subtitles will be placed there. No text, no logos, no watermarks.`,
    rules ? `Content rules to follow strictly: ${rules}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

async function upload(supabase: SupabaseClient, path: string, bytes: Uint8Array, mime: string): Promise<boolean> {
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
  if (error) console.error('subir archivo falló:', path, error.message);
  return !error;
}

async function makeAsset(
  supabase: SupabaseClient,
  videoId: string,
  project: ProjectInput,
  slot: VisualSlot,
  index: number,
  format: FormatId | 'any',
  orientation: Orientation,
): Promise<Asset> {
  const base = { index, format, type: slot.type, prompt: slot.prompt, mime: '', path: '' };
  const fail = (error: string): Asset => ({ ...base, status: 'error', error });

  if (slot.type === 'gemini_image' && format !== 'any') {
    try {
      const image = await generateImage(imagePrompt(project, slot, format), format);
      const path = `${videoId}/assets/${FORMATS[format].dir}/${pad(index + 1)}.${EXTENSIONS[image.mime]}`;
      if (!(await upload(supabase, path, image.bytes, image.mime))) return fail('No se pudo guardar la imagen.');
      return { ...base, status: 'done', path, mime: image.mime };
    } catch (error) {
      if (error instanceof AiError) {
        return fail(error.code === 'config' ? 'Falta GEMINI_API_KEY en el .env.' : error.message);
      }
      return fail('No se pudo generar la imagen.');
    }
  }

  const found = await findClip(slot.prompt, slot.end - slot.start, orientation);
  if (!found.ok) {
    return fail(
      found.reason === 'config'
        ? 'Falta PIXABAY_API_KEY en el .env.'
        : found.reason === 'none'
          ? `Pixabay no encontró clips para “${slot.prompt}”.`
          : 'No se pudo consultar Pixabay.',
    );
  }
  const bytes = await downloadClip(found.clip.url);
  if (!bytes) return fail('No se pudo descargar el clip.');
  const path = `${videoId}/assets/clips/${pad(index + 1)}.mp4`;
  if (!(await upload(supabase, path, bytes, 'video/mp4'))) return fail('No se pudo guardar el clip.');
  return { ...base, status: 'done', path, mime: 'video/mp4', credit: found.clip.credit };
}

/** Ejecuta tareas con un máximo de llamadas a la vez. */
async function pool<T, R>(items: T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await work(items[i], i);
      }
    }),
  );
  return results;
}

/**
 * Genera las imágenes (Gemini, una por formato) y baja los clips (Pixabay, uno por visual).
 * Conserva lo que ya está listo y no cambió, salvo que se pida rehacerlo todo.
 */
export async function generateAssets(options: {
  supabase: SupabaseClient;
  videoId: string;
  project: ProjectInput;
  visuals: VisualSlot[];
  formats: FormatId[];
  existing: Asset[];
  force: boolean;
}): Promise<Asset[]> {
  const { supabase, videoId, project, visuals, formats, existing, force } = options;
  // Solo vertical: clips verticales. Con horizontal (solo o junto al vertical): clips horizontales.
  const orientation: Orientation = formats.length === 1 && formats[0] === '9:16' ? 'portrait' : 'landscape';

  type Job = { slot: VisualSlot; index: number; format: FormatId | 'any' };
  const jobs: Job[] = visuals.flatMap((slot, index): Job[] =>
    slot.type === 'pexels_clip' ? [{ slot, index, format: 'any' }] : formats.map((format) => ({ slot, index, format })),
  );

  return pool(jobs, 3, async ({ slot, index, format }) => {
    const previous = existing.find((a) => a.index === index && a.format === format);
    const reusable = !force && previous?.status === 'done' && previous.type === slot.type && previous.prompt === slot.prompt;
    return reusable ? previous : makeAsset(supabase, videoId, project, slot, index, format, orientation);
  });
}
