import type { APIRoute } from 'astro';
import { loadPackageSource } from '../../../lib/package-source';
import { buildBrief, buildTimeline } from '../../../lib/video-package';

export const prerender = false;

const FILES = ['timeline.json', 'brief.md'] as const;

/** Descarga un archivo del paquete: GET ?generation_id=... (o video_id=..., la vigente) &file=timeline.json|brief.md */
export const GET: APIRoute = async ({ url, locals }) => {
  const file = url.searchParams.get('file') ?? '';
  if (!(FILES as readonly string[]).includes(file)) return new Response('No encontrado', { status: 404 });

  const source = await loadPackageSource(locals.supabase, {
    videoId: url.searchParams.get('video_id') ?? undefined,
    generationId: url.searchParams.get('generation_id') ?? undefined,
  });
  if (!source) return new Response('No encontrado', { status: 404 });

  const body =
    file === 'timeline.json'
      ? JSON.stringify(buildTimeline(source.project, source.video, source.code), null, 2)
      : buildBrief(source.project, source.video, source.code);

  return new Response(body, {
    headers: {
      'content-type': file === 'timeline.json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${file}"`,
    },
  });
};
