-- 002: ranking (liga en línea y campeones del ARCADE) y registro de errores del juego.
-- Se pega una vez en el SQL Editor del panel de Supabase.

-- Liga en línea: puntos (tipo ELO, todos parten con 1.000), victorias, derrotas y rachas.
-- La llenará la función que registre cada pelea en línea (fase 2). Desde el juego nadie la
-- puede escribir (así nadie se sube los puntos); se lee con ranking_liga().
create table public.liga (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  puntos integer not null default 1000,
  victorias integer not null default 0 check (victorias >= 0),
  derrotas integer not null default 0 check (derrotas >= 0),
  racha integer not null default 0 check (racha >= 0),
  mejor_racha integer not null default 0 check (mejor_racha >= 0),
  actualizado timestamptz not null default now()
);
alter table public.liga enable row level security;
revoke all on public.liga from anon, authenticated;

-- Campeones del ARCADE: cada jugador con cuenta sube su tiempo al coronarse (suma de lo que
-- duraron sus peleas, contando las que perdió y repitió).
create table public.arcade_records (
  id bigint generated always as identity primary key,
  perfil_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  dificultad text not null check (dificultad in ('facil', 'normal', 'dificil', 'muyDificil')),
  luchador text not null check (luchador ~ '^[a-z0-9-]{1,24}$'),
  segundos numeric(8, 1) not null check (segundos between 60 and 36000),
  continues integer not null default 0 check (continues between 0 and 999),
  creado timestamptz not null default now()
);
create index arcade_records_por_dificultad on public.arcade_records (dificultad, segundos);
alter table public.arcade_records enable row level security;
create policy "cada uno sube sus tiempos" on public.arcade_records
  for insert to authenticated with check ((select auth.uid()) = perfil_id);
revoke all on public.arcade_records from anon, authenticated;
grant insert (dificultad, luchador, segundos, continues) on public.arcade_records to authenticated;

-- Errores del juego, para arreglar lo que falla en los celulares. Cualquiera los puede
-- mandar; nadie los puede leer desde el juego (se ven en el panel: Table Editor → errores).
create table public.errores (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  mensaje text not null check (char_length(mensaje) <= 2000),
  detalle text check (char_length(detalle) <= 8000),
  escena text check (char_length(escena) <= 80),
  aparato text check (char_length(aparato) <= 400),
  pantalla text check (char_length(pantalla) <= 120)
);
alter table public.errores enable row level security;
create policy "cualquiera manda errores" on public.errores
  for insert to anon, authenticated with check (true);
revoke all on public.errores from anon, authenticated;
grant insert (mensaje, detalle, escena, aparato, pantalla) on public.errores to anon, authenticated;

-- Rankings públicos (la web los lee sin cuenta): solo apodos y números, nunca correos.
-- orden: 'puntos' (liga), 'victorias' o 'racha' (mejor racha).
create or replace function public.ranking_liga(orden text default 'puntos', limite integer default 50)
returns table (apodo text, puntos integer, victorias integer, derrotas integer, racha integer, mejor_racha integer)
language sql stable security definer set search_path = ''
as $$
  select p.apodo, l.puntos, l.victorias, l.derrotas, l.racha, l.mejor_racha
  from public.liga l
  join public.perfiles p on p.id = l.perfil_id
  where l.victorias + l.derrotas > 0
  order by
    case orden when 'victorias' then l.victorias when 'racha' then l.mejor_racha else l.puntos end desc,
    l.puntos desc, l.victorias desc, p.apodo
  limit least(greatest(coalesce(limite, 50), 1), 100);
$$;

-- El mejor tiempo de cada jugador en una dificultad, del más rápido al más lento.
create or replace function public.ranking_arcade(dif text default 'normal', limite integer default 50)
returns table (apodo text, luchador text, segundos numeric, continues integer, creado timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.apodo, m.luchador, m.segundos, m.continues, m.creado
  from (
    select distinct on (r.perfil_id) p.apodo, r.luchador, r.segundos, r.continues, r.creado
    from public.arcade_records r
    join public.perfiles p on p.id = r.perfil_id
    where r.dificultad = dif
    order by r.perfil_id, r.segundos, r.creado
  ) m
  order by m.segundos, m.creado
  limit least(greatest(coalesce(limite, 50), 1), 100);
$$;

revoke all on function public.ranking_liga(text, integer) from public;
revoke all on function public.ranking_arcade(text, integer) from public;
grant execute on function public.ranking_liga(text, integer) to anon, authenticated;
grant execute on function public.ranking_arcade(text, integer) to anon, authenticated;
