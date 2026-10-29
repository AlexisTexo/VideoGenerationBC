-- Variantes: un video nuevo que nace de uno ya aprobado (otro gancho, otro guion, otras imágenes).
-- Guarda de cuál viene y con qué generación (GEN-xxxxx) estaba, para rastrearlo.

alter table public.videos
  add column parent_video_id uuid references public.videos (id) on delete set null,
  add column parent_generation_id uuid references public.generations (id) on delete set null;

create index videos_parent_idx on public.videos (parent_video_id) where parent_video_id is not null;
