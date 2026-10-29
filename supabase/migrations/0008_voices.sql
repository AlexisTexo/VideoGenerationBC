-- Biblioteca de voces de ElevenLabs: se guarda el ID, el nombre y una copia de la muestra de audio.

create table public.voices (
  id uuid primary key default gen_random_uuid(),
  voice_id text not null unique check (char_length(voice_id) between 10 and 40),
  name text not null default '' check (char_length(name) <= 100),
  -- URL de la muestra: la copia en Storage, o la de ElevenLabs si no se pudo copiar.
  preview_url text not null default '' check (char_length(preview_url) <= 500),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.voices enable row level security;

create policy "ver voces" on public.voices for select to authenticated
  using (public.has_role('{admin,editor,approver}'));
create policy "guardar voces" on public.voices for insert to authenticated
  with check (public.has_role('{admin,editor}'));
create policy "actualizar voces" on public.voices for update to authenticated
  using (public.has_role('{admin,editor}')) with check (public.has_role('{admin,editor}'));
create policy "borrar voces" on public.voices for delete to authenticated
  using (public.has_role('{admin,editor}'));

-- Muestras de audio: lectura pública (son demos de voces, no datos sensibles), escritura solo admin y editor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-previews',
  'voice-previews',
  true,
  3145728,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']
)
on conflict (id) do nothing;

create policy "admin y editor suben muestras de voz"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'voice-previews' and public.has_role('{admin,editor}'));
create policy "admin y editor reemplazan muestras de voz"
  on storage.objects for update to authenticated
  using (bucket_id = 'voice-previews' and public.has_role('{admin,editor}'))
  with check (bucket_id = 'voice-previews' and public.has_role('{admin,editor}'));
create policy "admin y editor borran muestras de voz"
  on storage.objects for delete to authenticated
  using (bucket_id = 'voice-previews' and public.has_role('{admin,editor}'));
