export interface Clip {
  url: string;
  credit: string;
  seconds: number;
}

interface PixabayHit {
  duration?: number;
  isLowQuality?: boolean;
  user?: string;
  pageURL?: string;
  videos?: Record<string, { url?: string; size?: number } | undefined>;
}

export type ClipResult = { ok: true; clip: Clip } | { ok: false; reason: 'config' | 'none' | 'request' };

const SIZES = ['medium', 'small', 'large', 'tiny'] as const;

async function search(key: string, query: string): Promise<PixabayHit[] | null> {
  const url = new URL('https://pixabay.com/api/videos/');
  url.searchParams.set('key', key);
  url.searchParams.set('q', query.slice(0, 100));
  url.searchParams.set('per_page', '10');
  url.searchParams.set('safesearch', 'true');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    return ((await response.json()) as { hits?: PixabayHit[] }).hits ?? [];
  } catch {
    return null;
  }
}

/** Busca un clip de Pixabay para la escena: el de buena calidad que dure lo necesario, o el más largo. */
export async function findClip(query: string, neededSeconds: number): Promise<ClipResult> {
  const key = import.meta.env.PIXABAY_API_KEY;
  if (!key) return { ok: false, reason: 'config' };

  let hits = await search(key, query);
  if (hits === null) return { ok: false, reason: 'request' };
  if (!hits.length) {
    // Sin resultados: se reintenta con las dos primeras palabras.
    const shorter = query.split(/\s+/).slice(0, 2).join(' ');
    if (shorter && shorter !== query) hits = (await search(key, shorter)) ?? [];
  }

  const usable = hits.filter((h) => !h.isLowQuality && SIZES.some((s) => h.videos?.[s]?.url));
  if (!usable.length) return { ok: false, reason: 'none' };

  const longEnough = usable.filter((h) => (h.duration ?? 0) >= neededSeconds);
  const best = longEnough.length ? longEnough[0] : [...usable].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
  const size = SIZES.find((s) => best.videos?.[s]?.url)!;

  return {
    ok: true,
    clip: {
      url: best.videos![size]!.url!,
      credit: `${best.user ?? 'Pixabay'} · ${best.pageURL ?? 'https://pixabay.com'}`,
      seconds: best.duration ?? 0,
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
