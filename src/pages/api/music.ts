import type { APIRoute } from 'astro';
import { generateMusic, MAX_MUSIC_BYTES, MUSIC_COLUMNS, musicExtension, sniffAudio } from '../../lib/music';
import { isUuid } from '../../lib/projects';
import { ASSET_BUCKET } from '../../lib/video-assets';
import { canCreate } from '../../lib/video-data';

export const prerender = false;

/** Biblioteca de música: subir, generar, marcar como predeterminada y borrar (campo "action"). */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: video } = await supabase.from('videos').select('id, project_id, target_seconds, audio_seconds').eq('id', videoId).maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const back = (query: string) => redirect(`/projects/${video.project_id}/videos/${video.id}?step=audio&${query}`, 303);
  // Los botones de cada pista envían "default:<id>" o "delete:<id>" en un solo campo.
  const [action, inlineId] = String(form.get('action') ?? '').split(':');
  const makeDefault = form.get('make_default') === 'on';

  /** Guarda el archivo y la fila; si el archivo falla, no deja la fila huérfana. */
  const save = async (name: string, bytes: Uint8Array, mime: string, source: 'upload' | 'generated', prompt: string) => {
    const id = crypto.randomUUID();
    const path = `music/${id}.${musicExtension(mime)}`;
    const { error: uploadError } = await supabase.storage.from(ASSET_BUCKET).upload(path, bytes, { contentType: mime });
    if (uploadError) {
      console.error('subir música falló:', uploadError.message);
      return false;
    }
    if (makeDefault) await supabase.from('music_tracks').update({ is_default: false }).eq('is_default', true);
    const { error } = await supabase
      .from('music_tracks')
      .insert({ id, name, path, mime, source, prompt, is_default: makeDefault });
    if (error) {
      console.error('guardar pista falló:', error.code, error.message);
      await supabase.storage.from(ASSET_BUCKET).remove([path]);
      return false;
    }
    return true;
  };

  if (action === 'upload') {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return back('error=music_file');
    if (file.size > MAX_MUSIC_BYTES) return back('error=music_size');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffAudio(bytes);
    if (!mime) return back('error=music_file');
    const name = (String(form.get('name') ?? '').trim() || file.name.replace(/\.[^.]+$/, '')).slice(0, 100);
    return (await save(name || 'Música', bytes, mime, 'upload', '')) ? back('ok=music') : back('error=music_save');
  }

  if (action === 'generate') {
    const prompt = String(form.get('prompt') ?? '').trim().slice(0, 500);
    if (prompt.length < 5) return back('error=music_prompt');
    const result = await generateMusic(prompt, video.audio_seconds ?? video.target_seconds);
    if (!result.ok) return back(`error=music_${result.reason}`);
    const name = (String(form.get('name') ?? '').trim() || prompt).slice(0, 100);
    return (await save(name, result.bytes, 'audio/mpeg', 'generated', prompt)) ? back('ok=music') : back('error=music_save');
  }

  const trackId = inlineId ?? '';
  if (!isUuid(trackId)) return back('error=music_save');

  if (action === 'default') {
    // Una sola predeterminada: se quita la anterior y se marca esta (o se quita si ya lo era).
    const { data: track } = await supabase.from('music_tracks').select(MUSIC_COLUMNS).eq('id', trackId).maybeSingle();
    if (!track) return back('error=music_save');
    await supabase.from('music_tracks').update({ is_default: false }).eq('is_default', true);
    if (!track.is_default) await supabase.from('music_tracks').update({ is_default: true }).eq('id', trackId);
    return back(track.is_default ? 'ok=music_default_off' : 'ok=music_default');
  }

  if (action === 'delete') {
    const { data: track } = await supabase.from('music_tracks').select('path').eq('id', trackId).maybeSingle();
    if (!track) return back('error=music_save');
    const { error } = await supabase.from('music_tracks').delete().eq('id', trackId);
    if (error) return back('error=music_save');
    await supabase.storage.from(ASSET_BUCKET).remove([track.path]);
    return back('ok=music_deleted');
  }

  return new Response('Acción no válida', { status: 400 });
};
