create table org_limits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  max_upload_bytes bigint,
  max_questions int,
  max_active_jobs int,
  monthly_token_budget int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

create table org_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  period_start date not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, period_start)
);

create table org_sso_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  enabled boolean not null default false,
  provider text,
  domain text,
  metadata_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

create table org_features (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  trust_center_enabled boolean not null default false,
  consultant_mode_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

create table org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role org_role not null,
  token text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid
);

create index org_invites_org_idx on org_invites (org_id);
create index org_invites_token_idx on org_invites (token);
create index org_usage_org_period_idx on org_usage (org_id, period_start);

alter table org_limits enable row level security;
alter table org_usage enable row level security;
alter table org_sso_settings enable row level security;
alter table org_features enable row level security;
alter table org_invites enable row level security;

create policy org_scoped_select_org_limits on org_limits
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_limits.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_org_limits on org_limits
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_limits.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_update_org_limits on org_limits
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_limits.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_select_org_usage on org_usage
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_usage.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_org_sso on org_sso_settings
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_sso_settings.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_org_sso on org_sso_settings
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_sso_settings.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_update_org_sso on org_sso_settings
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_sso_settings.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_select_org_features on org_features
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_features.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_org_features on org_features
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_features.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_update_org_features on org_features
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_features.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_select_org_invites on org_invites
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_invites.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_org_invites on org_invites
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_invites.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_update_org_invites on org_invites
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = org_invites.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );
