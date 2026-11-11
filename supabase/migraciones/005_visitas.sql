-- 005: visitas de la web, para mostrarlas arriba junto a los jugadores en línea.
-- Se pega una vez en el SQL Editor del panel de Supabase.
--
-- Cuenta una visita por navegador por día (la web recuerda que ya contó hoy), por día de Chile.
-- Nadie puede escribir la tabla directo: solo sumar una visita con visitas_web(true).

create table public.visitas (
  dia date primary key,
  cuantas integer not null default 0 check (cuantas >= 0)
);
alter table public.visitas enable row level security;
revoke all on public.visitas from anon, authenticated;

-- Con contar = true suma una visita a hoy. Devuelve las de hoy y el total.
create function public.visitas_web(contar boolean default false)
returns table (hoy integer, total bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  d date := (now() at time zone 'America/Santiago')::date;
begin
  if contar then
    insert into public.visitas as v (dia, cuantas) values (d, 1)
    on conflict (dia) do update set cuantas = v.cuantas + 1;
  end if;
  return query
    select coalesce((select v.cuantas from public.visitas v where v.dia = d), 0),
      coalesce((select sum(v.cuantas) from public.visitas v), 0)::bigint;
end;
$$;

revoke all on function public.visitas_web(boolean) from public;
grant execute on function public.visitas_web(boolean) to anon, authenticated;
