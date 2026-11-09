-- Somente leitura; revisar a janela UTC antes da execução por operador autorizado.
-- Incidente: 09/11/2026 17:01:08 GMT-3 = 20:01:08 UTC.
-- Nenhum payload, valor financeiro, paciente, arquivo ou credencial é selecionado.
-- Não é migration e não é executado pela aplicação.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT current_setting('transaction_read_only') AS read_only,
       current_setting('transaction_isolation') AS isolation;

SELECT payload->>'id' AS dataset_id,
       payload->>'asOf' AS reference_date,
       payload->>'updatedAt' AS published_at,
       jsonb_array_length(payload->'records') AS valid_rows
FROM public.retention_current
WHERE singleton = true;

SELECT i.dataset_id,
       i.imported_at,
       (c.payload->>'id' = i.dataset_id::text) AS is_current,
       (a.dataset_id IS NOT NULL) AS has_archive,
       a.financial_complete
FROM public.retention_imports AS i
LEFT JOIN public.retention_audit_versions AS a ON a.dataset_id = i.dataset_id
LEFT JOIN public.retention_current AS c ON c.singleton = true
WHERE i.imported_at >= TIMESTAMPTZ '2026-11-09 20:00:00+00'
  AND i.imported_at < TIMESTAMPTZ '2026-11-09 20:03:00+00'
ORDER BY i.imported_at;

SELECT a.dataset_id,
       a.as_of,
       a.published_at,
       a.financial_complete,
       EXISTS (SELECT 1 FROM public.retention_imports AS i
               WHERE i.dataset_id = a.dataset_id) AS has_import_log
FROM public.retention_audit_versions AS a
WHERE a.published_at >= TIMESTAMPTZ '2026-11-09 20:00:00+00'
  AND a.published_at < TIMESTAMPTZ '2026-11-09 20:03:00+00'
ORDER BY a.published_at;

ROLLBACK;
