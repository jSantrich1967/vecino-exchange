-- ============================================================
-- Vecino Exchange — esquema v1
-- Ejecutar en el SQL Editor de Supabase (proyecto nuevo), una sola vez.
-- ============================================================

-- ---------- Perfiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Crear perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: ¿el usuario actual es admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Nadie puede auto-otorgarse admin (ni quitarlo) salvo un admin
create or replace function public.guard_admin_flag()
returns trigger language plpgsql as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el rol de admin';
  end if;
  return new;
end $$;

drop trigger if exists guard_admin_flag on public.profiles;
create trigger guard_admin_flag
  before update on public.profiles
  for each row execute function public.guard_admin_flag();

-- ---------- Ofertas ----------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  side text not null check (side in ('buy','sell')),
  asset text not null default 'USD',
  amount numeric not null check (amount > 0),
  rate_ves numeric not null check (rate_ves > 0),
  pay_method text,
  note text,
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  created_at timestamptz not null default now()
);
create index offers_status_idx on public.offers(status);
create index offers_user_idx on public.offers(user_id);

-- ---------- Operaciones (trades con custodia) ----------
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references public.offers(id) on delete set null,
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  amount_usd numeric not null check (amount_usd > 0),
  rate_ves numeric not null check (rate_ves > 0),
  fee_pct numeric not null default 1.0,
  fee_usd numeric,
  status text not null default 'requested' check (status in (
    'requested','awaiting_buyer','awaiting_seller','in_escrow',
    'released','cancelled','disputed'
  )),
  buyer_confirmed_at timestamptz,
  seller_confirmed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);
create index trades_buyer_idx on public.trades(buyer_id);
create index trades_seller_idx on public.trades(seller_id);
create index trades_status_idx on public.trades(status);

-- ---------- Bitácora de operaciones ----------
create table public.trade_events (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  note text,
  created_at timestamptz not null default now()
);
create index trade_events_trade_idx on public.trade_events(trade_id);

-- ---------- Configuración ----------
create table public.settings (
  key text primary key,
  value text not null default ''
);
insert into public.settings (key, value) values
  ('fee_pct', '1.0'),
  ('manual_oficial', ''),
  ('manual_paralelo', ''),
  ('manual_usdt_buy_ves', ''),
  ('manual_usdt_sell_ves', '')
on conflict (key) do nothing;

-- ---------- Snapshots de tasas ----------
create table public.rate_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null,               -- 'oficial' | 'paralelo' | 'usdt'
  buy_ves numeric,
  sell_ves numeric,
  fetched_at timestamptz not null default now()
);
create index rate_snapshots_source_time_idx on public.rate_snapshots(source, fetched_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.offers enable row level security;
alter table public.trades enable row level security;
alter table public.trade_events enable row level security;
alter table public.settings enable row level security;
alter table public.rate_snapshots enable row level security;

-- profiles: lectura para autenticados; cada quien edita su fila (sin tocar is_admin: lo cuida el trigger)
create policy profiles_read on public.profiles
  for select to authenticated using (true);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- offers: ofertas abiertas visibles para autenticados (+ las propias aunque estén cerradas)
create policy offers_read on public.offers
  for select to authenticated
  using (status = 'open' or user_id = auth.uid() or public.is_admin());
create policy offers_insert on public.offers
  for insert to authenticated
  with check (user_id = auth.uid());
create policy offers_update_own on public.offers
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy offers_delete_own on public.offers
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- trades: solo comprador, vendedor o admin
create policy trades_read on public.trades
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());
-- Los cambios de estado pasan por la función accept_offer / advance_trade (security definer).
-- Se permite insert directo solo si el creador es comprador o vendedor.
create policy trades_insert on public.trades
  for insert to authenticated
  with check (buyer_id = auth.uid() or seller_id = auth.uid());

-- trade_events: lectura como trades; inserción por participantes/admin
create policy trade_events_read on public.trade_events
  for select to authenticated using (
    exists (
      select 1 from public.trades t
      where t.id = trade_events.trade_id
        and (t.buyer_id = auth.uid() or t.seller_id = auth.uid() or public.is_admin())
    )
  );
create policy trade_events_insert on public.trade_events
  for insert to authenticated with check (
    exists (
      select 1 from public.trades t
      where t.id = trade_events.trade_id
        and (t.buyer_id = auth.uid() or t.seller_id = auth.uid() or public.is_admin())
    )
  );

-- settings: lectura autenticada, escritura solo admin
create policy settings_read on public.settings
  for select to authenticated using (true);
