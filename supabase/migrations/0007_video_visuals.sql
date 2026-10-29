-- Plan de visuales del video: imágenes (Gemini) y clips (Pexels) repartidos sobre el guion.
-- [{ start, end, type: 'gemini_image' | 'pexels_clip', prompt }]

alter table public.videos
  add column visuals jsonb not null default '[]'::jsonb check (jsonb_typeof(visuals) = 'array');
