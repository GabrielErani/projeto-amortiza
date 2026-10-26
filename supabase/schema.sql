-- ============================================================================
-- Amortiza — Schema do Supabase (PostgreSQL)
-- Execute este arquivo inteiro no SQL Editor do seu projeto Supabase.
-- É idempotente: pode ser executado mais de uma vez sem quebrar nada.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1) PERFIS — um registro por usuário, criado automaticamente no cadastro.
-- ----------------------------------------------------------------------------
create table if not exists public.perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          text,
  email         text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Cria o perfil assim que um usuário se cadastra (lê o nome enviado no signup).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    new.email
  )
  on conflict (id) do update
    set nome  = coalesce(excluded.nome, public.perfis.nome),
        email = excluded.email,
        atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2) GANHOS — um registro por usuário por dia (chave: user_id + data_referencia).
-- ----------------------------------------------------------------------------
create table if not exists public.ganhos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  data_referencia date not null,
  valor           numeric(12,2) not null default 0,
  meta_do_dia     numeric(12,2),
  percentual      numeric(5,2),
  descricao       text,
  atualizado_em   timestamptz not null default now(),
  unique (user_id, data_referencia)
);

create index if not exists ganhos_user_data_idx
  on public.ganhos (user_id, data_referencia);

-- ----------------------------------------------------------------------------
-- 3) DÍVIDAS — id é texto gerado no app; soft delete via "removido" para que
--    exclusões feitas offline também sincronizem entre dispositivos.
-- ----------------------------------------------------------------------------
create table if not exists public.dividas (
  id                    text not null,
  user_id               uuid not null references auth.users (id) on delete cascade,
  descricao             text not null default '',
  valor                 numeric(12,2) not null default 0,
  tipo                  text not null check (tipo in ('diaria', 'mensal', 'imprevista')),
  frequencia_imprevisto text check (frequencia_imprevisto is null or frequencia_imprevisto in ('diaria', 'mensal', 'anual')),
  data_lancamento       date,
  removido              boolean not null default false,
  atualizado_em         timestamptz not null default now(),
  primary key (user_id, id)
);

-- ----------------------------------------------------------------------------
-- 4) CONFIGURAÇÕES — meta diária base por usuário.
-- ----------------------------------------------------------------------------
create table if not exists public.configuracoes (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  meta_base     numeric(12,2) not null default 100,
  atualizado_em timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5) SEGURANÇA — Row Level Security: cada usuário só enxerga e altera o que é dele.
-- ----------------------------------------------------------------------------
alter table public.perfis        enable row level security;
alter table public.ganhos        enable row level security;
alter table public.dividas       enable row level security;
alter table public.configuracoes enable row level security;

-- perfis
drop policy if exists "perfis_select_proprio" on public.perfis;
create policy "perfis_select_proprio" on public.perfis for select using (auth.uid() = id);
drop policy if exists "perfis_insert_proprio" on public.perfis;
create policy "perfis_insert_proprio" on public.perfis for insert with check (auth.uid() = id);
drop policy if exists "perfis_update_proprio" on public.perfis;
create policy "perfis_update_proprio" on public.perfis for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "perfis_delete_proprio" on public.perfis;
create policy "perfis_delete_proprio" on public.perfis for delete using (auth.uid() = id);

-- ganhos
drop policy if exists "ganhos_select_proprio" on public.ganhos;
create policy "ganhos_select_proprio" on public.ganhos for select using (auth.uid() = user_id);
drop policy if exists "ganhos_insert_proprio" on public.ganhos;
create policy "ganhos_insert_proprio" on public.ganhos for insert with check (auth.uid() = user_id);
drop policy if exists "ganhos_update_proprio" on public.ganhos;
create policy "ganhos_update_proprio" on public.ganhos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "ganhos_delete_proprio" on public.ganhos;
create policy "ganhos_delete_proprio" on public.ganhos for delete using (auth.uid() = user_id);

-- dividas
drop policy if exists "dividas_select_proprio" on public.dividas;
create policy "dividas_select_proprio" on public.dividas for select using (auth.uid() = user_id);
drop policy if exists "dividas_insert_proprio" on public.dividas;
create policy "dividas_insert_proprio" on public.dividas for insert with check (auth.uid() = user_id);
drop policy if exists "dividas_update_proprio" on public.dividas;
create policy "dividas_update_proprio" on public.dividas for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dividas_delete_proprio" on public.dividas;
create policy "dividas_delete_proprio" on public.dividas for delete using (auth.uid() = user_id);

-- configuracoes
drop policy if exists "config_select_proprio" on public.configuracoes;
create policy "config_select_proprio" on public.configuracoes for select using (auth.uid() = user_id);
drop policy if exists "config_insert_proprio" on public.configuracoes;
create policy "config_insert_proprio" on public.configuracoes for insert with check (auth.uid() = user_id);
drop policy if exists "config_update_proprio" on public.configuracoes;
create policy "config_update_proprio" on public.configuracoes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "config_delete_proprio" on public.configuracoes;
create policy "config_delete_proprio" on public.configuracoes for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6) GRANTS mínimos — usuários anônimos não acessam nada; autenticados passam
--    pelas policies acima.
-- ----------------------------------------------------------------------------
revoke all on public.perfis, public.ganhos, public.dividas, public.configuracoes from anon;
grant select, insert, update, delete on public.perfis        to authenticated;
grant select, insert, update, delete on public.ganhos        to authenticated;
grant select, insert, update, delete on public.dividas       to authenticated;
grant select, insert, update, delete on public.configuracoes to authenticated;
