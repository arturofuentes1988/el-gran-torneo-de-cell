-- 004: la liga en línea suma de verdad, y el ranking muestra a todos los jugadores.
-- Se pega una vez en el SQL Editor del panel de Supabase.
--
-- Al terminar cada pelea en línea, los dos jugadores mandan su resultado (reportar_pelea). Cuando
-- llegan los dos y coinciden (uno ganó y el otro perdió, o los dos empataron), se suman los puntos
-- tipo ELO a los dos: ganarle a alguien con más puntos da más. Si no coinciden, no cuenta. Para que
-- nadie se suba los puntos con un amigo, entre los mismos dos cuentan 10 peleas por día como máximo.
-- Desde el juego nadie puede escribir las tablas directo: solo con esta función.

create table public.peleas_en_linea (
  -- Código de la sala y semilla de la pelea (la misma en los dos computadores).
  clave text primary key check (clave ~ '^[A-Z]{4}-[0-9]{1,12}$'),
  anfitrion uuid references public.perfiles (id) on delete cascade,
  invitado uuid references public.perfiles (id) on delete cascade,
  resultado_anfitrion text check (resultado_anfitrion in ('gane', 'perdi', 'empate')),
  resultado_invitado text check (resultado_invitado in ('gane', 'perdi', 'empate')),
  estado text not null default 'esperando'
    check (estado in ('esperando', 'contada', 'no coinciden', 'tope diario', 'no válida')),
  -- Puntos que ganó el anfitrión (los mismos que perdió el invitado).
  cambio integer,
  creada timestamptz not null default now()
);
create index peleas_en_linea_por_pareja on public.peleas_en_linea (anfitrion, invitado, creada);
alter table public.peleas_en_linea enable row level security;
revoke all on public.peleas_en_linea from anon, authenticated;

-- Cada jugador manda lo suyo una vez por pelea. Devuelve en qué quedó la pelea y los puntos que
-- ganó (o perdió) quien llama, si ya se contó.
create function public.reportar_pelea(clave_pelea text, soy_anfitrion boolean, mi_resultado text)
returns table (estado text, cambio integer)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  yo uuid := (select auth.uid());
  p public.peleas_en_linea%rowtype;
  ra integer;
  rb integer;
  sa numeric;
  d integer;