create policy settings_admin_write on public.settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- rate_snapshots: lectura autenticada; escritura solo service_role (API /api/rates)
create policy rate_snapshots_read on public.rate_snapshots
  for select to authenticated using (true);

-- ============================================================
-- Lógica de negocio: aceptar oferta y máquina de estados
-- (security definer: validan permisos internamente)
-- ============================================================

create or replace function public.accept_offer(p_offer_id uuid)
returns uuid language plpgsql security definer as $$
declare
  o public.offers%rowtype;
  v_buyer uuid;
  v_seller uuid;
  v_trade uuid;
  v_fee numeric;
begin
  select * into o from public.offers where id = p_offer_id;
  if not found then raise exception 'Oferta no encontrada'; end if;
  if o.status <> 'open' then raise exception 'La oferta ya no está disponible'; end if;
  if o.user_id = auth.uid() then raise exception 'No puedes aceptar tu propia oferta'; end if;

  if o.side = 'sell' then
    v_seller := o.user_id; v_buyer := auth.uid();
  else
    v_buyer := o.user_id; v_seller := auth.uid();
  end if;

  select nullif(value,'')::numeric into v_fee from public.settings where key = 'fee_pct';
  v_fee := coalesce(v_fee, 1.0);

  insert into public.trades (offer_id, buyer_id, seller_id, amount_usd, rate_ves, fee_pct, status)
  values (o.id, v_buyer, v_seller, o.amount, o.rate_ves, v_fee, 'requested')
  returning id into v_trade;

  update public.offers set status = 'closed' where id = o.id;

  insert into public.trade_events (trade_id, actor_id, action, note)
  values (v_trade, auth.uid(), 'created',
          format('Operación creada por oferta %s de %s USD a %s Bs', o.side, o.amount, o.rate_ves));

  return v_trade;
end $$;

create or replace function public.advance_trade(p_trade_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer as $$
declare
  t public.trades%rowtype;
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_admin();
  v_is_buyer boolean;
  v_is_seller boolean;
begin
  select * into t from public.trades where id = p_trade_id;
  if not found then raise exception 'Operación no encontrada'; end if;
  v_is_buyer := (t.buyer_id = v_uid);
  v_is_seller := (t.seller_id = v_uid);
  if not (v_is_buyer or v_is_seller or v_admin) then
    raise exception 'No participas en esta operación';
  end if;

  case p_action
    when 'buyer_paid' then
      if not (v_is_buyer or v_admin) then raise exception 'Solo el comprador confirma el pago'; end if;
      if t.status not in ('requested','awaiting_buyer') then raise exception 'Estado inválido para confirmar pago'; end if;
      update public.trades set status='awaiting_seller', buyer_confirmed_at=now() where id=t.id;

    when 'seller_delivered' then
      if not (v_is_seller or v_admin) then raise exception 'Solo el vendedor confirma la entrega'; end if;
      if t.status <> 'awaiting_seller' then raise exception 'Estado inválido para confirmar entrega'; end if;
      update public.trades set status='in_escrow', seller_confirmed_at=now() where id=t.id;

    when 'release' then
      if not v_admin then raise exception 'Solo el administrador libera fondos'; end if;
      if t.status <> 'in_escrow' then raise exception 'Solo se libera desde custodia'; end if;
      update public.trades
        set status='released',
            released_at=now(),
            fee_usd = round(t.amount_usd * t.fee_pct / 100, 2)
        where id=t.id;

    when 'cancel' then
      if t.status in ('released','cancelled') then raise exception 'La operación ya está cerrada'; end if;
      update public.trades set status='cancelled' where id=t.id;

    when 'dispute' then
      if t.status in ('released','cancelled','disputed') then raise exception 'No se puede disputar en este estado'; end if;
      update public.trades set status='disputed' where id=t.id;

    when 'resolve_escrow' then
      if not v_admin then raise exception 'Solo el administrador resuelve disputas'; end if;
      if t.status <> 'disputed' then raise exception 'No hay disputa que resolver'; end if;
      update public.trades set status='in_escrow' where id=t.id;

    when 'resolve_cancel' then
      if not v_admin then raise exception 'Solo el administrador resuelve disputas'; end if;
      if t.status <> 'disputed' then raise exception 'No hay disputa que resolver'; end if;
      update public.trades set status='cancelled' where id=t.id;

    else
      raise exception 'Acción desconocida: %', p_action;
  end case;

  insert into public.trade_events (trade_id, actor_id, action, note)
  values (t.id, v_uid, p_action, p_note);
end $$;

-- ============================================================
-- Hacer admin al primer usuario (Joreg):
-- Después de registrarte, corre en el SQL Editor:
--
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'TU_CORREO');
-- ============================================================
