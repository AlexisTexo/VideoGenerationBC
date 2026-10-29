-- Formato(s) del video, efectos de sonido y biblioteca de música de fondo.

-- Biblioteca de música (compartida): archivos subidos o generados con IA.
create table public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  -- Ruta dentro del bucket video-assets (music/<id>.<ext>).
  path text not null check (char_length(path) <= 300),
  mime text not null default 'audio/mpeg',
  source text not null default 'upload' check (source in ('upload', 'generated')),
  prompt text not null default '' check (char_length(prompt) <= 500),
  -- La pista predeterminada se aplica sola a cada video nuevo. Solo puede haber una.
  is_default boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index music_tracks_one_default on public.music_tracks (is_default) where is_default;

alter table public.music_tracks enable row level security;

create policy "ver musica" on public.music_tracks for select to authenticated
  using (public.has_role('{admin,editor,approver}'));
create policy "crear musica" on public.music_tracks for insert to authenticated
  with check (public.has_role('{admin,editor}'));
create policy "editar musica" on public.music_tracks for update to authenticated
  using (public.has_role('{admin,editor}')) with check (public.has_role('{admin,editor}'));
create policy "borrar musica" on public.music_tracks for delete to authenticated
  using (public.has_role('{admin,editor}'));

alter table public.videos
  add column formats text[] not null default '{9:16}'
    check (formats <@ array['9:16', '16:9'] and cardinality(formats) >= 1),
  add column sfx boolean not null default false,
  add column music_track_id uuid references public.music_tracks (id) on delete set null;

-- La música subida puede venir en más formatos de audio.
update storage.buckets
set allowed_mime_types = array[
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg',
  'image/png', 'image/jpeg', 'image/webp', 'video/mp4'
]
where id = 'video-assets';
