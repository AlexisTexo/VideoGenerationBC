import type { APIRoute } from 'astro';
import { VOICE_ID_RE, lookupVoice } from '../../../lib/elevenlabs';
import { VOICE_COLUMNS, storePreview } from '../../../lib/voices';
import { canCreate, json } from '../../../lib/video-data';

export const prerender = false;

/** Guarda una voz en la biblioteca: nombre y copia de la muestra, consultados en ElevenLabs. */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!canCreate(locals.role)) return json({ error: 'forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as { voice_id?: string } | null;
  const voiceId = String(body?.voice_id ?? '').trim();
  if (!VOICE_ID_RE.test(voiceId)) return json({ error: 'invalid' }, 400);

  const result = await lookupVoice(voiceId);
  if (!result.ok) {
    return json({ error: result.reason }, result.reason === 'not_found' ? 404 : result.reason === 'config' ? 501 : 502);
  }

  const { supabase } = locals;
  // Si la voz ya está guardada, se conserva su nombre (puede haberlo cambiado el usuario).
  const { data: existing } = await supabase.from('voices').select('name').eq('voice_id', voiceId).maybeSingle();
  const previewUrl = await storePreview(supabase, voiceId, result.voice.previewUrl);

  const { data, error } = await supabase
    .from('voices')
    .upsert(
      { voice_id: voiceId, name: (existing?.name || result.voice.name).slice(0, 100), preview_url: previewUrl },
      { onConflict: 'voice_id' },
    )
    .select(VOICE_COLUMNS)
    .single();

  if (error || !data) {
    console.error('guardar voz falló:', error?.code, error?.message);
    return json({ error: 'save' }, 500);
  }
  return json({ voice: data });
};
