-- Review and apply explicitly in the retention project. This migration is never run by the app.
-- Preserve existing imports and add append-only audit snapshots; no financial records are deleted.
begin;
create table public.retention_audit_versions (
 dataset_id uuid primary key,
 as_of text,
 source_file text not null,
 published_at timestamptz not null,
 payload jsonb not null
);
alter table public.retention_audit_versions enable row level security;
revoke all on public.retention_audit_versions from public,anon,authenticated;
grant select on public.retention_audit_versions to service_role;

-- Only rows relevant to an issue are retained in the audit archive. J/Patient is never captured.
-- Legacy snapshots retain available issue records; unavailable rejected fields are not invented.
create function public.retention_audit_snapshot(ds jsonb)
returns jsonb language sql immutable set search_path=public as $$
 select jsonb_build_object(
  'id',ds->'id','asOf',ds->'asOf','fileName',ds->'fileName','updatedAt',ds->'updatedAt',
  'audit',ds->'audit','issues',coalesce(ds->'issues','[]'::jsonb),
  'auditRecords',coalesce(ds->'auditRecords','[]'::jsonb),
  'records',coalesce((select jsonb_agg(r) from jsonb_array_elements(coalesce(ds->'records','[]'::jsonb)) r
    where r->>'sourceRow' in (select i->>'row' from jsonb_array_elements(coalesce(ds->'issues','[]'::jsonb)) i)), '[]'::jsonb)
 );
$$;
revoke all on function public.retention_audit_snapshot(jsonb) from public,anon,authenticated;

-- Retain the currently available version when the migration is applied. Existing import logs stay intact.
insert into public.retention_audit_versions(dataset_id,as_of,source_file,published_at,payload)
select (payload->>'id')::uuid,payload->>'asOf',coalesce(payload->>'fileName','Arquivo não identificado'),
 coalesce((payload->>'updatedAt')::timestamptz,updated_at),public.retention_audit_snapshot(payload)
from public.retention_current where singleton=true;

create or replace function public.replace_retention_dataset(new_payload jsonb, expected_id uuid, actor_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare prior jsonb; current_id uuid;
begin
 perform pg_advisory_xact_lock(871991);
 select payload into prior from retention_current where singleton=true;
 current_id := (prior->>'id')::uuid;
 if current_id is distinct from expected_id then raise exception 'CONFLICT'; end if;
 if prior is not null then
  insert into retention_audit_versions(dataset_id,as_of,source_file,published_at,payload)
  values(current_id,prior->>'asOf',coalesce(prior->>'fileName','Arquivo não identificado'),
   coalesce((prior->>'updatedAt')::timestamptz,now()),public.retention_audit_snapshot(prior))
  on conflict(dataset_id) do nothing;
 end if;
 -- Any archive or import-log failure rolls back the current payload and cutoff together.
 insert into retention_audit_versions(dataset_id,as_of,source_file,published_at,payload)
 values((new_payload->>'id')::uuid,new_payload->>'asOf',new_payload->>'fileName',now(),public.retention_audit_snapshot(new_payload));
 insert into retention_current(singleton,payload) values(true,new_payload)
 on conflict(singleton) do update set payload=excluded.payload,updated_at=now();
 insert into retention_imports(actor_id,dataset_id,source_file,audit)
 values(actor_id,(new_payload->>'id')::uuid,new_payload->>'fileName',new_payload->'audit');
end $$;
revoke all on function public.replace_retention_dataset(jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.replace_retention_dataset(jsonb,uuid,uuid) to service_role;

commit;
