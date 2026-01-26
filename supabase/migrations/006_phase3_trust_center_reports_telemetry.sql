-- Phase 3: Trust Center allowlists + access requests, report exports, telemetry

do $$ begin
  alter type job_type add value if not exists 'EXPORT_REPORT';
exception
  when duplicate_object then null;
end $$;

create table trust_center_allowlist_answers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  answer_id uuid not null references answers(id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint trust_center_allowlist_answers_unique unique (org_id, workspace_id, answer_id)
);

create table trust_center_allowlist_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  evidence_id uuid not null references evidence(id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint trust_center_allowlist_evidence_unique unique (org_id, workspace_id, evidence_id)
);

create table trust_center_access_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  share_id uuid references trust_center_shares(id) on delete set null,
  requester_name text,
  requester_email text,
  requester_company text,
  message text,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  decision_note text,
  constraint trust_center_access_requests_status_check check (status in ('PENDING', 'APPROVED', 'DENIED'))
);

create table trust_center_access_request_answers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references trust_center_access_requests(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  answer_id uuid not null references answers(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table trust_center_access_request_evidence (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references trust_center_access_requests(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  evidence_id uuid not null references evidence(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table report_exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  format text not null,
  status job_status not null default 'QUEUED',
  storage_bucket text,
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  expires_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  constraint report_exports_format_check check (format in ('csv', 'pdf'))
);

create table token_usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  questionnaire_id uuid references questionnaires(id) on delete set null,
  event_type text not null,
  provider text,
  model text,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index trust_center_allowlist_answers_workspace_idx on trust_center_allowlist_answers (workspace_id);
create index trust_center_allowlist_evidence_workspace_idx on trust_center_allowlist_evidence (workspace_id);
create index trust_center_access_requests_workspace_idx on trust_center_access_requests (workspace_id, created_at desc);
create index report_exports_org_idx on report_exports (org_id, created_at desc);
create index token_usage_events_org_idx on token_usage_events (org_id, created_at desc);

alter table trust_center_allowlist_answers enable row level security;
alter table trust_center_allowlist_evidence enable row level security;
alter table trust_center_access_requests enable row level security;
alter table trust_center_access_request_answers enable row level security;
alter table trust_center_access_request_evidence enable row level security;
alter table report_exports enable row level security;
alter table token_usage_events enable row level security;

create policy org_scoped_select_trust_center_allowlist_answers on trust_center_allowlist_answers
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_allowlist_answers.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_trust_center_allowlist_answers on trust_center_allowlist_answers
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_allowlist_answers.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_update_trust_center_allowlist_answers on trust_center_allowlist_answers
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_allowlist_answers.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_select_trust_center_allowlist_evidence on trust_center_allowlist_evidence
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_allowlist_evidence.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_trust_center_allowlist_evidence on trust_center_allowlist_evidence
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_allowlist_evidence.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_update_trust_center_allowlist_evidence on trust_center_allowlist_evidence
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_allowlist_evidence.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_select_trust_center_access_requests on trust_center_access_requests
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_access_requests.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_trust_center_access_requests on trust_center_access_requests
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_access_requests.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_update_trust_center_access_requests on trust_center_access_requests
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_access_requests.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_select_trust_center_access_request_answers on trust_center_access_request_answers
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_access_request_answers.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_trust_center_access_request_answers on trust_center_access_request_answers
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_access_request_answers.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_select_trust_center_access_request_evidence on trust_center_access_request_evidence
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_access_request_evidence.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_trust_center_access_request_evidence on trust_center_access_request_evidence
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_access_request_evidence.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_select_report_exports on report_exports
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = report_exports.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_report_exports on report_exports
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = report_exports.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_update_report_exports on report_exports
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = report_exports.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_select_token_usage_events on token_usage_events
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = token_usage_events.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_token_usage_events on token_usage_events
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = token_usage_events.org_id and m.user_id = auth.uid() and m.role in ('ADMIN', 'EDITOR')
    )
  );
