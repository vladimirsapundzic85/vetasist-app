-- Pilot setup, not applied automatically. Run in an isolated test project first.
begin;
create table public.airs_check_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  device_id text not null,
  request_ref text not null check (length(request_ref) between 1 and 120),
  animal_ids jsonb not null check (jsonb_typeof(animal_ids) = 'array' and jsonb_array_length(animal_ids) between 1 and 20),
  tool_code text not null check (tool_code = 'goveda_pregled_kretanja'),
  status text not null default 'queued' check (status in ('queued','running','completed','needs_review','failed')),
  claim_token uuid,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null,
  unique (org_id,request_ref)
);
-- Includes queued jobs: no backlog or competing jobs on the same browser.
create unique index airs_check_jobs_one_active_device on public.airs_check_jobs(org_id,device_id) where status in ('queued','running');
alter table public.airs_check_jobs enable row level security;
revoke all on public.airs_check_jobs from public, anon, authenticated;
grant select,insert,update,delete on public.airs_check_jobs to service_role;
comment on table public.airs_check_jobs is 'Read-only AIRS checks; server-only access; no AIRS cookies or credentials stored.';
commit;
