-- ================================================================
-- Vera v1 — Week 1 Schema Migration
-- Tables: workspaces, cases, case_messages, kb_articles,
--         corrections, actions_audit, intake_sources
-- RLS: workspace_id on all tables, JWT claim isolation
-- ================================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────
-- 1. workspaces
-- ────────────────────────────────────────────────────────────────
create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  plan        text not null default 'dogfood' check (plan in ('dogfood', 'pilot', 'paid')),
  created_at  timestamptz not null default now()
);

alter table workspaces enable row level security;

-- Operators see only their own workspace (matched via JWT claim)
create policy "workspace_self_select" on workspaces
  for select using (id::text = auth.jwt()->>'workspace_id');

-- ────────────────────────────────────────────────────────────────
-- 2. intake_sources
-- ────────────────────────────────────────────────────────────────
create table intake_sources (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  channel       text not null check (channel in ('email', 'discord', 'widget', 'api')),
  config        jsonb not null default '{}',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table intake_sources enable row level security;

create policy "intake_sources_workspace_isolation" on intake_sources
  for all using (workspace_id::text = auth.jwt()->>'workspace_id');

-- ────────────────────────────────────────────────────────────────
-- 3. cases
-- ────────────────────────────────────────────────────────────────
create table cases (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,
  intake_source_id      uuid references intake_sources(id),
  -- Contact
  customer_email        text,
  customer_name         text,
  -- Content
  subject               text,
  body                  text,
  -- Triage
  tier                  text check (tier in ('T1', 'T2', 'T3')),
  confidence_score      numeric(4,3) check (confidence_score between 0 and 1),
  -- Status
  status                text not null default 'open'
                          check (status in ('open', 'pending', 'resolved', 'escalated')),
  -- Resolution
  resolution_note       text,
  resolved_at           timestamptz,
  -- Reopen tracking (Week 1 schema, logic deferred to pilot phase)
  reopened_from_case_id uuid references cases(id),
  -- Repeated contact detection (48h lookback for T1 exclusion)
  is_repeat_contact     boolean not null default false,
  -- Timestamps
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table cases enable row level security;

create policy "cases_workspace_isolation" on cases
  for all using (workspace_id::text = auth.jwt()->>'workspace_id');

-- Email idempotency: 48h lookback query handled at application layer
-- Index supports: SELECT ... WHERE workspace_id=? AND customer_email=? AND created_at > now()-interval '48h'
create index cases_email_idempotency_idx
  on cases (workspace_id, customer_email, created_at)
  where status = 'open';

-- Queue sort: open cases by tier + created_at
create index cases_queue_idx on cases (workspace_id, status, tier, created_at);

-- Repeat contact lookback
create index cases_repeat_contact_idx on cases (workspace_id, customer_email, created_at);

-- ────────────────────────────────────────────────────────────────
-- 4. case_messages
-- ────────────────────────────────────────────────────────────────
create table case_messages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  case_id       uuid not null references cases(id) on delete cascade,
  role          text not null check (role in ('customer', 'vera', 'operator')),
  content       text not null,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

alter table case_messages enable row level security;

create policy "case_messages_workspace_isolation" on case_messages
  for all using (workspace_id::text = auth.jwt()->>'workspace_id');

create index case_messages_case_idx on case_messages (case_id, created_at);

-- ────────────────────────────────────────────────────────────────
-- 5. kb_articles
-- ────────────────────────────────────────────────────────────────
create table kb_articles (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  title             text not null,
  content           text not null,
  -- Versioning (single-level undo, pilot requirement)
  previous_content  jsonb,           -- { title, content, edited_at }
  edited_by         text,            -- operator user id or 'vera'
  edited_at         timestamptz,
  -- Status
  source            text not null default 'manual'
                      check (source in ('manual', 'vera', 'seeded')),
  status            text not null default 'active'
                      check (status in ('active', 'draft', 'archived')),
  -- Usage stats (updated by resolution pipeline)
  use_count         integer not null default 0,
  last_used_at      timestamptz,
  -- Timestamps
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table kb_articles enable row level security;

create policy "kb_articles_workspace_isolation" on kb_articles
  for all using (workspace_id::text = auth.jwt()->>'workspace_id');

-- Full-text search on KB articles
create index kb_articles_fts_idx
  on kb_articles using gin(to_tsvector('english', title || ' ' || content));

-- ────────────────────────────────────────────────────────────────
-- 6. corrections
-- ────────────────────────────────────────────────────────────────
create table corrections (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  case_id        uuid references cases(id) on delete set null,
  kb_article_id  uuid references kb_articles(id) on delete set null,
  -- What Vera said vs. what the operator corrected it to
  vera_response  text,
  correct_answer text not null,
  operator_note  text,
  -- Whether this correction has been incorporated into KB
  incorporated   boolean not null default false,
  incorporated_at timestamptz,
  created_at     timestamptz not null default now()
);

alter table corrections enable row level security;

create policy "corrections_workspace_isolation" on corrections
  for all using (workspace_id::text = auth.jwt()->>'workspace_id');

-- ────────────────────────────────────────────────────────────────
-- 7. actions_audit
-- ────────────────────────────────────────────────────────────────
create table actions_audit (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  case_id       uuid references cases(id) on delete set null,
  -- Action details
  action_type   text not null,       -- e.g. 'password_reset', 'tier_override', 'kb_edit'
  actor         text not null,       -- 'vera' | 'operator:{user_id}'
  target        text,                -- email, article_id, etc.
  payload       jsonb not null default '{}',
  -- Result
  outcome       text check (outcome in ('success', 'failure', 'rate_limited', 'skipped')),
  error_message text,
  -- Timestamps
  created_at    timestamptz not null default now()
);

alter table actions_audit enable row level security;

create policy "actions_audit_workspace_isolation" on actions_audit
  for all using (workspace_id::text = auth.jwt()->>'workspace_id');

-- Rate limiting lookback: recent actions by type + target
create index actions_audit_rate_limit_idx
  on actions_audit (workspace_id, action_type, target, created_at);

-- ────────────────────────────────────────────────────────────────
-- updated_at triggers (cases + kb_articles)
-- ────────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cases_updated_at
  before update on cases
  for each row execute function set_updated_at();

create trigger kb_articles_updated_at
  before update on kb_articles
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- Seed: dogfood workspace (Verto Studios)
-- workspace_id must match the JWT claim injected for Mads's login
-- ────────────────────────────────────────────────────────────────
insert into workspaces (id, name, slug, plan)
values (
  '00000000-0000-0000-0000-000000000001',
  'Verto Studios',
  'verto',
  'dogfood'
);
