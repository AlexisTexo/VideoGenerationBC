import type { APIRoute } from 'astro';
import { PROJECT_COLUMNS, isUuid, type Project } from '../../../lib/projects';
import { buildBrief, buildTimeline, type PackageVideo } from '../../../lib/video-package';

export const prerender = false;

const FILES = ['timeline.json', 'brief.md'] as const;

/** Descarga un archivo del paquete: GET ?video_id=...&file=timeline.json|brief.md */
export const GET: APIRoute = async ({ url, locals }) => {
  const videoId = url.searchParams.get('video_id') ?? '';
  const file = url.searchParams.get('file') ?? '';
  if (!isUuid(videoId) || !(FILES as readonly string[]).includes(file)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data: video } = await supabase
    .from('videos')
    .select('title, idea, voice_id, voice_name, target_seconds, audio_seconds, script, visuals, words, project_id')
    .eq('id', videoId)
    .maybeSingle();
  if (!video) return new Response('No encontrado', { status: 404 });

  const { data } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', video.project_id).maybeSingle();
  const project = data as unknown as Project | null;
  if (!project) return new Response('No encontrado', { status: 404 });

  const packaged = video as unknown as PackageVideo;
  const body = file === 'timeline.json' ? JSON.stringify(buildTimeline(project, packaged), null, 2) : buildBrief(project, packaged);

  return new Response(body, {
    headers: {
      'content-type': file === 'timeline.json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${file}"`,
    },
  });
};
