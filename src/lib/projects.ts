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

export interface Project {
  id: string;
  name: string;
  description: string;
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
}

export type ProjectInput = Omit<Project, 'id'>;

export const PROJECT_DEFAULTS: ProjectInput = {
  name: '',
  description: '',
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
};

export const PROJECT_COLUMNS = ['id', ...Object.keys(PROJECT_DEFAULTS)].join(', ');

const HEX_RE = /^#[0-9a-f]{6}$/i;

const COLOR_KEYS = [
  'color_primary',
  'color_secondary',
  'color_accent',
  'color_background',
  'color_text',
  'subtitle_text_color',
  'subtitle_highlight_color',
] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_RE.test(value);
}

const text = (form: FormData, key: string, max: number) =>
  String(form.get(key) ?? '').trim().slice(0, max);

function pick(value: string, options: readonly { value: string }[], fallback: string) {
  return options.some((o) => o.value === value) ? value : fallback;
}

/** Valida y normaliza el formulario. Devuelve null si falta lo indispensable o un color es inválido. */
export function parseProjectForm(form: FormData): ProjectInput | null {
  const name = text(form, 'name', 80);
  if (!name) return null;

  const colors = {} as Record<(typeof COLOR_KEYS)[number], string>;
  for (const key of COLOR_KEYS) {
    const value = text(form, key, 7);
    if (!HEX_RE.test(value)) return null;
    colors[key] = value.toUpperCase();
  }

  const platforms = form
    .getAll('platforms')
    .map(String)
    .filter((p) => PLATFORMS.some((o) => o.value === p));

  const words = Number(form.get('subtitle_words_per_line'));

  return {
    name,
    description: text(form, 'description', 2000),
    ...colors,
    voice_id: text(form, 'voice_id', 100),
    voice_name: text(form, 'voice_name', 100),
    voice_style: text(form, 'voice_style', 500),
    language: pick(text(form, 'language', 10), LANGUAGES, 'es-MX'),
    audience: text(form, 'audience', 1000),
    content_tone: text(form, 'content_tone', 1000),
    topics: text(form, 'topics', 4000),
    rules: text(form, 'rules', 4000),
    call_to_action: text(form, 'call_to_action', 500),
    subtitle_font: pick(text(form, 'subtitle_font', 60), FONTS.map((value) => ({ value })), 'Montserrat'),
    subtitle_position: pick(text(form, 'subtitle_position', 10), SUBTITLE_POSITIONS, 'bottom'),
    subtitle_uppercase: form.get('subtitle_uppercase') === 'on',
    subtitle_words_per_line: Number.isInteger(words) ? Math.min(8, Math.max(1, words)) : 3,
    platforms,
    default_aspect: pick(text(form, 'default_aspect', 5), ASPECTS, '9:16'),
  };
}
