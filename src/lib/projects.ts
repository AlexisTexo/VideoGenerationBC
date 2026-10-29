/**
 * Secciones del proyecto: cada una se edita y se guarda por separado.
 * Voz, subtítulos y salida NO viven aquí: se definen por video.
 */
export const SECTIONS = [
  { id: 'producto', label: 'Producto', title: 'Datos del producto', description: 'Cómo se llama y qué es.' },
  {
    id: 'marca',
    label: 'Marca',
    title: 'Marca',
    description: 'Los colores de la marca. Añade los que necesites y ponles nombre.',
  },
  {
    id: 'contenido',
    label: 'Contenido',
    title: 'Contenido',
    description: 'Lo que la IA debe saber para proponer ideas y guiones.',
  },
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

export interface BrandColor {
  name: string;
  hex: string;
}

export const MAX_BRAND_COLORS = 12;

export interface Project {
  id: string;
  name: string;
  description: string;
  logo_url: string;
  brand_colors: BrandColor[];
  audience: string;
  content_tone: string;
  topics: string;
  rules: string;
  call_to_action: string;
  knowledge: string;
}

export type ProjectInput = Omit<Project, 'id'>;

/** Lo que llega del formulario: el logo se gestiona aparte (archivo + Storage). */
export type ProjectFormData = Omit<ProjectInput, 'logo_url'>;

export const PROJECT_DEFAULTS: ProjectInput = {
  name: '',
  description: '',
  logo_url: '',
  brand_colors: [
    { name: 'Principal', hex: '#7C05F2' },
    { name: 'Secundario', hex: '#2B88D9' },
    { name: 'Acento', hex: '#798BF2' },
    { name: 'Fondo', hex: '#0F0C1A' },
    { name: 'Texto', hex: '#F2F2F2' },
  ],
  audience: '',
  content_tone: '',
  topics: '',
  rules: '',
  call_to_action: '',
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

type Parsed = Partial<ProjectFormData>;

/** Cada sección lee solo sus campos; devuelve null si algo indispensable es inválido. */
const PARSERS: Record<SectionId, (form: FormData) => Parsed | null> = {
  producto: (form) => {
    const name = text(form, 'name', 80);
    return name ? { name, description: text(form, 'description', 2000) } : null;
  },
  marca: (form) => {
    const names = form.getAll('color_name').map(String);
    const hexes = form.getAll('color_hex').map(String);
    if (hexes.length > MAX_BRAND_COLORS) return null;

    const colors: BrandColor[] = [];
    for (const [i, raw] of hexes.entries()) {
      const hex = raw.trim();
      const name = (names[i] ?? '').trim().slice(0, 30);
      if (!hex && !name) continue; // fila vacía: se ignora
      if (!HEX_RE.test(hex)) return null;
      colors.push({ name: name || `Color ${colors.length + 1}`, hex: hex.toUpperCase() });
    }
    return { brand_colors: colors };
  },
  contenido: (form) => ({
    audience: text(form, 'audience', 1000),
    content_tone: text(form, 'content_tone', 1000),
    topics: text(form, 'topics', 4000),
    rules: text(form, 'rules', 4000),
    call_to_action: text(form, 'call_to_action', 500),
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
