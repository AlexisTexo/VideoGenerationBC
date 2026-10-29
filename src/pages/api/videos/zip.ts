import type { APIRoute } from 'astro';
import { PROJECT_COLUMNS, isUuid, type Project } from '../../../lib/projects';
import { ASSET_BUCKET, normalizeAssets, packageName } from '../../../lib/video-assets';
import { loadMusic } from '../../../lib/video-data';
import { buildBrief, buildTimeline, musicFileName, type PackageVideo } from '../../../lib/video-package';
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

/** Descarga todo el paquete en un ZIP: voz, imágenes, clips, timeline.json, brief.md y créditos. */
export const GET: APIRoute = async ({ url, locals }) => {
  const videoId = url.searchParams.get('video_id') ?? '';
  if (!isUuid(videoId)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: video } = await supabase
    .from('videos')
    .select('title, idea, voice_id, voice_name, target_seconds, audio_seconds, audio_path, script, visuals, words, assets, formats, sfx, music_track_id, project_id')
    .eq('id', videoId)
    .maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const { data } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', video.project_id).maybeSingle();
  const project = data as unknown as Project | null;
  if (!project) return new Response('No encontrado', { status: 404 });

  const { music } = await loadMusic(supabase, video.music_track_id);
  const packaged = { ...video, assets: normalizeAssets(video.assets), music } as unknown as PackageVideo;
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { name: 'timeline.json', data: encoder.encode(JSON.stringify(buildTimeline(project, packaged, videoId), null, 2)) },
    { name: 'brief.md', data: encoder.encode(buildBrief(project, packaged, videoId)) },
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

  if (music) {
    const bytes = await download(music.path);
    if (bytes) entries.push({ name: musicFileName(music.path), data: bytes });
  }

  const credits: string[] = [];
  for (const asset of packaged.assets) {
    if (asset.status !== 'done') continue;
    const name = packageName(asset.path, videoId);
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
      'content-disposition': `attachment; filename="${slug(video.title || 'video')}.zip"`,
    },
  });
};
