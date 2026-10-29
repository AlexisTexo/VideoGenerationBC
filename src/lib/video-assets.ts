import type { SupabaseClient } from '@supabase/supabase-js';
import { AiError, generateImage } from './gemini';
import { downloadClip, findClip } from './pixabay';
import type { ProjectInput } from './projects';
import type { VisualSlot, VisualType } from './video-ai';

export const ASSET_BUCKET = 'video-assets';

/** Una imagen o clip generado, alineado por posición con videos.visuals. */
export interface Asset {
  index: number;
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

/** Ruta del archivo dentro del paquete (sin el id del video). */
export const packageName = (path: string, videoId: string) => path.replace(`${videoId}/`, '');

const pad = (n: number) => String(n).padStart(2, '0');

function imagePrompt(project: ProjectInput, slot: VisualSlot): string {
  const palette = project.brand_colors.map((c) => `${c.name} ${c.hex}`).join(', ');
  const rules = project.rules.trim().slice(0, 500);
  return [
    slot.prompt,
    palette ? `Use this brand color palette: ${palette}.` : '',
    'Vertical 9:16 composition, clean modern look. No text, no logos, no watermarks.',
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
): Promise<Asset> {
  const base = { index, type: slot.type, prompt: slot.prompt, mime: '', path: '' };
  const fail = (error: string): Asset => ({ ...base, status: 'error', error });

  if (slot.type === 'gemini_image') {
    try {
      const image = await generateImage(imagePrompt(project, slot));
      const path = `${videoId}/assets/${pad(index + 1)}.${EXTENSIONS[image.mime]}`;
      if (!(await upload(supabase, path, image.bytes, image.mime))) return fail('No se pudo guardar la imagen.');
      return { ...base, status: 'done', path, mime: image.mime };
    } catch (error) {
      if (error instanceof AiError) {
        return fail(error.code === 'config' ? 'Falta GEMINI_API_KEY en el .env.' : error.message);
      }
      return fail('No se pudo generar la imagen.');
    }
  }

  const found = await findClip(slot.prompt, slot.end - slot.start);
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
  const path = `${videoId}/assets/${pad(index + 1)}.mp4`;
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
 * Genera las imágenes (Gemini) y baja los clips (Pixabay) del plan de visuales.
 * Conserva lo que ya está listo y no cambió, salvo que se pida rehacerlo todo.
 */
export async function generateAssets(options: {
  supabase: SupabaseClient;
  videoId: string;
  project: ProjectInput;
  visuals: VisualSlot[];
  existing: Asset[];
  force: boolean;
}): Promise<Asset[]> {
  const { supabase, videoId, project, visuals, existing, force } = options;

  return pool(visuals, 3, async (slot, index) => {
    const previous = existing[index];
    const reusable =
      !force && previous?.status === 'done' && previous.type === slot.type && previous.prompt === slot.prompt;
    return reusable ? previous : makeAsset(supabase, videoId, project, slot, index);
  });
}
