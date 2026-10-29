import type { APIRoute } from 'astro';
import { VOICE_ID_RE, lookupVoice } from '../../../lib/elevenlabs';
import { json } from '../../../lib/video-data';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const id = (url.searchParams.get('id') ?? '').trim();
  if (!VOICE_ID_RE.test(id)) {
    return json({ error: 'invalid' }, 400);
  }

  const result = await lookupVoice(id);
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : result.reason === 'config' ? 501 : 502;
    return json({ error: result.reason }, status);
  }
  return json(result.voice);
};
