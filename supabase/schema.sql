create table if not exists public.users (
  id text primary key,
  name text not null,
  email text not null unique,
  "passwordHash" text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  avatar text,
  phone text,
  address text,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.categories (
  id text primary key,
  slug text not null unique,
  name text not null,
  icon text not null default '🌱',
  image text,
  "productCount" integer not null default 0,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null,
  "categoryName" text not null,
  price numeric(10, 2) not null default 0,
  "originalPrice" numeric(10, 2) not null default 0,
  weight text not null default '500g',
  "stockCount" integer not null default 50,
  image text,
  description text,
  "isOrganic" boolean not null default true,
  "isFeatured" boolean not null default true,
  "inStock" boolean not null default true,
  rating numeric(3, 2) not null default 5,
  "reviewCount" integer not null default 1,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.user_data (
  "userId" text not null references public.users(id) on delete cascade,
  "dataType" text not null check ("dataType" in ('cart', 'wishlist', 'addresses')),
  payload jsonb not null default '[]'::jsonb,
  "updatedAt" timestamptz not null default now(),
  primary key ("userId", "dataType")
);

create table if not exists public.user_sessions (
  "tokenHash" char(64) primary key,
  "userId" text not null references public.users(id) on delete cascade,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now()
);

create index if not exists user_sessions_user_id_idx on public.user_sessions ("userId");

create table if not exists public.orders (
  id text not null,
  "userId" text not null references public.users(id) on delete cascade,
  total numeric(10, 2) not null,
  status text not null default 'processing',
  payload jsonb not null,
  "createdAt" timestamptz not null default now(),
  primary key ("userId", id)
);

create index if not exists orders_created_at_idx on public.orders ("createdAt" desc);
create index if not exists orders_user_created_at_idx on public.orders ("userId", "createdAt" desc);

alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.user_data enable row level security;
alter table public.user_sessions enable row level security;
alter table public.orders enable row level security;

grant all on table
  public.users,
  public.categories,
  public.products,
  public.user_data,
  public.user_sessions,
  public.orders
to service_role;
