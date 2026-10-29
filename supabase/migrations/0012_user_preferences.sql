-- Preferencias de cada usuario: lo último que eligió se aplica solo a los videos nuevos.

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  voice_id text not null default '' check (char_length(voice_id) <= 100),
  voice_name text not null default '' check (char_length(voice_name) <= 100),
  formats text[] not null default '{9:16}'
    check (formats <@ array['9:16', '16:9'] and cardinality(formats) >= 1),
  sfx boolean not null default false,
  seconds smallint not null default 45 check (seconds between 10 and 300),
  -- Parte de los visuales que son imágenes de IA (el resto son clips de stock).
  image_share numeric(3, 2) not null default 0.60 check (image_share between 0 and 1),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

-- Cada quien solo ve y cambia las suyas.
create policy "ver mis preferencias" on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "crear mis preferencias" on public.user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "editar mis preferencias" on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "borrar mis preferencias" on public.user_preferences for delete to authenticated
  using (user_id = (select auth.uid()));
