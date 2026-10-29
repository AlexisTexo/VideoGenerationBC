-- Logo por proyecto: columna logo_url + bucket público project-logos.

alter table public.projects
  add column logo_url text not null default '' check (char_length(logo_url) <= 500);

-- Público para lectura (los logos son marca, no datos sensibles). Sin SVG: puede llevar scripts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-logos',
  'project-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Escritura solo para admin y editor.
create policy "admin y editor suben logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'project-logos' and public.has_role('{admin,editor}'));

create policy "admin y editor reemplazan logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'project-logos' and public.has_role('{admin,editor}'))
  with check (bucket_id = 'project-logos' and public.has_role('{admin,editor}'));

create policy "admin y editor borran logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'project-logos' and public.has_role('{admin,editor}'));
