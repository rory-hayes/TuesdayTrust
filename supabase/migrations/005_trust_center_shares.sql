create table trust_center_shares (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  token text not null unique,
  include_answers boolean not null default true,
  include_evidence boolean not null default true,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index trust_center_shares_workspace_idx on trust_center_shares (workspace_id);
create index trust_center_shares_token_idx on trust_center_shares (token);

alter table trust_center_shares enable row level security;

create policy org_scoped_select_trust_center_shares on trust_center_shares
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_shares.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_trust_center_shares on trust_center_shares
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_shares.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );

create policy org_scoped_update_trust_center_shares on trust_center_shares
  for update using (
    exists (
      select 1 from org_memberships m
      where m.org_id = trust_center_shares.org_id and m.user_id = auth.uid() and m.role = 'ADMIN'
    )
  );
