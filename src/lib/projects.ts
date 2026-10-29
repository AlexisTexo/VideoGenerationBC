export const LANGUAGES = [
  { value: 'es-MX', label: 'Español (México)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'es-US', label: 'Español (EE. UU.)' },
  { value: 'en-US', label: 'Inglés (EE. UU.)' },
  { value: 'pt-BR', label: 'Portugués (Brasil)' },
] as const;

export const FONTS = ['Montserrat', 'Poppins', 'Inter', 'Roboto', 'Oswald', 'Bebas Neue'] as const;

export const SUBTITLE_POSITIONS = [
  { value: 'top', label: 'Arriba' },
  { value: 'middle', label: 'Centro' },
  { value: 'bottom', label: 'Abajo' },
] as const;

export const PLATFORMS = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
] as const;

export const ASPECTS = [
  { value: '9:16', label: 'Vertical 9:16' },
  { value: '16:9', label: 'Horizontal 16:9' },
  { value: '1:1', label: 'Cuadrado 1:1' },
] as const;

/** Secciones del proyecto: cada una se edita y se guarda por separado. */
export const SECTIONS = [
  { id: 'producto', label: 'Producto', title: 'Datos del producto', description: 'Cómo se llama y qué es.' },
  { id: 'marca', label: 'Marca', title: 'Marca', description: 'Colores que usarán los videos, imágenes y portadas.' },
  { id: 'voz', label: 'Voz', title: 'Voz', description: 'Cómo suena la narración de los videos.' },
  {
    id: 'contenido',
    label: 'Contenido',
    title: 'Contenido',
    description: 'Lo que la IA debe saber para proponer ideas y guiones.',
  },
  {
    id: 'subtitulos',
    label: 'Subtítulos',
    title: 'Subtítulos',
    description: 'Estilo del texto que aparece sobre el video.',
  },
  { id: 'salida', label: 'Salida', title: 'Salida', description: 'Dónde se publican los videos y en qué formato.' },
  {
    id: 'conocimiento',
    label: 'Conocimiento',
    title: 'Conocimiento',
    description: 'Hechos, glosario y preguntas frecuentes del producto: la memoria que la IA consulta para no inventar.',
  },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

export function isSectionId(value: unknown): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
}

export interface Project {
  id: string;
  name: string;
  description: string;
  logo_url: string;
  color_primary: string;
  color_secondary: string;
  color_accent: string;
  color_background: string;
  color_text: string;
  voice_id: string;
  voice_name: string;
  voice_style: string;
  language: string;
  audience: string;
  content_tone: string;
  topics: string;
  rules: string;
  call_to_action: string;
  subtitle_font: string;
  subtitle_position: string;
  subtitle_text_color: string;
  subtitle_highlight_color: string;
  subtitle_uppercase: boolean;
  subtitle_words_per_line: number;
  platforms: string[];
  default_aspect: string;
  knowledge: string;
}

export type ProjectInput = Omit<Project, 'id'>;

/** Lo que llega del formulario: el logo se gestiona aparte (archivo + Storage). */
export type ProjectFormData = Omit<ProjectInput, 'logo_url'>;

export const PROJECT_DEFAULTS: ProjectInput = {
  name: '',
  description: '',
  logo_url: '',
  color_primary: '#7C05F2',
  color_secondary: '#2B88D9',
  color_accent: '#798BF2',
  color_background: '#0F0C1A',
  color_text: '#F2F2F2',
  voice_id: '',
  voice_name: '',
  voice_style: '',
  language: 'es-MX',
  audience: '',
  content_tone: '',
  topics: '',
  rules: '',
  call_to_action: '',
  subtitle_font: 'Montserrat',
  subtitle_position: 'bottom',
  subtitle_text_color: '#FFFFFF',
  subtitle_highlight_color: '#8D44F2',
  subtitle_uppercase: false,
  subtitle_words_per_line: 3,
  platforms: ['youtube', 'instagram', 'facebook'],
  default_aspect: '9:16',
  knowledge: '',
};

export const PROJECT_COLUMNS = ['id', ...Object.keys(PROJECT_DEFAULTS)].join(', ');

const HEX_RE = /^#[0-9a-f]{6}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_RE.test(value);
}

const text = (form: FormData, key: string, max: number) =>
  String(form.get(key) ?? '').trim().slice(0, max);

function pick(value: string, options: readonly { value: string }[], fallback: string) {
  return options.some((o) => o.value === value) ? value : fallback;
}

function colors<K extends string>(form: FormData, keys: readonly K[]): Record<K, string> | null {
  const out = {} as Record<K, string>;
  for (const key of keys) {
    const value = text(form, key, 7);
    if (!HEX_RE.test(value)) return null;
    out[key] = value.toUpperCase();
  }
  return out;
}

type Parsed = Partial<ProjectFormData>;

/** Cada sección lee solo sus campos; devuelve null si algo indispensable es inválido. */
const PARSERS: Record<SectionId, (form: FormData) => Parsed | null> = {
  producto: (form) => {
    const name = text(form, 'name', 80);
    return name ? { name, description: text(form, 'description', 2000) } : null;
  },
  marca: (form) =>
    colors(form, ['color_primary', 'color_secondary', 'color_accent', 'color_background', 'color_text'] as const),
  voz: (form) => ({
    voice_name: text(form, 'voice_name', 100),
    voice_id: text(form, 'voice_id', 100),
    voice_style: text(form, 'voice_style', 500),
    language: pick(text(form, 'language', 10), LANGUAGES, 'es-MX'),
  }),
  contenido: (form) => ({
    audience: text(form, 'audience', 1000),
    content_tone: text(form, 'content_tone', 1000),
    topics: text(form, 'topics', 4000),
    rules: text(form, 'rules', 4000),
    call_to_action: text(form, 'call_to_action', 500),
  }),
  subtitulos: (form) => {
    const c = colors(form, ['subtitle_text_color', 'subtitle_highlight_color'] as const);
    if (!c) return null;
    const words = Number(form.get('subtitle_words_per_line'));
    return {
      ...c,
      subtitle_font: pick(text(form, 'subtitle_font', 60), FONTS.map((value) => ({ value })), 'Montserrat'),
      subtitle_position: pick(text(form, 'subtitle_position', 10), SUBTITLE_POSITIONS, 'bottom'),
      subtitle_uppercase: form.get('subtitle_uppercase') === 'on',
      subtitle_words_per_line: Number.isInteger(words) ? Math.min(8, Math.max(1, words)) : 3,
    };
  },
  salida: (form) => ({
    platforms: form
      .getAll('platforms')
      .map(String)
      .filter((p) => PLATFORMS.some((o) => o.value === p)),
    default_aspect: pick(text(form, 'default_aspect', 5), ASPECTS, '9:16'),
  }),
  conocimiento: (form) => ({ knowledge: text(form, 'knowledge', 20000) }),
};

export function parseSection(id: SectionId, form: FormData): Parsed | null {
  return PARSERS[id](form);
}

/** Para crear un proyecto: todas las secciones juntas. */
export function parseAllSections(form: FormData): ProjectFormData | null {
  const merged: Parsed = {};
  for (const { id } of SECTIONS) {
    const parsed = PARSERS[id](form);
    if (!parsed) return null;
    Object.assign(merged, parsed);
  }
  return merged as ProjectFormData;
}
