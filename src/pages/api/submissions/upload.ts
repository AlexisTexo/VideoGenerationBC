import type { APIRoute } from 'astro';
import { MAX_UPLOAD_BYTES, compressVideo } from '../../../lib/compress';
import { isUuid } from '../../../lib/projects';
import { FINAL_BUCKET, submissionCode } from '../../../lib/submissions';
import { canCreate } from '../../../lib/video-data';

export const prerender = false;

// Sin ffmpeg en el servidor solo se acepta lo que ya viene ligero.
const RAW_LIMIT_BYTES = 50 * 1024 * 1024;

/**
 * Sube el video ya editado. Se guarda solo una copia ligera (720p) para revisar; el original
 * en máxima calidad se queda con quien lo editó. Cada subida es una versión nueva y la
 * anterior pendiente queda como reemplazada.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canCreate(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const videoId = String(form.get('video_id') ?? '');
  const note = String(form.get('note') ?? '').trim().slice(0, 500);
  const file = form.get('file');
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: video } = await supabase
    .from('videos')
    .select('id, project_id, current_generation_id')
    .eq('id', videoId)
    .maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const back = (query: string) => redirect(`/projects/${video.project_id}/videos/${video.id}?step=entrega&${query}`, 303);

  if (!(file instanceof File) || file.size === 0) return back('error=file');
  if (file.size > MAX_UPLOAD_BYTES) return back('error=size');
  if (!/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name) && !file.type.startsWith('video/')) return back('error=type');

  const compressed = await compressVideo(file);
  let video_bytes: Uint8Array<ArrayBuffer>;
  let poster: Uint8Array<ArrayBuffer> | null = null;
  let meta: { width: number | null; height: number | null; seconds: number | null; original: number };

  if (compressed.ok) {
    video_bytes = compressed.result.video;
    poster = compressed.result.poster;
    meta = {
      width: compressed.result.width || null,
      height: compressed.result.height || null,
      seconds: compressed.result.seconds,
      original: compressed.result.originalBytes,
    };
  } else if (compressed.reason === 'no_ffmpeg') {
    if (file.size > RAW_LIMIT_BYTES || file.type !== 'video/mp4') return back('error=no_ffmpeg');
    video_bytes = new Uint8Array(await file.arrayBuffer());
    meta = { width: null, height: null, seconds: null, original: file.size };
  } else {
    return back(`error=${compressed.reason}`);
  }

  const { data: last } = await supabase
    .from('submissions')
    .select('version')
    .eq('video_id', video.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: row, error } = await supabase
    .from('submissions')
    .insert({
      video_id: video.id,
      project_id: video.project_id,
      generation_id: video.current_generation_id ?? null,
      version: (Number(last?.version) || 0) + 1,
      file_path: '',
      file_bytes: video_bytes.byteLength,
      original_bytes: meta.original,
      width: meta.width,
      height: meta.height,
      seconds: meta.seconds,
      note,
      uploaded_by_email: (locals.user?.email ?? '').slice(0, 200),
    })
    .select('id, number')
    .single();
  if (error || !row) {
    console.error('crear entrega falló:', error?.code, error?.message);
    return back('error=save');
  }

  const base = `${video.id}/${submissionCode(Number(row.number))}`;
  const filePath = `${base}.mp4`;
  const posterPath = poster ? `${base}.jpg` : '';

  const uploaded = await supabase.storage.from(FINAL_BUCKET).upload(filePath, video_bytes, { contentType: 'video/mp4', upsert: true });
  if (uploaded.error) {
    console.error('subir video final falló:', uploaded.error.message);
    await supabase.from('submissions').delete().eq('id', row.id);
    return back('error=final_upload');
  }
  if (poster) {
    const up = await supabase.storage.from(FINAL_BUCKET).upload(posterPath, poster, { contentType: 'image/jpeg', upsert: true });
    if (up.error) console.error('subir portada falló:', up.error.message);
  }

  const { error: updateError } = await supabase
    .from('submissions')
    .update({ file_path: filePath, poster_path: posterPath })
    .eq('id', row.id);
  if (updateError) {
    console.error('guardar ruta de entrega falló:', updateError.message);
    await supabase.storage.from(FINAL_BUCKET).remove([filePath, posterPath].filter(Boolean));
    await supabase.from('submissions').delete().eq('id', row.id);
    return back('error=save');
  }

  // Las versiones anteriores sin resolver quedan reemplazadas por esta.
  await supabase
    .from('submissions')
    .update({ status: 'replaced' })
    .eq('video_id', video.id)
    .neq('id', row.id)
    .in('status', ['pending', 'changes_requested']);

  return redirect(`/approvals/${row.id}?ok=uploaded`, 303);
};
