import type { ProjectInput } from './projects';

/**
 * El proyecto como documento de contexto (memory bank). Es lo que se entrega a la IA
 * para ideas y guiones, y lo que viaja como brief.md en el paquete del video.
 * Voz, subtítulos y salida se agregan por video, no aquí.
 */
export function projectToContext(p: ProjectInput): string {
  const blocks: string[] = [`# ${p.name}`];
  const add = (title: string, body: string) => body.trim() && blocks.push(`## ${title}\n${body.trim()}`);

  if (p.description.trim()) blocks.push(p.description.trim());

  add('Marca (colores)', p.brand_colors.map((c) => `- ${c.name}: ${c.hex}`).join('\n'));
  add('Público objetivo', p.audience);
  add('Tono del contenido', p.content_tone);
  add('Temas y pilares', p.topics);
  add('Reglas (qué sí y qué no)', p.rules);
  add('Llamado a la acción', p.call_to_action);
  add('Conocimiento del producto', p.knowledge);

  return blocks.join('\n\n');
}
