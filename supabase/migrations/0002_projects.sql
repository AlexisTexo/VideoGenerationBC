-- Proyectos (productos/marcas) con su kit de marca, voz, contenido y subtítulos.

-- Reutilizable en políticas de otras tablas: ¿el usuario actual tiene alguno de estos roles?
create function public.has_role(allowed public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = any (allowed)
  );
$$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),

  -- Marca
  color_primary text not null default '#7C05F2' check (color_primary ~* '^#[0-9a-f]{6}$'),
  color_secondary text not null default '#2B88D9' check (color_secondary ~* '^#[0-9a-f]{6}$'),
  color_accent text not null default '#798BF2' check (color_accent ~* '^#[0-9a-f]{6}$'),
  color_background text not null default '#0F0C1A' check (color_background ~* '^#[0-9a-f]{6}$'),
  color_text text not null default '#F2F2F2' check (color_text ~* '^#[0-9a-f]{6}$'),

  -- Voz (ElevenLabs)
  voice_id text not null default '' check (char_length(voice_id) <= 100),
  voice_name text not null default '' check (char_length(voice_name) <= 100),
  voice_style text not null default '' check (char_length(voice_style) <= 500),
  language text not null default 'es-MX' check (char_length(language) <= 10),

  -- Contenido
  audience text not null default '' check (char_length(audience) <= 1000),
  content_tone text not null default '' check (char_length(content_tone) <= 1000),
  topics text not null default '' check (char_length(topics) <= 4000),
  rules text not null default '' check (char_length(rules) <= 4000),
  call_to_action text not null default '' check (char_length(call_to_action) <= 500),

  -- Subtítulos
  subtitle_font text not null default 'Montserrat' check (char_length(subtitle_font) <= 60),
  subtitle_position text not null default 'bottom' check (subtitle_position in ('top', 'middle', 'bottom')),
  subtitle_text_color text not null default '#FFFFFF' check (subtitle_text_color ~* '^#[0-9a-f]{6}$'),
  subtitle_highlight_color text not null default '#8D44F2' check (subtitle_highlight_color ~* '^#[0-9a-f]{6}$'),
  subtitle_uppercase boolean not null default false,
  subtitle_words_per_line smallint not null default 3 check (subtitle_words_per_line between 1 and 8),

  -- Salida
  platforms text[] not null default '{youtube,instagram,facebook}'
    check (platforms <@ array['youtube', 'instagram', 'facebook', 'tiktok']),
  default_aspect text not null default '9:16' check (default_aspect in ('9:16', '16:9', '1:1')),

  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

-- Todos los usuarios con rol ven los proyectos; admin y editor los crean y editan; solo admin borra.
create policy "ver proyectos"
  on public.projects for select to authenticated
  using (public.has_role('{admin,editor,approver}'));

create policy "crear proyectos"
  on public.projects for insert to authenticated
  with check (public.has_role('{admin,editor}'));

create policy "editar proyectos"
  on public.projects for update to authenticated
  using (public.has_role('{admin,editor}'))
  with check (public.has_role('{admin,editor}'));

create policy "borrar proyectos"
  on public.projects for delete to authenticated
  using (public.has_role('{admin}'));
