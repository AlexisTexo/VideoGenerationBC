-- Entregas: el video ya editado (en Claude con Hyperframes o Remotion) que se sube para su aprobación.
-- Solo se guarda una copia ligera (720p) para revisar; el archivo en máxima calidad se queda con quien lo editó.

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  -- Número correlativo; el código visible es ENT-<número con 5 dígitos>.
  number bigint generated always as identity,
  video_id uuid not null references public.videos (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Generación del paquete con la que se trabajó (opcional).
  generation_id uuid references public.generations (id) on delete set null,
  version integer not null default 1,
  file_path text not null check (char_length(file_path) <= 300),
  poster_path text not null default '' check (char_length(poster_path) <= 300),
  file_bytes bigint not null default 0,
  original_bytes bigint not null default 0,
  width integer,
  height integer,
  seconds numeric(8, 2),
  -- pending: espera revisión · approved · changes_requested: se pidieron cambios · replaced: la sustituyó una versión nueva
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'replaced')),
  note text not null default '' check (char_length(note) <= 500),
  review_comment text not null default '' check (char_length(review_comment) <= 1000),
  reviewed_by_email text not null default '' check (char_length(reviewed_by_email) <= 200),
  reviewed_at timestamptz,
  -- Títulos, descripciones y etiquetas por plataforma (YouTube, Meta, TikTok), ya revisados.
  social jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  uploaded_by_email text not null default '' check (char_length(uploaded_by_email) <= 200),
  created_at timestamptz not null default now()
);

create unique index submissions_number_key on public.submissions (number);
create index submissions_status_idx on public.submissions (status, created_at desc);
create index submissions_video_idx on public.submissions (video_id, version desc);
create index submissions_project_idx on public.submissions (project_id, created_at desc);

alter table public.submissions enable row level security;

create policy "ver entregas" on public.submissions for select to authenticated
  using (public.has_role('{admin,editor,approver}'));
create policy "subir entregas" on public.submissions for insert to authenticated
  with check (public.has_role('{admin,editor}'));
-- Revisar (aprobar o pedir cambios) lo hacen admin y aprobador; el servidor además valida el rol.
create policy "actualizar entregas" on public.submissions for update to authenticated
  using (public.has_role('{admin,editor,approver}')) with check (public.has_role('{admin,editor,approver}'));
create policy "borrar entregas" on public.submissions for delete to authenticated
  using (public.has_role('{admin,editor}'));

-- Videos finales: privado, solo mp4 y portadas jpg, hasta 100 MB por archivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('final-videos', 'final-videos', false, 104857600, array['video/mp4', 'image/jpeg'])
on conflict (id) do nothing;

create policy "ver videos finales"
  on storage.objects for select to authenticated
  using (bucket_id = 'final-videos' and public.has_role('{admin,editor,approver}'));
create policy "subir videos finales"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'final-videos' and public.has_role('{admin,editor}'));
create policy "reemplazar videos finales"
  on storage.objects for update to authenticated
  using (bucket_id = 'final-videos' and public.has_role('{admin,editor}'))
  with check (bucket_id = 'final-videos' and public.has_role('{admin,editor}'));
create policy "borrar videos finales"
  on storage.objects for delete to authenticated
  using (bucket_id = 'final-videos' and public.has_role('{admin,editor}'));
