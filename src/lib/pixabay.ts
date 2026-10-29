export type Orientation = 'portrait' | 'landscape';

export interface Clip {
  url: string;
  credit: string;
  seconds: number;
  /** Orientación real del clip, que puede no ser la pedida. */
  orientation: Orientation;
  /** Página del clip en Pixabay: sirve para no repetirlo al pedir otro. */
  source: string;
}

interface PixabayHit {
  duration?: number;
  isLowQuality?: boolean;
  user?: string;
  pageURL?: string;
  videos?: Record<string, { url?: string; size?: number; width?: number; height?: number } | undefined>;
}

export type ClipResult = { ok: true; clip: Clip } | { ok: false; reason: 'config' | 'none' | 'request' };

const SIZES = ['medium', 'small', 'large', 'tiny'] as const;

async function search(key: string, query: string, perPage: number): Promise<PixabayHit[] | null> {
  const url = new URL('https://pixabay.com/api/videos/');
  url.searchParams.set('key', key);
  url.searchParams.set('q', query.slice(0, 100));
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('safesearch', 'true');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    return ((await response.json()) as { hits?: PixabayHit[] }).hits ?? [];
  } catch {
    return null;
  }
}

const orientationOf = (hit: PixabayHit): Orientation | null => {
  const size = SIZES.find((s) => hit.videos?.[s]?.url);
  const v = size ? hit.videos?.[size] : undefined;
  return v?.width && v?.height ? (v.height > v.width ? 'portrait' : 'landscape') : null;
};

/**
 * Busca un clip de Pixabay: buena calidad, de la orientación pedida y que dure lo necesario (o el más largo).
 * Casi todo el catálogo es horizontal, así que para vertical se miran más resultados y, si hace falta, búsquedas
 * más generales (la frase completa, sus dos primeras palabras y la primera). Si no hay ninguno vertical, se
 * devuelve uno horizontal y `clip.orientation` lo dice, para recortarlo al editar o pedir otro.
 * `exclude` son páginas de clips que no se deben repetir.
 */
export async function findClip(
  query: string,
  neededSeconds: number,
  orientation: Orientation = 'landscape',
  exclude: string[] = [],
): Promise<ClipResult> {
  const key = import.meta.env.PIXABAY_API_KEY;
  if (!key) return { ok: false, reason: 'config' };

  const words = query.split(/\s+/).filter(Boolean);
  const queries = [...new Set([query, words.slice(0, 2).join(' '), words[0] ?? ''].filter(Boolean))];
  const perPage = orientation === 'portrait' ? 50 : 20;

  const pool: PixabayHit[] = [];
  let answered = false;
  for (const q of queries) {
    const hits = await search(key, q, perPage);
    if (hits === null) continue;
    answered = true;
    for (const hit of hits) {
      const usable = !hit.isLowQuality && SIZES.some((s) => hit.videos?.[s]?.url) && !exclude.includes(hit.pageURL ?? '');
      if (usable && !pool.some((p) => p.pageURL === hit.pageURL)) pool.push(hit);
    }
    // Basta con un resultado que cumpla la orientación; si no, se prueba una búsqueda más general.
    if (pool.some((h) => orientationOf(h) === orientation)) break;
  }
  if (!answered) return { ok: false, reason: 'request' };
  if (!pool.length) return { ok: false, reason: 'none' };

  const matching = pool.filter((h) => orientationOf(h) === orientation);
  const usable = matching.length ? matching : pool;
  const longEnough = usable.filter((h) => (h.duration ?? 0) >= neededSeconds);
  const best = longEnough.length ? longEnough[0] : [...usable].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
  const size = SIZES.find((s) => best.videos?.[s]?.url)!;

  return {
    ok: true,
    clip: {
      url: best.videos![size]!.url!,
      credit: `${best.user ?? 'Pixabay'} · ${best.pageURL ?? 'https://pixabay.com'}`,
      seconds: best.duration ?? 0,
      orientation: orientationOf(best) ?? 'landscape',
      source: best.pageURL ?? '',
    },
  };
}

const MAX_CLIP_BYTES = 40 * 1024 * 1024;

/** Descarga el clip (solo desde el CDN de Pixabay, por https). */
export async function downloadClip(url: string): Promise<Uint8Array | null> {
  try {
    const source = new URL(url);
    if (source.protocol !== 'https:' || !source.hostname.endsWith('pixabay.com')) return null;
    const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_CLIP_BYTES) return null;
    // Pixabay sirve los mp4 como binary/octet-stream: se comprueba el contenido (caja "ftyp").
    const isMp4 = String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
    return isMp4 ? bytes : null;
  } catch {
    return null;
  }
}
