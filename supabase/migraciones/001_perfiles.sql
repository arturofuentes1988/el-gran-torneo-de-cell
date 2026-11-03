-- Perfiles de jugador (fase 1 del modo en línea): el apodo con que te ven los rivales.
-- Ya está aplicada en el proyecto de Supabase (se pegó en el SQL Editor el 3 de noviembre de 2026).
-- Reglas: cualquiera con cuenta puede ver los apodos; cada uno crea y cambia solo el suyo;
-- sin cuenta (anon) no se puede leer nada. El apodo es único sin importar mayúsculas.

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  apodo text not null check (
    char_length(apodo) between 3 and 14
    and apodo = btrim(apodo)
    and apodo ~ '^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ _-]+$'
  ),
  creado timestamptz not null default now()
);
create unique index perfiles_apodo_unico on public.perfiles (lower(apodo));
alter table public.perfiles enable row level security;
create policy "perfiles visibles para jugadores" on public.perfiles
  for select to authenticated using (true);
create policy "cada uno crea su perfil" on public.perfiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "cada uno cambia su perfil" on public.perfiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
revoke all on public.perfiles from anon;
grant select, insert, update on public.perfiles to authenticated;
