-- Historial de ideas por proyecto y videos (idea + voz + guion).

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  angle text not null default '' check (char_length(angle) <= 1000),
  source text not null default 'ai' check (source in ('ai', 'user')),
  -- suggested: propuesta y aún sin probar · used: ya se hizo un video · discarded: descartada
  status text not null default 'suggested' check (status in ('suggested', 'used', 'discarded')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index ideas_project_created_idx on public.ideas (project_id, created_at desc);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  idea_id uuid references public.ideas (id) on delete set null,
  title text not null default '' check (char_length(title) <= 160),
  -- Idea final con la que se escribió el guion (puede ser una variación de la original).
  idea text not null check (char_length(idea) between 1 and 2000),
  voice_id text not null default '' check (char_length(voice_id) <= 100),
  voice_name text not null default '' check (char_length(voice_name) <= 100),
  target_seconds smallint not null default 45 check (target_seconds between 10 and 300),
  -- [{ start, end, narration, visual: { type, prompt } }]
  script jsonb not null default '[]'::jsonb check (jsonb_typeof(script) = 'array'),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index videos_project_created_idx on public.videos (project_id, created_at desc);

create trigger videos_set_updated_at
  before update on public.videos
  for each row execute function public.set_updated_at();

alter table public.ideas enable row level security;
alter table public.videos enable row level security;

-- Todos los roles ven; admin y editor crean y editan; solo admin borra.
create policy "ver ideas" on public.ideas for select to authenticated
  using (public.has_role('{admin,editor,approver}'));
create policy "crear ideas" on public.ideas for insert to authenticated
  with check (public.has_role('{admin,editor}'));
create policy "editar ideas" on public.ideas for update to authenticated
  using (public.has_role('{admin,editor}')) with check (public.has_role('{admin,editor}'));
create policy "borrar ideas" on public.ideas for delete to authenticated
  using (public.has_role('{admin}'));

create policy "ver videos" on public.videos for select to authenticated
  using (public.has_role('{admin,editor,approver}'));
create policy "crear videos" on public.videos for insert to authenticated
  with check (public.has_role('{admin,editor}'));
create policy "editar videos" on public.videos for update to authenticated
  using (public.has_role('{admin,editor}')) with check (public.has_role('{admin,editor}'));
create policy "borrar videos" on public.videos for delete to authenticated
  using (public.has_role('{admin}'));
