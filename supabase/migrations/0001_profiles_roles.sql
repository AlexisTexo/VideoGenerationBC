-- Roles de la app. Ejecutar en Supabase: SQL Editor, después de crear al usuario en Authentication > Users.

create type public.app_role as enum ('admin', 'editor', 'approver');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.app_role not null default 'editor',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- security definer evita recursión de RLS al consultar profiles desde sus propias políticas.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create policy "ver perfil propio o todos si admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "admin gestiona perfiles"
  on public.profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Perfil automático (rol editor) para cada usuario nuevo.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles para usuarios que ya existen.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- Administrador principal.
update public.profiles
set role = 'admin'
where lower(email) = 'alexis.tellez@bcareit.com';
