-- Cockpit d'atelier — schéma du board partagé.
-- À coller dans Supabase → SQL Editor → Run.
--
-- Modèle : une ligne par atelier (id = NUXT_PUBLIC_BOARD_ID, "default" par défaut),
-- contenant tout l'état (cartes + architecture) en JSONB, synchronisé via Realtime.

create table if not exists public.boards (
  id          text primary key,
  data        jsonb       not null default '{}'::jsonb,
  last_writer text,
  updated_at  timestamptz not null default now()
);

-- Realtime : diffuser les changements de la table.
alter publication supabase_realtime add table public.boards;

-- RLS : board OUVERT (atelier). Quiconque a l'URL + la clé anon peut lire/écrire.
-- ⚠️ Ne pas y mettre de données sensibles. Pour restreindre, remplacer par une
--    policy basée sur auth.uid() une fois l'authentification ajoutée.
alter table public.boards enable row level security;

drop policy if exists "atelier ouvert (lecture)"  on public.boards;
drop policy if exists "atelier ouvert (écriture)" on public.boards;

create policy "atelier ouvert (lecture)"
  on public.boards for select
  using (true);

create policy "atelier ouvert (écriture)"
  on public.boards for all
  using (true) with check (true);
