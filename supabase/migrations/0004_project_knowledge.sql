-- Base de conocimiento del proyecto: hechos, glosario y preguntas frecuentes en texto libre.

alter table public.projects
  add column knowledge text not null default '' check (char_length(knowledge) <= 20000);