begin
  if yo is null or not exists (select 1 from public.perfiles where id = yo) then
    raise exception 'hace falta una cuenta con apodo';
  end if;
  if mi_resultado is null or mi_resultado not in ('gane', 'perdi', 'empate') then
    raise exception 'resultado no válido';
  end if;

  -- Lo de este jugador (la primera vez crea la pelea; lo ya anotado no se cambia).
  insert into public.peleas_en_linea as x (clave, anfitrion, invitado, resultado_anfitrion, resultado_invitado)
  values (
    clave_pelea,
    case when soy_anfitrion then yo end,
    case when soy_anfitrion then null else yo end,
    case when soy_anfitrion then mi_resultado end,
    case when soy_anfitrion then null else mi_resultado end
  )
  on conflict (clave) do update set
    anfitrion = coalesce(x.anfitrion, excluded.anfitrion),
    invitado = coalesce(x.invitado, excluded.invitado),
    resultado_anfitrion = coalesce(x.resultado_anfitrion, excluded.resultado_anfitrion),
    resultado_invitado = coalesce(x.resultado_invitado, excluded.resultado_invitado)
  returning * into p;

  -- Falta el otro, o ya se resolvió antes.
  if p.estado <> 'esperando' or p.resultado_anfitrion is null or p.resultado_invitado is null then
    return query select p.estado, case when p.estado = 'contada' then
      (case when p.anfitrion = yo then p.cambio else -p.cambio end) end;
    return;
  end if;

  -- Los dos lados los mandó la misma cuenta: no vale.
  if p.anfitrion = p.invitado then
    update public.peleas_en_linea set estado = 'no válida' where clave = p.clave;
    return query select 'no válida'::text, null::integer;
    return;
  end if;

  if (p.resultado_anfitrion, p.resultado_invitado) not in (('gane', 'perdi'), ('perdi', 'gane'), ('empate', 'empate')) then
    update public.peleas_en_linea set estado = 'no coinciden' where clave = p.clave;
    return query select 'no coinciden'::text, null::integer;
    return;
  end if;

  if (
    select count(*) from public.peleas_en_linea q
    where q.estado = 'contada' and q.creada > now() - interval '1 day'
      and ((q.anfitrion = p.anfitrion and q.invitado = p.invitado) or (q.anfitrion = p.invitado and q.invitado = p.anfitrion))
  ) >= 10 then
    update public.peleas_en_linea set estado = 'tope diario' where clave = p.clave;
    return query select 'tope diario'::text, null::integer;
    return;
  end if;

  -- ELO (K = 32). sa: lo que sacó el anfitrión (1 ganó, 0 perdió, 0,5 empate).
  insert into public.liga (perfil_id) values (p.anfitrion), (p.invitado) on conflict (perfil_id) do nothing;
  select l.puntos into ra from public.liga l where l.perfil_id = p.anfitrion for update;
  select l.puntos into rb from public.liga l where l.perfil_id = p.invitado for update;
  sa := case p.resultado_anfitrion when 'gane' then 1 when 'perdi' then 0 else 0.5 end;
  d := round(32 * (sa - 1 / (1 + power(10::numeric, (rb - ra) / 400.0))));

  update public.liga set
    puntos = puntos + d,
    victorias = victorias + (sa = 1)::int,
    derrotas = derrotas + (sa = 0)::int,
    racha = case when sa = 1 then racha + 1 when sa = 0 then 0 else racha end,
    mejor_racha = case when sa = 1 then greatest(mejor_racha, racha + 1) else mejor_racha end,
    actualizado = now()
  where perfil_id = p.anfitrion;

  update public.liga set
    puntos = puntos - d,
    victorias = victorias + (sa = 0)::int,
    derrotas = derrotas + (sa = 1)::int,
    racha = case when sa = 0 then racha + 1 when sa = 1 then 0 else racha end,
    mejor_racha = case when sa = 0 then greatest(mejor_racha, racha + 1) else mejor_racha end,
    actualizado = now()
  where perfil_id = p.invitado;

  update public.peleas_en_linea set estado = 'contada', cambio = d where clave = p.clave;
  return query select 'contada'::text, case when soy_anfitrion then d else -d end;
end;
$$;

revoke all on function public.reportar_pelea(text, boolean, text) from public;
grant execute on function public.reportar_pelea(text, boolean, text) to authenticated;

-- El ranking de la liga muestra a todos los que tienen apodo, también a los que no han peleado
-- (con sus 1.000 puntos iniciales). Antes solo salía quien ya tenía peleas.
create or replace function public.ranking_liga(orden text default 'puntos', limite integer default 50)
returns table (apodo text, avatar text, puntos integer, victorias integer, derrotas integer, racha integer, mejor_racha integer)
language sql stable security definer set search_path = ''
as $$
  select p.apodo, p.avatar, coalesce(l.puntos, 1000), coalesce(l.victorias, 0), coalesce(l.derrotas, 0),
    coalesce(l.racha, 0), coalesce(l.mejor_racha, 0)
  from public.perfiles p
  left join public.liga l on l.perfil_id = p.id
  order by
    case orden
      when 'victorias' then coalesce(l.victorias, 0)
      when 'racha' then coalesce(l.mejor_racha, 0)
      else coalesce(l.puntos, 1000)
    end desc,
    coalesce(l.puntos, 1000) desc, coalesce(l.victorias, 0) desc, p.apodo
  limit least(greatest(coalesce(limite, 50), 1), 100);
$$;
