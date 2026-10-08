-- Run only in a NEW Supabase project. No commercial production resources are reused.
create table public.retention_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','analyst','viewer'))
);
create table public.retention_current (
 singleton boolean primary key default true check(singleton),
 payload jsonb not null,
 updated_at timestamptz not null default now()
);
create table public.retention_imports (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id),
 dataset_id uuid not null,
 source_file text not null,
 audit jsonb not null,
 imported_at timestamptz not null default now()
);
alter table public.retention_roles enable row level security;
alter table public.retention_current enable row level security;
alter table public.retention_imports enable row level security;
-- No client-side policies: all records are accessed exclusively through the authorized server API.
revoke all on public.retention_roles,public.retention_current,public.retention_imports from anon,authenticated;
create or replace function public.replace_retention_dataset(new_payload jsonb, expected_id uuid, actor_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare current_id uuid;
begin
 perform pg_advisory_xact_lock(871991);
 select (payload->>'id')::uuid into current_id from retention_current where singleton=true;
 if current_id is distinct from expected_id then raise exception 'CONFLICT'; end if;
 insert into retention_current(singleton,payload) values(true,new_payload)
 on conflict(singleton) do update set payload=excluded.payload,updated_at=now();
 insert into retention_imports(actor_id,dataset_id,source_file,audit)
 values(actor_id,(new_payload->>'id')::uuid,new_payload->>'fileName',new_payload->'audit');
end $$;
revoke all on function public.replace_retention_dataset(jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.replace_retention_dataset(jsonb,uuid,uuid) to service_role;
