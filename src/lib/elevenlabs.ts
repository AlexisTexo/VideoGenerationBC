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

export type SpeechResult =
  | { ok: true; audio: Uint8Array; alignment: import('./video-script').Alignment }
  | { ok: false; reason: 'config' | 'not_found' | 'auth' | 'quota' | 'request' };

const DEFAULT_MODEL = 'eleven_multilingual_v2';

/** Convierte el texto en voz (mp3) y devuelve también el tiempo de cada carácter. */
export async function synthesize(voiceId: string, text: string): Promise<SpeechResult> {
  const key = import.meta.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, reason: 'config' };

  let response: Response;
  try {
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: import.meta.env.ELEVENLABS_MODEL || DEFAULT_MODEL }),
        signal: AbortSignal.timeout(120_000),
      },
    );
  } catch {
    return { ok: false, reason: 'request' };
  }

  if (response.status === 404 || response.status === 400) return { ok: false, reason: 'not_found' };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: 'auth' };
  if (response.status === 402 || response.status === 429) return { ok: false, reason: 'quota' };
  if (!response.ok) {
    console.error('ElevenLabs TTS error', response.status, (await response.text()).slice(0, 300));
    return { ok: false, reason: 'request' };
  }

  const data = (await response.json()) as {
    audio_base64?: string;
    alignment?: import('./video-script').Alignment | null;
  };
  if (!data.audio_base64 || !data.alignment) return { ok: false, reason: 'request' };
  const audio = Uint8Array.from(atob(data.audio_base64), (char) => char.charCodeAt(0));
  return { ok: true, audio, alignment: data.alignment };
}
