-- Provider-independent flight architecture -------------------------------

-- 1. Search audit / cache
create table if not exists public.flight_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  trip_type text not null default 'oneway',
  origin_code text not null,
  destination_code text not null,
  departure_date date not null,
  return_date date,
  adults int not null default 1,
  children int not null default 0,
  infants int not null default 0,
  cabin_class text not null default 'economy',
  result_count int not null default 0,
  cache_key text,
  status text not null default 'ok',
  error_message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);
create index if not exists flight_searches_cache_idx on public.flight_searches(cache_key, expires_at desc);

grant select, insert on public.flight_searches to authenticated;
grant select, insert on public.flight_searches to anon;
grant all on public.flight_searches to service_role;
alter table public.flight_searches enable row level security;
create policy "staff read searches" on public.flight_searches for select to authenticated
  using (public.has_role(auth.uid(),'admin'::app_role) or public.has_role(auth.uid(),'agent'::app_role));

-- 2. Normalised results (no fabricated prices: price columns stay null unless a
--    real bookable supplier fare was returned)
create table if not exists public.flight_results (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches(id) on delete cascade,
  provider text not null,
  provider_reference text,
  flight_number text,
  airline text,
  airline_code text,
  aircraft text,
  origin text,
  origin_code text,
  destination text,
  destination_code text,
  departure_datetime timestamptz,
  arrival_datetime timestamptz,
  duration_minutes int,
  stops int not null default 0,
  status text,
  cabin_class text,
  supplier_price numeric,
  markup_amount numeric,
  customer_price numeric,
  currency text,
  bookable boolean not null default false,
  pricing_rule_id uuid references public.pricing_rules(id) on delete set null,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists flight_results_search_idx on public.flight_results(search_id);

grant select, insert on public.flight_results to authenticated;
grant select, insert on public.flight_results to anon;
grant all on public.flight_results to service_role;
alter table public.flight_results enable row level security;
create policy "staff read results" on public.flight_results for select to authenticated
  using (public.has_role(auth.uid(),'admin'::app_role) or public.has_role(auth.uid(),'agent'::app_role));

-- 3. Flight-specific extension of the existing bookings table
create table if not exists public.flight_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null default 'none',
  provider_booking_reference text,
  provider_offer_id text,
  pnr text,
  booking_status text not null default 'SEARCHED',
  payment_status text not null default 'PENDING',
  ticket_status text not null default 'NOT_ISSUED',
  currency text not null default 'USD',
  supplier_total numeric,
  markup_total numeric,
  customer_total numeric,
  pricing_rule_id uuid references public.pricing_rules(id) on delete set null,
  pricing_rule_name text,
  trip_type text,
  origin_code text,
  destination_code text,
  departure_date date,
  return_date date,
  cabin_class text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.flight_bookings to authenticated;
grant all on public.flight_bookings to service_role;
alter table public.flight_bookings enable row level security;
create policy "own flight bookings" on public.flight_bookings for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'::app_role) or public.has_role(auth.uid(),'agent'::app_role));
create policy "admins manage flight bookings" on public.flight_bookings for update to authenticated
  using (public.has_role(auth.uid(),'admin'::app_role) or public.has_role(auth.uid(),'agent'::app_role));

-- 4. Passengers
create table if not exists public.booking_passengers (
  id uuid primary key default gen_random_uuid(),
  flight_booking_id uuid not null references public.flight_bookings(id) on delete cascade,
  passenger_type text not null default 'adult',
  title text,
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  nationality text,
  passport_number text,
  passport_expiry date,
  ticket_number text,
  created_at timestamptz not null default now()
);
create index if not exists booking_passengers_fb_idx on public.booking_passengers(flight_booking_id);
grant select on public.booking_passengers to authenticated;
grant all on public.booking_passengers to service_role;
alter table public.booking_passengers enable row level security;
create policy "staff or owner read passengers" on public.booking_passengers for select to authenticated
  using (exists (select 1 from public.flight_bookings fb where fb.id = flight_booking_id
    and (fb.user_id = auth.uid() or public.has_role(auth.uid(),'admin'::app_role) or public.has_role(auth.uid(),'agent'::app_role))));

-- 5. Segments
create table if not exists public.booking_segments (
  id uuid primary key default gen_random_uuid(),
  flight_booking_id uuid not null references public.flight_bookings(id) on delete cascade,
  segment_index int not null default 0,
  direction text not null default 'outbound',
  provider text,
  provider_reference text,
  flight_number text,
  airline text,
  airline_code text,
  aircraft text,
  origin_code text,
  destination_code text,
  departure_datetime timestamptz,
  arrival_datetime timestamptz,
  duration_minutes int,
  cabin_class text,
  status text,
  created_at timestamptz not null default now()
);
create index if not exists booking_segments_fb_idx on public.booking_segments(flight_booking_id);
grant select on public.booking_segments to authenticated;
grant all on public.booking_segments to service_role;
alter table public.booking_segments enable row level security;
create policy "staff or owner read segments" on public.booking_segments for select to authenticated
  using (exists (select 1 from public.flight_bookings fb where fb.id = flight_booking_id
    and (fb.user_id = auth.uid() or public.has_role(auth.uid(),'admin'::app_role) or public.has_role(auth.uid(),'agent'::app_role))));

-- 6. Payments (provider-agnostic)
create table if not exists public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  flight_booking_id uuid references public.flight_bookings(id) on delete cascade,
  provider text not null default 'manual',
  transaction_reference text,
  amount numeric not null,
  currency text not null default 'USD',
  status text not null default 'PENDING',
  method text,
  failure_reason text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.booking_payments to authenticated;
grant all on public.booking_payments to service_role;
alter table public.booking_payments enable row level security;
create policy "staff read payments" on public.booking_payments for select to authenticated
  using (public.has_role(auth.uid(),'admin'::app_role) or public.has_role(auth.uid(),'agent'::app_role));

-- 7. Provider request/response log (never stores secrets)
create table if not exists public.flight_provider_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  action text not null,
  endpoint text,
  request_at timestamptz not null default now(),
  response_at timestamptz,
  duration_ms int,
  success boolean not null default false,
  http_status int,
  provider_reference text,
  error_code text,
  error_message text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists flight_provider_logs_created_idx on public.flight_provider_logs(created_at desc);
grant select on public.flight_provider_logs to authenticated;
grant all on public.flight_provider_logs to service_role;
alter table public.flight_provider_logs enable row level security;
create policy "admins read provider logs" on public.flight_provider_logs for select to authenticated
  using (public.has_role(auth.uid(),'admin'::app_role));