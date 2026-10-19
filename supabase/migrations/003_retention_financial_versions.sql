-- One-time infrastructure upgrade, never executed by the application or weekly operator.
begin;
alter table public.retention_audit_versions add column financial_complete boolean not null default false;
-- Only the current complete payload is recoverable. Never label old audit-only archives as financial versions.
insert into public.retention_audit_versions(dataset_id,as_of,source_file,published_at,payload,financial_complete)
select (payload->>'id')::uuid,payload->>'asOf',coalesce(payload->>'fileName','Arquivo não identificado'),
 coalesce((payload->>'updatedAt')::timestamptz,updated_at),payload,true
from public.retention_current where singleton=true
on conflict(dataset_id) do update set payload=excluded.payload,financial_complete=true
where not retention_audit_versions.financial_complete;

create or replace function public.replace_retention_dataset(new_payload jsonb, expected_id uuid, actor_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare prior jsonb; current_id uuid;
begin
 perform pg_advisory_xact_lock(871991);
 select payload into prior from retention_current where singleton=true;
 current_id := (prior->>'id')::uuid;
 if current_id is distinct from expected_id then raise exception 'CONFLICT'; end if;
 if prior is not null then
  insert into retention_audit_versions(dataset_id,as_of,source_file,published_at,payload,financial_complete)
  values(current_id,prior->>'asOf',coalesce(prior->>'fileName','Arquivo não identificado'),
   coalesce((prior->>'updatedAt')::timestamptz,now()),prior,true)
  on conflict(dataset_id) do update set payload=excluded.payload,financial_complete=true
  where not retention_audit_versions.financial_complete;
 end if;
 insert into retention_audit_versions(dataset_id,as_of,source_file,published_at,payload,financial_complete)
 values((new_payload->>'id')::uuid,new_payload->>'asOf',new_payload->>'fileName',
  (new_payload->>'updatedAt')::timestamptz,new_payload,true);
 insert into retention_current(singleton,payload) values(true,new_payload)
 on conflict(singleton) do update set payload=excluded.payload,updated_at=now();
 insert into retention_imports(actor_id,dataset_id,source_file,audit)
 values(actor_id,(new_payload->>'id')::uuid,new_payload->>'fileName',new_payload->'audit');
end $$;
revoke all on function public.replace_retention_dataset(jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.replace_retention_dataset(jsonb,uuid,uuid) to service_role;
commit;
