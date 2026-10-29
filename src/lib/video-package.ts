import { projectToContext } from './project-context';
import type { ProjectInput } from './projects';
import type { Scene, VisualSlot } from './video-ai';
import type { Word } from './video-script';

export interface PackageVideo {
  title: string;
  idea: string;
  voice_id: string;
  voice_name: string;
  target_seconds: number;
  audio_seconds: number | null;
  script: Scene[];
  visuals: VisualSlot[];
  words: Word[];
}

/** El video como datos: lo que lee Remotion o Hyperframes para editarlo. */
export function buildTimeline(project: ProjectInput, video: PackageVideo) {
  return {
    title: video.title,
    idea: video.idea,
    durationSeconds: video.audio_seconds ?? video.script.at(-1)?.end ?? video.target_seconds,
    brand: { name: project.name, colors: project.brand_colors },
    voice: { id: video.voice_id, name: video.voice_name },
    audio: video.audio_seconds ? { file: 'voiceover.mp3', seconds: video.audio_seconds } : null,
    scenes: video.script,
    visuals: video.visuals,
    subtitles: video.words,
  };
}

/** Instrucciones para quien edite el video (Claude con Hyperframes o Remotion). */
export function buildBrief(project: ProjectInput, video: PackageVideo): string {
  const scenes = video.script.map((s) => `- [${s.start}–${s.end} s] ${s.narration}`).join('\n');
  const visuals = video.visuals
    .map((v) => `- [${v.start}–${v.end} s] ${v.type === 'gemini_image' ? 'Imagen' : 'Video de stock'}: ${v.prompt}`)
    .join('\n');

  return `# Brief del video: ${video.title || project.name}

Edita este video con Hyperframes o Remotion. Los datos exactos están en \`timeline.json\`.

## Qué hacer
- Duración total: ${video.audio_seconds ?? video.target_seconds} s, que es lo que dura la voz (\`voiceover.mp3\`).
- Sincroniza cada escena y cada visual con sus tiempos.
- Subtítulos palabra por palabra con los tiempos de \`subtitles\` en \`timeline.json\`.
- Usa los colores de la marca y respeta las reglas del producto.

## Idea
${video.idea}

## Guion
${scenes}

## Visuales planeados
${visuals || '(sin plan de visuales)'}

---

${projectToContext(project)}
`;
}
