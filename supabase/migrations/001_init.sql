create extension if not exists pgcrypto;
create extension if not exists vector;

-- Enums
create type org_role as enum ('ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER');
create type answer_status as enum ('DRAFT', 'APPROVED', 'DEPRECATED');
create type questionnaire_status as enum (
  'UPLOADED',
  'QUEUED',
  'PARSING',
  'PARSED',
  'EMBEDDING',
  'MATCHING',
  'READY_FOR_REVIEW',
  'EXPORTING',
  'COMPLETED',
  'FAILED'
);
create type job_type as enum ('PROCESS_QUESTIONNAIRE', 'EXPORT_QUESTIONNAIRE', 'REINDEX_ANSWERS', 'DEDUPE_ANSWERS');
create type job_status as enum ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
create type confidence_bucket as enum ('AUTO_FILL', 'NEEDS_REVIEW', 'MANUAL');
create type sensitivity_level as enum ('STANDARD', 'SENSITIVE', 'RESTRICTED');

-- Core tables
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table org_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  role org_role not null,
  created_at timestamptz not null default now()
);

create table workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,
  role org_role not null,
  created_at timestamptz not null default now()
);

create table questionnaires (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  source text not null,
  status questionnaire_status not null default 'UPLOADED',
  progress_total int not null default 0,
  progress_done int not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  failed_reason text
);

create table questionnaire_files (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references questionnaires(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  checksum_sha256 text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  constraint questionnaire_files_kind_check check (kind in ('input', 'export'))
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references questionnaires(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  index int not null,
  section text,
  prompt text not null,
  raw_prompt text not null,
  response_type text not null,
  constraints jsonb not null default '{}'::jsonb,
  source_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  body text not null,
  status answer_status not null default 'DRAFT',
  owner_user_id uuid not null,
  tags text[] not null default '{}',
  scope jsonb not null default '{}'::jsonb,
  sensitivity sensitivity_level not null default 'STANDARD',
  review_interval_days int not null default 365,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table answer_variants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  answer_id uuid not null references answers(id) on delete cascade,
  body text not null,
  scope_override jsonb,
  status answer_status not null default 'DRAFT',
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null,
  title text not null,
  url text,
  storage_bucket text,
  storage_path text,
  access_level text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table answer_evidence_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  answer_id uuid not null references answers(id) on delete cascade,
  evidence_id uuid not null references evidence(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table answer_embeddings (
  answer_id uuid primary key references answers(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  embedding vector,
  embedding_model text,
  created_at timestamptz not null default now()
);

create table question_embeddings (
  question_id uuid primary key references questions(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  embedding vector,
  embedding_model text,
  created_at timestamptz not null default now()
);

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  selected_answer_id uuid references answers(id),
  selected_variant_id uuid references answer_variants(id),
  confidence_score numeric not null default 0,
  confidence_bucket confidence_bucket not null,
  reasons jsonb not null default '{}'::jsonb,
  status text not null default 'proposed',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  actor_user_id uuid,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  job_type job_type not null,
  status job_status not null default 'QUEUED',
  payload jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  max_attempts int not null default 3,
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text
);

create table job_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  status text not null,
  error text,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index answers_org_workspace_status_idx on answers (org_id, workspace_id, status);
create index questions_questionnaire_idx on questions (questionnaire_id, index);
create index suggestions_question_idx on suggestions (question_id);
create index audit_events_org_created_idx on audit_events (org_id, created_at desc);
create index jobs_status_run_idx on jobs (status, next_run_at);

-- Storage buckets
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict do nothing;

insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict do nothing;

-- RLS enable
alter table organizations enable row level security;
alter table workspaces enable row level security;
alter table org_memberships enable row level security;
alter table workspace_memberships enable row level security;
alter table questionnaires enable row level security;
alter table questionnaire_files enable row level security;
alter table questions enable row level security;
alter table answers enable row level security;
alter table answer_variants enable row level security;
alter table evidence enable row level security;
alter table answer_evidence_links enable row level security;
alter table answer_embeddings enable row level security;
alter table question_embeddings enable row level security;
alter table suggestions enable row level security;
alter table audit_events enable row level security;
alter table jobs enable row level security;
alter table job_attempts enable row level security;

-- RLS policies
create policy org_memberships_self_select on org_memberships
  for select using (user_id = auth.uid());

create policy org_memberships_self_insert on org_memberships
  for insert with check (user_id = auth.uid());

create policy organizations_member_select on organizations
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = organizations.id and m.user_id = auth.uid()
    )
  );

create policy organizations_member_update on organizations
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = organizations.id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy workspaces_member_select on workspaces
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = workspaces.org_id and m.user_id = auth.uid()
    )
  );

create policy workspaces_member_update on workspaces
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = workspaces.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy workspace_memberships_self_select on workspace_memberships
  for select using (user_id = auth.uid());

create policy workspace_memberships_self_insert on workspace_memberships
  for insert with check (user_id = auth.uid());

create policy org_scoped_select on questionnaires
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = questionnaires.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify on questionnaires
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = questionnaires.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_update on questionnaires
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = questionnaires.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_files on questionnaire_files
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = questionnaire_files.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_files on questionnaire_files
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = questionnaire_files.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_questions on questions
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = questions.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_questions on questions
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = questions.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_answers on answers
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = answers.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_answers on answers
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = answers.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_update_answers on answers
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = answers.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_variants on answer_variants
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = answer_variants.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_variants on answer_variants
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = answer_variants.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_evidence on evidence
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = evidence.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_evidence on evidence
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = evidence.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_links on answer_evidence_links
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = answer_evidence_links.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_links on answer_evidence_links
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = answer_evidence_links.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_answer_embeddings on answer_embeddings
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = answer_embeddings.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_answer_embeddings on answer_embeddings
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = answer_embeddings.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_question_embeddings on question_embeddings
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = question_embeddings.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_question_embeddings on question_embeddings
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = question_embeddings.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_suggestions on suggestions
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = suggestions.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_suggestions on suggestions
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = suggestions.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_audit_events on audit_events
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = audit_events.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_audit_events on audit_events
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = audit_events.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_jobs on jobs
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = jobs.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_jobs on jobs
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = jobs.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_update_jobs on jobs
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = jobs.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_job_attempts on job_attempts
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = (select org_id from jobs j where j.id = job_attempts.job_id) and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_job_attempts on job_attempts
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = (select org_id from jobs j where j.id = job_attempts.job_id) and m.user_id = auth.uid()
    )
  );

-- Storage policies
create policy storage_org_access on storage.objects
  for all
  using (
    auth.role() = 'service_role'
    or (
      bucket_id in ('uploads', 'exports')
      and exists (
        select 1 from org_memberships m
        where m.org_id::text = split_part(storage.objects.name, '/', 2)
          and m.user_id = auth.uid()
      )
    )
  )
  with check (
    auth.role() = 'service_role'
    or (
      bucket_id in ('uploads', 'exports')
      and exists (
        select 1 from org_memberships m
        where m.org_id::text = split_part(storage.objects.name, '/', 2)
          and m.user_id = auth.uid()
      )
    )
  );
