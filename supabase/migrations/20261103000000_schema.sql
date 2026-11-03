create extension if not exists pgcrypto with schema extensions;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  share_token text not null unique check (share_token ~ '^[A-Za-z0-9]{22}$'),
  name text not null check (btrim(name) <> ''),
  default_currency text not null check (default_currency in ('TWD', 'JPY')),
  created_at timestamptz not null default now()
);
create table public.trip_access (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (trip_id, user_id)
);
create index trip_access_user_id_idx on public.trip_access(user_id, trip_id);
create table public.members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  name text not null check (btrim(name) <> ''),
  avatar_id text not null check (avatar_id in (
    'bear','cat','penguin','fox','rabbit','dog','panda','koala',
    'owl','frog','tiger','otter','hamster','deer','seal','duck')),
  created_at timestamptz not null default now(),
  unique (trip_id, id),
  constraint members_trip_avatar_key unique (trip_id, avatar_id)
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  title text not null check (btrim(title) <> ''),
  amount bigint not null check (amount > 0),
  currency text not null check (currency in ('TWD', 'JPY')),
  spent_on date not null,
  paid_by uuid not null,
  receipt_path text,
  receipt_raw jsonb,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, id),
  foreign key (trip_id, paid_by) references public.members(trip_id, id),
  foreign key (trip_id, created_by) references public.members(trip_id, id),
  foreign key (trip_id, updated_by) references public.members(trip_id, id)
);
create table public.expense_splits (
  trip_id uuid not null,
  expense_id uuid not null,
  member_id uuid not null,
  primary key (expense_id, member_id),
  foreign key (trip_id, expense_id) references public.expenses(trip_id, id) on delete cascade,
  foreign key (trip_id, member_id) references public.members(trip_id, id)
);
create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  expense_id uuid not null,
  position integer not null check (position >= 0),
  name text not null check (btrim(name) <> ''),
  name_zh text,
  qty numeric not null check (qty > 0),
  unit_price bigint, -- may be negative or zero: discount lines, free items
  amount bigint not null, -- items are a record only; never used for splitting
  unique (expense_id, position),
  foreign key (trip_id, expense_id) references public.expenses(trip_id, id) on delete cascade
);
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  from_member uuid not null,
  to_member uuid not null,
  amount bigint not null check (amount > 0),
  currency text not null check (currency in ('TWD', 'JPY')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check (from_member <> to_member),
  foreign key (trip_id, from_member) references public.members(trip_id, id),
  foreign key (trip_id, to_member) references public.members(trip_id, id),
  foreign key (trip_id, created_by) references public.members(trip_id, id)
);
create index expenses_trip_date_idx on public.expenses(trip_id, spent_on desc);
create index expense_splits_trip_idx on public.expense_splits(trip_id);
create index expense_items_trip_idx on public.expense_items(trip_id);
create index settlements_trip_idx on public.settlements(trip_id);

alter table public.trips enable row level security;
alter table public.trip_access enable row level security;
alter table public.members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.expense_items enable row level security;
alter table public.settlements enable row level security;
