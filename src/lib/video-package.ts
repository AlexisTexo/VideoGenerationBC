import { projectToContext } from './project-context';
import type { ProjectInput } from './projects';
import type { Scene, VisualSlot } from './video-ai';
import { assetFor, packageName, type Asset } from './video-assets';
import { buildCues, FORMATS, isFormatId, type FormatId } from './video-format';
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
  assets: Asset[];
  formats: string[];
  sfx: boolean;
  /** Música elegida para el video (de la biblioteca), si hay. */
  music: { name: string; path: string } | null;
}

export const MUSIC_VOLUME = 0.15;

const formatsOf = (video: PackageVideo): FormatId[] => {
  const list = video.formats.filter(isFormatId);
  return list.length ? list : ['9:16'];
};

export const musicFileName = (path: string) => `music.${path.split('.').pop() ?? 'mp3'}`;

/** Archivo de cada visual dentro del paquete: una imagen por formato, un clip para todos. */
export function visualFiles(video: PackageVideo, videoId: string) {
  return video.visuals.map((slot, i) => {
    const files: Record<string, string> = {};
    let credit: string | null = null;
    const wanted = slot.type === 'pexels_clip' ? (['any'] as const) : formatsOf(video);
    for (const format of wanted) {
      const asset = assetFor(video.assets, i, slot, format === 'any' ? '9:16' : format);
      if (asset?.status === 'done') {
        files[format] = packageName(asset.path, videoId);
        credit = asset.credit ?? credit;
      }
    }
    return { files, credit };
  });
}

/** El video como datos: lo que lee Remotion o Hyperframes para editarlo. */
export function buildTimeline(project: ProjectInput, video: PackageVideo, videoId = '') {
  const files = visualFiles(video, videoId);

  return {
    title: video.title,
    idea: video.idea,
    durationSeconds: video.audio_seconds ?? video.script.at(-1)?.end ?? video.target_seconds,
    brand: { name: project.name, colors: project.brand_colors },
    // Un bloque por formato: medidas, zona segura y subtítulos ya agrupados para que quepan.
    formats: formatsOf(video).map((id) => {
      const spec = FORMATS[id];
      return {
        id,
        width: spec.width,
        height: spec.height,
        platforms: spec.platforms,
        subtitles: { ...spec.subtitles, cues: buildCues(video.words, id) },
      };
    }),
    audio: {
      voiceover: video.audio_seconds ? { file: 'voiceover.mp3', seconds: video.audio_seconds, voice: video.voice_name } : null,
      music: video.music ? { file: musicFileName(video.music.path), name: video.music.name, volume: MUSIC_VOLUME } : null,
      soundEffects: video.sfx,
    },
    scenes: video.script,
    visuals: video.visuals.map((v, i) => ({ ...v, ...files[i] })),
    words: video.words,
  };
}

/** Instrucciones para quien edite el video (Claude con Hyperframes o Remotion). */
export function buildBrief(project: ProjectInput, video: PackageVideo, videoId = ''): string {
  const files = visualFiles(video, videoId);
  const formats = formatsOf(video);
  const scenes = video.script.map((s) => `- [${s.start}–${s.end} s] ${s.narration}`).join('\n');
  const visuals = video.visuals
    .map((v, i) => {
      const list = Object.values(files[i].files);
      const where = list.length ? ` → ${list.join(', ')}` : ' (sin archivo)';
      return `- [${v.start}–${v.end} s] ${v.type === 'gemini_image' ? 'Imagen' : 'Video de stock'}: ${v.prompt}${where}`;
    })
    .join('\n');
  const formatLines = formats
    .map((id) => {
      const f = FORMATS[id];
      const { safe } = f.subtitles;
      return `- ${f.label} (${f.width}×${f.height}, ${f.platforms}): subtítulos solo dentro de la zona segura; márgenes libres arriba ${safe.top}, abajo ${safe.bottom}, izquierda ${safe.left} y derecha ${safe.right} px.`;
    })
    .join('\n');

  return `# Brief del video: ${video.title || project.name}

Edita este video con Hyperframes o Remotion. Los datos exactos están en \`timeline.json\`.

## Formatos a entregar
${formatLines}
Entrega un render por formato. Las imágenes ya vienen generadas para cada formato; los clips de stock sirven para todos y se recortan al encuadre.

## Qué hacer
- Duración total: ${video.audio_seconds ?? video.target_seconds} s, que es lo que dura la voz (\`voiceover.mp3\`).
- Sincroniza cada escena y cada visual con sus tiempos.
- Subtítulos: usa \`formats[].subtitles.cues\` (ya agrupados para que quepan en la caja de cada formato) con su \`box\`, \`fontSize\` y zona segura. Resalta la palabra activa con \`words\`.
- Música de fondo: ${video.music ? `\`${musicFileName(video.music.path)}\` ("${video.music.name}") al ${Math.round(MUSIC_VOLUME * 100)} % de volumen; bájala aún más mientras habla la voz y desvánécela al final.` : 'no se eligió música.'}
- Efectos de sonido: ${video.sfx ? 'sí. Añade efectos discretos en las transiciones y los momentos clave (puedes buscarlos con la skill media-use), sin tapar la voz.' : 'no.'}
- Las imágenes y clips están en la carpeta \`assets/\`; cada visual de \`timeline.json\` indica su archivo en \`files\`.
- Los clips de Pixabay llevan crédito (\`credit\`): incluye la atribución si publicas.
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
