import type { APIRoute } from 'astro';
import { loadPackageSource } from '../../../lib/package-source';
import { ASSET_BUCKET, packageName } from '../../../lib/video-assets';
import { buildBrief, buildTimeline, musicFileName } from '../../../lib/video-package';
import { createZip, type ZipEntry } from '../../../lib/zip';

export const prerender = false;

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'video';

/**
 * Descarga el paquete en un ZIP: voz, música, imágenes, clips, timeline.json, brief.md y créditos.
 * GET ?generation_id=... (una versión concreta) o ?video_id=... (la vigente). El ZIP se llama como la
 * generación (GEN-00012.zip) para poder rastrearlo.
 */
export const GET: APIRoute = async ({ url, locals }) => {
  const source = await loadPackageSource(locals.supabase, {
    videoId: url.searchParams.get('video_id') ?? undefined,
    generationId: url.searchParams.get('generation_id') ?? undefined,
  });
  if (!source) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { project, video, code } = source;
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { name: 'timeline.json', data: encoder.encode(JSON.stringify(buildTimeline(project, video, code), null, 2)) },
    { name: 'brief.md', data: encoder.encode(buildBrief(project, video, code)) },
  ];

  const download = async (path: string) => {
    const { data: blob, error } = await supabase.storage.from(ASSET_BUCKET).download(path);
    if (error || !blob) {
      console.error('descargar archivo falló:', path, error?.message);
      return null;
    }
    return new Uint8Array(await blob.arrayBuffer());
  };

  if (video.audio_path) {
    const audio = await download(video.audio_path);
    if (audio) entries.push({ name: 'voiceover.mp3', data: audio });
  }

  if (video.music) {
    const bytes = await download(video.music.path);
    if (bytes) entries.push({ name: musicFileName(video.music.path), data: bytes });
  }

  const credits: string[] = [];
  for (const asset of video.assets) {
    if (asset.status !== 'done') continue;
    const name = packageName(asset.path);
    if (entries.some((e) => e.name === name)) continue;
    const bytes = await download(asset.path);
    if (!bytes) continue;
    entries.push({ name, data: bytes });
    if (asset.credit) credits.push(`${name}: ${asset.credit}`);
  }
  if (credits.length) {
    entries.push({ name: 'creditos.txt', data: encoder.encode(`Clips de Pixabay\n\n${credits.join('\n')}\n`) });
  }

  return new Response(createZip(entries), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${code || slug(video.title || 'video')}.zip"`,
    },
  });
};
