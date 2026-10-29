-- Historial de generaciones: cada vez que se generan contenidos (o se rehace un elemento) queda
-- una "generación" con su ID (GEN-00001...) y una foto de todo lo producido en ese momento.
-- Los archivos de cada generación viven en su propia carpeta, así que una versión nueva
-- nunca pisa la anterior.

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  -- Número correlativo; el código visible es GEN-<número con 5 dígitos>.
  number bigint generated always as identity,
  video_id uuid not null references public.videos (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null default 'generate' check (kind in ('generate', 'remake')),
  -- Qué cambió en esta generación (ej. "Imagen 3 (9:16) rehecha").
  note text not null default '' check (char_length(note) <= 300),
  -- Guion, visuales, archivos, formatos, voz, música y efectos tal como quedaron.
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_by_email text not null default '' check (char_length(created_by_email) <= 200),
  created_at timestamptz not null default now()
);

create unique index generations_number_key on public.generations (number);
create index generations_project_idx on public.generations (project_id, created_at desc);
create index generations_video_idx on public.generations (video_id, created_at desc);

alter table public.videos
  add column current_generation_id uuid references public.generations (id) on delete set null;

alter table public.generations enable row level security;

create policy "ver generaciones" on public.generations for select to authenticated
  using (public.has_role('{admin,editor,approver}'));
create policy "crear generaciones" on public.generations for insert to authenticated
  with check (public.has_role('{admin,editor}'));
create policy "completar generaciones" on public.generations for update to authenticated
  using (public.has_role('{admin,editor}')) with check (public.has_role('{admin,editor}'));
create policy "descartar generaciones" on public.generations for delete to authenticated
  using (public.has_role('{admin,editor}'));
