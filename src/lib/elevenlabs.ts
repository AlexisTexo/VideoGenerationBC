export const VOICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;

export interface VoiceInfo {
  name: string;
  previewUrl: string;
}

export type VoiceResult =
  | { ok: true; voice: VoiceInfo }
  | { ok: false; reason: 'config' | 'not_found' | 'auth' | 'request' };

/** Busca una voz por su ID para mostrar el nombre y una muestra de audio. */
export async function lookupVoice(voiceId: string): Promise<VoiceResult> {
  const key = import.meta.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, reason: 'config' };

  let response: Response;
  try {
    response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, reason: 'request' };
  }

  if (response.status === 404 || response.status === 400 || response.status === 422) {
    return { ok: false, reason: 'not_found' };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, reason: 'auth' };
  if (!response.ok) return { ok: false, reason: 'request' };

  const data = (await response.json()) as { name?: string; preview_url?: string | null };
  return { ok: true, voice: { name: data.name ?? '', previewUrl: data.preview_url ?? '' } };
}
