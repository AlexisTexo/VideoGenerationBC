-- Paleta libre: lista de colores con nombre en lugar de 5 columnas fijas.
-- Las columnas color_* y las de voz, subtítulos y salida quedan sin tocar (ya no las usa la app);
-- se pueden eliminar más adelante cuando se decida cómo viven por video.

alter table public.projects
  add column brand_colors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(brand_colors) = 'array' and jsonb_array_length(brand_colors) <= 12);

-- Conserva los colores que ya tenía cada proyecto.
update public.projects
set brand_colors = jsonb_build_array(
  jsonb_build_object('name', 'Principal', 'hex', upper(color_primary)),
  jsonb_build_object('name', 'Secundario', 'hex', upper(color_secondary)),
  jsonb_build_object('name', 'Acento', 'hex', upper(color_accent)),
  jsonb_build_object('name', 'Fondo', 'hex', upper(color_background)),
  jsonb_build_object('name', 'Texto', 'hex', upper(color_text))
)
where brand_colors = '[]'::jsonb;
