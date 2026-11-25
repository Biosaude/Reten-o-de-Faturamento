-- Apply only to the verified Retention database after reviewing existing grants.
BEGIN;
REVOKE ALL ON TABLE public.retention_current, public.retention_imports,
  public.retention_audit_versions, public.retention_roles FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_retention_dataset(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.retention_current, public.retention_imports,
  public.retention_audit_versions, public.retention_roles TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_retention_dataset(jsonb,uuid,uuid) TO service_role;
DO $effective_acl$
BEGIN
  IF EXISTS (
    SELECT FROM unnest(ARRAY['anon','authenticated']) AS roles(name)
    CROSS JOIN unnest(ARRAY['public.retention_current','public.retention_imports',
      'public.retention_audit_versions','public.retention_roles']) AS rel(name)
    WHERE has_any_column_privilege(roles.name, rel.name, 'SELECT,INSERT,UPDATE,REFERENCES')
       OR has_table_privilege(roles.name, rel.name, 'DELETE,TRUNCATE,TRIGGER')
  ) OR EXISTS (
    SELECT FROM unnest(ARRAY['anon','authenticated']) AS roles(name)
    WHERE has_function_privilege(roles.name, 'public.replace_retention_dataset(jsonb,uuid,uuid)', 'EXECUTE')
  ) THEN RAISE EXCEPTION 'Acesso indireto ou privilégio de coluna ainda ativo'; END IF;
END
$effective_acl$;

NOTIFY pgrst, 'reload schema';
COMMIT;
