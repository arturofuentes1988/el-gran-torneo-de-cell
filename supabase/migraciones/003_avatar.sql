-- 003: avatar del jugador (la cara de un luchador: rene, pablito, flaitiano...) y los rankings
-- con el avatar al lado del apodo. Se pega una vez en el SQL Editor del panel de Supabase.
-- Cada jugador cambia el suyo con la regla que ya existe ("cada uno cambia su perfil").

alter table public.perfiles add column avatar text check (avatar ~ '^[a-z0-9-]{1,24}$');

-- Los rankings ahora también devuelven el avatar (cambia lo que devuelven: se borran y se crean de nuevo).
drop function public.ranking_liga(text, integer);
drop function public.ranking_arcade(text, integer);

create function public.ranking_liga(orden text default 'puntos', limite integer default 50)
returns table (apodo text, avatar text, puntos integer, victorias integer, derrotas integer, racha integer, mejor_racha integer)
language sql stable security definer set search_path = ''
as $$
  select p.apodo, p.avatar, l.puntos, l.victorias, l.derrotas, l.racha, l.mejor_racha
  from public.liga l
  join public.perfiles p on p.id = l.perfil_id
  where l.victorias + l.derrotas > 0
  order by
    case orden when 'victorias' then l.victorias when 'racha' then l.mejor_racha else l.puntos end desc,
    l.puntos desc, l.victorias desc, p.apodo
  limit least(greatest(coalesce(limite, 50), 1), 100);
$$;

create function public.ranking_arcade(dif text default 'normal', limite integer default 50)
returns table (apodo text, avatar text, luchador text, segundos numeric, continues integer, creado timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.apodo, m.avatar, m.luchador, m.segundos, m.continues, m.creado
  from (
    select distinct on (r.perfil_id) p.apodo, p.avatar, r.luchador, r.segundos, r.continues, r.creado
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
