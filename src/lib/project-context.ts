import { ASPECTS, LANGUAGES, PLATFORMS, SUBTITLE_POSITIONS, type ProjectInput } from './projects';

const label = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((o) => o.value === value)?.label ?? value;

/**
 * El proyecto como documento de contexto (memory bank). Es lo que se entrega a la IA
 * para ideas y guiones, y lo que viaja como brief.md en el paquete del video.
 */
export function projectToContext(p: ProjectInput): string {
  const blocks: string[] = [`# ${p.name}`];
  const add = (title: string, body: string) => body.trim() && blocks.push(`## ${title}\n${body.trim()}`);
  const line = (key: string, value: string) => (value.trim() ? `- ${key}: ${value.trim()}` : '');
  const lines = (...items: string[]) => items.filter(Boolean).join('\n');

  if (p.description.trim()) blocks.push(p.description.trim());

  add(
    'Marca',
    lines(
      line('Color principal', p.color_primary),
      line('Color secundario', p.color_secondary),
      line('Color de acento', p.color_accent),
      line('Fondo', p.color_background),
      line('Texto', p.color_text),
    ),
  );
  add(
    'Voz',
    lines(
      line('Nombre de la voz', p.voice_name),
      line('ID de voz (ElevenLabs)', p.voice_id),
      line('Tono', p.voice_style),
      line('Idioma', label(LANGUAGES, p.language)),
    ),
  );
  add('Público objetivo', p.audience);
  add('Tono del contenido', p.content_tone);
  add('Temas y pilares', p.topics);
  add('Reglas (qué sí y qué no)', p.rules);
  add('Llamado a la acción', p.call_to_action);
  add(
    'Subtítulos',
    lines(
      line('Tipografía', p.subtitle_font),
      line('Posición', label(SUBTITLE_POSITIONS, p.subtitle_position)),
      line('Color del texto', p.subtitle_text_color),
      line('Color de la palabra activa', p.subtitle_highlight_color),
      line('Mayúsculas', p.subtitle_uppercase ? 'sí' : 'no'),
      line('Palabras por línea', String(p.subtitle_words_per_line)),
    ),
  );
  add(
    'Salida',
    lines(
      line('Plataformas', p.platforms.map((v) => label(PLATFORMS, v)).join(', ')),
      line('Formato por defecto', label(ASPECTS, p.default_aspect)),
    ),
  );
  add('Conocimiento del producto', p.knowledge);

  return blocks.join('\n\n');
}
