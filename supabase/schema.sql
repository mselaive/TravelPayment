-- TravelPayment · esquema de Supabase
-- Pégalo completo en Supabase → SQL Editor → Run. Se puede volver a ejecutar sin romper nada.

-- ───────────────────────── Tablas ─────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Viaje de trabajo',
  start_date date not null,
  end_date date not null,
  per_diem_usd numeric(10, 2) not null default 80 check (per_diem_usd > 0),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.group_receipts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  merchant text not null default '',
  category text not null default 'comida' check (category in ('comida', 'transporte', 'hospedaje', 'otro')),
  total_amount numeric(12, 2) check (total_amount >= 0),
  currency text not null default 'MXN' check (currency in ('MXN', 'USD')),
  fx_rate numeric(10, 4) not null default 1 check (fx_rate > 0),
  receipt_path text,
  guests text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  merchant text not null default '',
  category text not null default 'comida' check (category in ('comida', 'transporte', 'hospedaje', 'otro')),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null check (currency in ('MXN', 'USD')),
  -- pesos mexicanos por 1 dólar, del día del gasto (editable)
  fx_rate numeric(10, 4) not null default 1 check (fx_rate > 0),
  amount_usd numeric(12, 2) generated always as (
    case when currency = 'USD' then amount else round(amount / fx_rate, 2) end
  ) stored,
  receipt_path text,
  uploaded boolean not null default false,
  group_receipt_id uuid references public.group_receipts (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.group_participants (
  id uuid primary key default gen_random_uuid(),
  group_receipt_id uuid not null references public.group_receipts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  expense_id uuid references public.expenses (id) on delete set null,
  responded_at timestamptz,
  unique (group_receipt_id, user_id)
);

create table if not exists public.fx_rates (
  date date primary key,
  mxn_per_usd numeric(10, 4) not null check (mxn_per_usd > 0),
  fetched_at timestamptz not null default now()
);

create index if not exists expenses_trip_user_date on public.expenses (trip_id, user_id, date);
create index if not exists group_participants_user_status on public.group_participants (user_id, status);

-- ───────────────────────── Perfil automático al registrarse ─────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Boletas grupales (atómicas) ─────────────────────────

-- Crea la boleta grupal, el gasto de quien la crea y las solicitudes para los demás.
create or replace function public.create_group_receipt(
  p_trip_id uuid,
  p_date date,
  p_merchant text,
  p_category text,
  p_total numeric,
  p_currency text,
  p_fx_rate numeric,
  p_my_amount numeric,
  p_receipt_path text,
  p_guests text[],
  p_participants uuid[],
  p_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
  v_expense uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  insert into group_receipts (trip_id, created_by, date, merchant, category, total_amount, currency, fx_rate, receipt_path, guests)
  values (p_trip_id, v_uid, p_date, coalesce(p_merchant, ''), p_category, p_total, p_currency, p_fx_rate, p_receipt_path, coalesce(p_guests, '{}'))
  returning id into v_group;

  if coalesce(p_my_amount, 0) > 0 then
    insert into expenses (trip_id, user_id, date, merchant, category, amount, currency, fx_rate, receipt_path, group_receipt_id, notes)
    values (p_trip_id, v_uid, p_date, coalesce(p_merchant, ''), p_category, p_my_amount, p_currency, p_fx_rate, p_receipt_path, v_group, p_notes)
    returning id into v_expense;
  end if;

  insert into group_participants (group_receipt_id, user_id, status, expense_id, responded_at)
  values (v_group, v_uid, 'confirmed', v_expense, now());

  insert into group_participants (group_receipt_id, user_id)
  select v_group, u
  from unnest(coalesce(p_participants, '{}')) as u
  where u <> v_uid
  on conflict do nothing;

  return v_group;
end;
$$;

-- El invitado confirma (con lo que pagó) o rechaza la solicitud.
create or replace function public.respond_group_receipt(
  p_participant_id uuid,
  p_accept boolean,
  p_amount numeric,
  p_currency text,
  p_fx_rate numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_part group_participants;
  v_group group_receipts;
  v_expense uuid;
begin
  select * into v_part
  from group_participants
  where id = p_participant_id and user_id = auth.uid() and status = 'pending'
  for update;

  if not found then
    raise exception 'Solicitud no encontrada o ya respondida';
  end if;

  select * into v_group from group_receipts where id = v_part.group_receipt_id;

  if p_accept and coalesce(p_amount, 0) > 0 then
    insert into expenses (trip_id, user_id, date, merchant, category, amount, currency, fx_rate, receipt_path, group_receipt_id)
    values (v_group.trip_id, auth.uid(), v_group.date, v_group.merchant, v_group.category, p_amount, p_currency, p_fx_rate, v_group.receipt_path, v_group.id)
    returning id into v_expense;
  end if;

  update group_participants
  set status = case when p_accept then 'confirmed' else 'declined' end,
      expense_id = v_expense,
      responded_at = now()
  where id = p_participant_id;
end;
$$;

-- ───────────────────────── Permisos y RLS ─────────────────────────

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.trips, public.group_receipts, public.expenses, public.group_participants, public.fx_rates
  to authenticated;
grant execute on function public.create_group_receipt(uuid, date, text, text, numeric, text, numeric, numeric, text, text[], uuid[], text) to authenticated;
grant execute on function public.respond_group_receipt(uuid, boolean, numeric, text, numeric) to authenticated;
revoke execute on function public.create_group_receipt(uuid, date, text, text, numeric, text, numeric, numeric, text, text[], uuid[], text) from anon, public;
revoke execute on function public.respond_group_receipt(uuid, boolean, numeric, text, numeric) from anon, public;

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.group_receipts enable row level security;
alter table public.expenses enable row level security;
alter table public.group_participants enable row level security;
alter table public.fx_rates enable row level security;

-- Somos pocos y de confianza: todos los usuarios logueados pueden leer todo,
-- pero cada uno solo modifica lo suyo.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "trips read" on public.trips;
create policy "trips read" on public.trips for select to authenticated using (true);
drop policy if exists "trips insert" on public.trips;
create policy "trips insert" on public.trips for insert to authenticated with check (true);
drop policy if exists "trips update" on public.trips;
create policy "trips update" on public.trips for update to authenticated using (true) with check (true);

drop policy if exists "expenses read" on public.expenses;
create policy "expenses read" on public.expenses for select to authenticated using (true);
drop policy if exists "expenses insert own" on public.expenses;
create policy "expenses insert own" on public.expenses for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "expenses update own" on public.expenses;
create policy "expenses update own" on public.expenses for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "expenses delete own" on public.expenses;
create policy "expenses delete own" on public.expenses for delete to authenticated using (user_id = auth.uid());

drop policy if exists "groups read" on public.group_receipts;
create policy "groups read" on public.group_receipts for select to authenticated using (true);
drop policy if exists "groups insert own" on public.group_receipts;
create policy "groups insert own" on public.group_receipts for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "groups update own" on public.group_receipts;
create policy "groups update own" on public.group_receipts for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "participants read" on public.group_participants;
create policy "participants read" on public.group_participants for select to authenticated using (true);
drop policy if exists "participants insert by creator" on public.group_participants;
create policy "participants insert by creator" on public.group_participants for insert to authenticated
  with check (exists (select 1 from public.group_receipts g where g.id = group_receipt_id and g.created_by = auth.uid()));
drop policy if exists "participants respond own" on public.group_participants;
create policy "participants respond own" on public.group_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "fx read" on public.fx_rates;
create policy "fx read" on public.fx_rates for select to authenticated using (true);
drop policy if exists "fx write" on public.fx_rates;
create policy "fx write" on public.fx_rates for insert to authenticated with check (true);

-- ───────────────────────── Fotos de boletas (Storage) ─────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

drop policy if exists "receipts read" on storage.objects;
create policy "receipts read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts');
drop policy if exists "receipts insert own folder" on storage.objects;
create policy "receipts insert own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "receipts delete own folder" on storage.objects;
create policy "receipts delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
