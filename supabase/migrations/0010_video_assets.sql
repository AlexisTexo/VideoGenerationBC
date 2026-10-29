-- Estado de cada imagen o clip generado, alineado con videos.visuals.
-- [{ index, type, status: 'done' | 'error', path, mime, prompt, credit?, error? }]

alter table public.videos
  add column assets jsonb not null default '[]'::jsonb check (jsonb_typeof(assets) = 'array');
