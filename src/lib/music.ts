export interface MusicTrack {
  id: string;
  name: string;
  path: string;
  mime: string;
  source: 'upload' | 'generated';
  prompt: string;
  is_default: boolean;
}

export const MUSIC_COLUMNS = 'id, name, path, mime, source, prompt, is_default';
export const MAX_MUSIC_BYTES = 15 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
};

export const musicExtension = (mime: string) => EXTENSIONS[mime] ?? 'mp3';

/** Reconoce el audio por su contenido (no por el nombre ni el tipo que declara el navegador). */
export function sniffAudio(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  if (ascii(4, 8) === 'ftyp') return 'audio/mp4';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  return null;
}

export type MusicResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: 'config' | 'auth' | 'quota' | 'invalid' | 'request' };

/** Genera música instrumental con ElevenLabs (3 s a 10 min). */
export async function generateMusic(prompt: string, seconds: number): Promise<MusicResult> {
  const key = import.meta.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, reason: 'config' };

  const length = Math.min(600_000, Math.max(3_000, Math.round(seconds * 1000)));
  let response: Response;
  try {
    response = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, music_length_ms: length, force_instrumental: true }),
      signal: AbortSignal.timeout(240_000),
    });
  } catch {
    return { ok: false, reason: 'request' };
  }

  if (response.status === 401 || response.status === 403) return { ok: false, reason: 'auth' };
  if (response.status === 402 || response.status === 429) return { ok: false, reason: 'quota' };
  if (response.status === 400 || response.status === 422) {
    console.error('ElevenLabs música rechazada', response.status, (await response.text()).slice(0, 300));
    return { ok: false, reason: 'invalid' };
  }
  if (!response.ok) return { ok: false, reason: 'request' };

  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > 0 ? { ok: true, bytes } : { ok: false, reason: 'request' };
}
