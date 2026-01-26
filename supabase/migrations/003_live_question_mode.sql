create type live_question_action as enum ('accepted', 'edited', 'new_answer_needed');

create table live_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  question_text text not null,
  context jsonb not null default '{}'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table live_question_mappings (
  id uuid primary key default gen_random_uuid(),
  live_question_id uuid not null references live_questions(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  selected_answer_id uuid references answers(id),
  selected_variant_id uuid references answer_variants(id),
  action live_question_action not null,
  final_text text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index live_questions_org_workspace_idx on live_questions (org_id, workspace_id, created_at desc);
create index live_question_mappings_question_idx on live_question_mappings (live_question_id);

alter table live_questions enable row level security;
alter table live_question_mappings enable row level security;

create policy org_scoped_select_live_questions on live_questions
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = live_questions.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_live_questions on live_questions
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = live_questions.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_select_live_question_mappings on live_question_mappings
  for select using (
    exists (
      select 1 from org_memberships m
      where m.org_id = live_question_mappings.org_id and m.user_id = auth.uid()
    )
  );

create policy org_scoped_modify_live_question_mappings on live_question_mappings
  for insert with check (
    exists (
      select 1 from org_memberships m
      where m.org_id = live_question_mappings.org_id and m.user_id = auth.uid()
    )
  );
