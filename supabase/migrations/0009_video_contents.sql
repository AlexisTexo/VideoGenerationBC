-- Aprobación del guion y contenidos generados (voz con tiempos por palabra).

alter table public.videos
  add column script_approved boolean not null default false,
  -- Ruta del audio dentro del bucket video-assets (ej. <video_id>/voiceover.mp3).
  add column audio_path text not null default '' check (char_length(audio_path) <= 300),
  add column audio_seconds numeric(8, 2),
  -- [{ text, start, end }] por palabra, para los subtítulos.
  add column words jsonb not null default '[]'::jsonb check (jsonb_typeof(words) = 'array'),
  add column generated_at timestamptz;

-- Privado: el audio y las imágenes de un cliente no deben ser públicos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-assets',
  'video-assets',
  false,
  52428800,
  array['audio/mpeg', 'audio/mp3', 'image/png', 'image/jpeg', 'image/webp', 'video/mp4']
)
on conflict (id) do nothing;

create policy "ver contenidos de video"
  on storage.objects for select to authenticated
  using (bucket_id = 'video-assets' and public.has_role('{admin,editor,approver}'));
create policy "subir contenidos de video"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'video-assets' and public.has_role('{admin,editor}'));
create policy "reemplazar contenidos de video"
  on storage.objects for update to authenticated
  using (bucket_id = 'video-assets' and public.has_role('{admin,editor}'))
  with check (bucket_id = 'video-assets' and public.has_role('{admin,editor}'));
create policy "borrar contenidos de video"
  on storage.objects for delete to authenticated
  using (bucket_id = 'video-assets' and public.has_role('{admin,editor}'));
