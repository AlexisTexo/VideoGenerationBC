-- Las voces usadas en un video pasan solas a la biblioteca, ordenadas por último uso.

alter table public.voices add column last_used_at timestamptz;

-- Rescata las voces que ya se usaron en videos y todavía no estaban guardadas.
-- Sin muestra de audio: en la biblioteca hay un botón para cargarla.
insert into public.voices (voice_id, name, preview_url, last_used_at)
select distinct on (v.voice_id) v.voice_id, v.voice_name, '', v.updated_at
from public.videos v
where char_length(v.voice_id) between 10 and 40
order by v.voice_id, v.updated_at desc
on conflict (voice_id) do nothing;

-- Si ya estaban guardadas, se anota cuándo se usaron por última vez.
update public.voices vo
set last_used_at = latest.used_at
from (
  select voice_id, max(updated_at) as used_at
  from public.videos
  where char_length(voice_id) between 10 and 40
  group by voice_id
) latest
where vo.voice_id = latest.voice_id and vo.last_used_at is null;
