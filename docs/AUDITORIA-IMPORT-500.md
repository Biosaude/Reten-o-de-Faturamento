# Auditoria de POST /api/import — causa-raiz ainda não comprovada

## Escopo e evidências

Incidente informado: Production, 09/11/2026 às **17:01:08 GMT-3** (**20:01:08 UTC**), Request ID `xtlsm-1794254468822-8ae52fa1bfee`, deployment `dpl_2WANxk3yuXmCBQ9yK9NyCQ2hN564`. Segundo as evidências fornecidas, a validação retornou 200, a publicação retornou 500, a execução durou 16,04 segundos e o pico foi 520 MB. O aviso `Forwarded` foi observado em `/api/validate`, que terminou com 200. Não foi fornecido SQLSTATE, código PostgREST ou stack do erro de publicação.

Fonte auditada: `bc2fbd0493535e29ed10a49d07e59b7d8b056f65`, merge do PR #11. Trabalho isolado em `fix/audit-import-500`. Não foi possível verificar qual SHA corresponde ao deployment informado. Não há ferramenta/conexão com os logs privados Vercel/Supabase ou credenciais desses serviços nesta instância. A tentativa de GET público de versões foi bloqueada pelo proxy do ambiente antes de alcançar o serviço. Nenhuma configuração de rede, variável ou credencial foi alterada.

**Conclusão:** o código explica por que erros distintos ficam ocultos sob um 500 genérico. Não há evidência suficiente para atribuir este incidente específico a timeout, memória, limite do gateway, permissão ou outra falha de persistência. A proposta nesta branch é instrumentação local testada, não uma correção comprovada da causa-raiz em Production.

## Fluxo completo e pontos de falha

| Etapa | Comportamento existente | Relação com o incidente |
| --- | --- | --- |
| Corpo JSON | `express.json`, limite de 4 MiB. | O handler genérico atual pode transformar erros do parser, inclusive excesso de corpo, em 500. Isso não foi corrigido silenciosamente nesta proposta de diagnóstico. |
| Rate limiting | 120 requisições por 60 segundos; identificação padrão de IP. | Excesso retorna 429. As opções não foram alteradas. |
| Autenticação | Bearer validado com `auth.getUser` pelo cliente administrativo do servidor. | Sessão ausente/inválida retorna 401; exceção de autenticação retorna 503. |
| Autorização | Consulta a `retention_roles`; somente `admin` importa. | Usuário sem perfil retorna 403. Ler perfil não comprova permissão de executar a RPC. |
| Schema | 14/15 cabeçalhos, células finitas, até 25.000 linhas; `expectedId` UUID/nulo e `confirmed: true`. | Falha Zod retorna 400. O lote informado tem menos de 25.000 linhas. |
| Leitura corrente | Carrega o payload completo de `retention_current`. | Etapa ausente de `/api/validate`; erro de consulta/rede aqui pode retornar 500 antes de qualquer escrita. |
| Validação financeira | Reconstrói o dataset, a quarentena e a auditoria; referência e horário do servidor em Brasília. | É a mesma validação principal usada pelo endpoint de preview. |
| Conflito/corte | Compara registros/auditoria e valida corte. | Versão repetida/conflito conhecido retorna 409; corte anterior retorna 400. |
| Histórico | Lê `dataset_id, financial_complete` em `retention_audit_versions`. | Erro conhecido retorna 503. A ausência dessa coluna, sozinha, não explica o 500 pelo código auditado. |
| RPC | `replace_retention_dataset(new_payload, expected_id, actor_id)`, usando a credencial de servidor. | Erro SQL, grant, gateway, transporte ou função ausente pode chegar como 500 genérico. |
| Resposta | Retorna o dataset completo após a confirmação da persistência. | Falha de resposta/plataforma pode ocorrer depois do commit; é necessário distinguir isso de rollback. |

O handler anterior verifica principalmente `err instanceof Error` e algumas mensagens internas. Erros retornados pelo SDK podem ser objetos PostgREST com `code`, `message`, `details` e `hint`; fora dos casos previstos, o cliente recebe apenas “Operação indisponível”. O erro original não era registrado. Isso é uma **lacuna de observabilidade comprovada**, e não prova de qual erro originou o incidente.

## Forwarded / X-Forwarded-For

A versão instalada de `express-rate-limit` encapsula essas validações, captura o `ValidationError` e o envia ao logger; o aviso não é encaminhado como erro fatal da requisição. O teste local enviou ambos os cabeçalhos: preview 200 e importação de 15 colunas 200 com backend saudável.

Portanto, esse aviso não comprova a causa do 500, e a evidência de preview 200 é consistente com o comportamento da biblioteca. Existe uma questão independente de identificação do IP atrás do proxy: o padrão pode agrupar usuários pelo endereço do proxy. Qualquer ajuste futuro deve considerar apenas cabeçalhos sobrescritos por uma borda confiável. Não foi usado `trust proxy: true`, não foram desabilitadas validações, e o teste confirmou 429 após 120 chamadas mesmo trocando os cabeçalhos de proxy.

## Tamanho, memória, timeout e compatibilidade

No anexo recebido anteriormente nesta conversa, a representação de entrada medida foi aproximadamente **3.607.344 bytes**; o dataset consolidado mediu **8.677.778 bytes**, e a RPC serializada **8.677.897 bytes**. Esses números são de uma reprodução local representativa, não uma captura do corpo exato do Request ID do incidente. Cabeçalhos de requisição, nome do arquivo e outros metadados podem variar.

O corpo representativo fica abaixo dos 4.194.304 bytes do parser Express. Entretanto, a requisição à RPC e a resposta completa são maiores que a entrada. Limites de gateway, resposta, rede e memória merecem verificação na configuração efetiva do deployment. Não foi aumentado qualquer limite, nem reduzido o lote ou removida a auditoria para fazê-lo passar. O preview também retorna um dataset completo; seu sucesso enfraquece a hipótese de um limite de resposta uniforme como explicação única, sem eliminá-la na etapa de publicação.

Os 16,04 segundos não demonstram timeout sem o limite configurado e o evento original. Os 520 MB não demonstram OOM sem a memória configurada e os logs de término. O repositório não fixa `maxDuration` nem memória da função. Importação acumula trabalho adicional: leitura do payload corrente, comparação, serialização e envio da RPC; isso diferencia seus recursos do preview.

As colunas N/O já são convertidas para `costCents`/`cents`. A RPC armazena JSONB e não depende da posição da coluna na planilha. Nenhuma migration é exigida pelo novo campo de custo. Em PostgreSQL efêmero/PGlite com os scripts 001–003 do repositório, o payload completo de **18.031 linhas de origem, 17.532 válidas e 499 em quarentena** foi persistido, com custo preservado. A RPC local levou aproximadamente 482 ms; isso não é benchmark da rede nem do Supabase remoto. O processo de teste contém PostgreSQL WASM e não permite comparação de memória com a função Vercel.

## Transação e possibilidade de gravações parciais

A implementação SQL 003 usa lock transacional, verifica `expected_id`, arquiva a versão anterior e a nova, atualiza `retention_current` e insere `retention_imports` na mesma transação. Não há commit intermediário. O teste de lote completo provocou uma violação de chave estrangeira (`23503`) no log final; base corrente, arquivos de versões e log de importações permaneceram exatamente como antes da tentativa.

Isso comprova atomicidade na implementação local testada. A função realmente instalada e eventuais alterações externas no Supabase de Production não foram inspecionadas. Além disso, **500 percebido pelo cliente não comprova rollback**: a confirmação da RPC pode se perder depois do commit ou a resposta pode falhar após persistência reconhecida. Ambos os cenários foram simulados e distinguíveis pelos logs propostos. Não foi adicionado retry automático.

A tela manter a base antiga também não prova ausência de commit: `BaseManagement` só atualiza a versão exibida após uma resposta de sucesso. Mesmo com commit no backend, uma resposta 500 mantém os dados já carregados no navegador.

Para conferência por operador autorizado, somente leituras de metadados são necessárias. Não executei estas consultas em Production:

```sql
select payload->>'id' as dataset_id,
       payload->>'asOf' as reference_date,
       payload->>'updatedAt' as published_at,
       jsonb_array_length(payload->'records') as valid_rows
from public.retention_current where singleton=true;

select dataset_id, imported_at
from public.retention_imports
where imported_at between '2026-11-09 20:00:00+00' and '2026-11-09 20:03:00+00'
order by imported_at;

select dataset_id, as_of, published_at, financial_complete
from public.retention_audit_versions
where published_at between '2026-11-09 20:00:00+00' and '2026-11-09 20:03:00+00'
order by published_at;
```

Comparar os IDs e horários com a versão corrente e com a tentativa distingue publicação completa, rollback e estado desconhecido por perda da confirmação. Não republicar às cegas nem alterar dados para “testar”.

## Instrumentação segura preparada, ainda não publicada

Arquivos propostos: `server/import-diagnostics.ts`, integração em `server/app.ts` e `server/store.ts`, e `tests/import-diagnostics.test.ts`. Apenas `POST /api/import` no modo não local recebe o trace. Nenhum endpoint, regra financeira, layout, permissão ou limite foi modificado.

- UUID gerado no servidor, devolvido em `X-Retention-Import-Id`; não deriva de usuário, planilha ou cabeçalho recebido.
- Etapas: corpo, autenticação, autorização, schema, leitura corrente, validação, comparação, preflight do histórico, RPC e resposta.
- JSON com evento, etapa, tempo total/da etapa, RSS/heap em MiB e status HTTP. A resposta SDK com status 0 é registrada como ausência de resposta HTTP, não como código HTTP válido.
- SQLSTATE/código PostgREST/transporte somente após validação do formato; classe de erro restrita a nomes permitidos. Causas encapsuladas de histórico/conflito são preservadas.
- Evento separado de persistência reconhecida, término da resposta e fechamento prematuro. Se a plataforma encerrar abruptamente a função, pode haver apenas a última etapa iniciada; os logs nativos continuam necessários para identificar término por timeout/OOM.
- Não registra token, cookie, apikey, URL Supabase, cabeçalhos recebidos, identificadores de usuário/dataset, arquivo, linhas, valores, mensagens/detalhes/hints ou stack bruto. O teste injeta marcadores privados nesses campos e verifica que não aparecem nos logs ou respostas de erro.

Os status existentes foram preservados: a proposta melhora a identificação da causa e não transforma uma falha desconhecida em sucesso. O cliente injetável de persistência é usado pelos testes em memória; o caminho normal continua utilizando a fábrica de credenciais de servidor existente, sem alterar variáveis ou credenciais reais.

| Próxima evidência | Interpretação e ação mínima a revisar |
| --- | --- |
| Falha em `read_current` | Investigar consulta, transporte ou tamanho da leitura antes de qualquer escrita. |
| `replace_rpc` com `57014` | Consulta cancelada; confirmar no banco se houve statement timeout ou outro cancelamento. Não aumentar limites sem medir. |
| `42501` | Verificar privilégio/grant da operação exata; não desabilitar RLS nem conceder acesso público. |
| `PGRST202` | Verificar existência/assinatura/cache da RPC instalada. Não executar migrations automaticamente. |
| Backend 413 | Verificar limite efetivo do gateway no corpo expandido da RPC. |
| Backend 0 ou `UND_ERR_*` | Falha de transporte; resultado do commit pode ser desconhecido. Fazer leitura de conferência antes de nova tentativa. |
| Persistência reconhecida, depois falha em `respond` ou 500 da plataforma | Verificar entrega/tamanho da resposta e término da função; o banco pode já ter confirmado a publicação completa. |
| `BODY_TOO_LARGE` | O parser rejeitou antes de autenticar/gravar. Revisar classificação explícita para HTTP 413 mantendo 4 MiB; o handler legado pode mascarar isso como 500. |

O ajuste mínimo imediato proposto é preservar o diagnóstico técnico com logs seguros. Correções de timeout, payload, função SQL, privilégios ou proxy devem ser decididas pela etapa/código real. Não há justificativa comprovada para alterar schema, limites, autenticação ou rate limiting neste momento.

## Testes e riscos residuais

- `npm test`: **167 aprovados, 5 ignorados, 0 reprovados**, incluindo 15 novos casos de diagnóstico, rate limiting, redaction, falhas de leitura/preflight/RPC/transporte/resposta e lote sintético de 18.031 linhas com 499 em quarentena.
- E2E selecionados de administração e custo: **6 aprovados, 0 ignorados, 0 reprovados**. A suíte E2E completa não foi repetida nesta auditoria.
- `npm run build`: aprovado, incluindo carregamento/tipagem ESM do backend. Mantém o aviso de chunks já existente.
- PostgreSQL efêmero: payload representativo completo aceito; preservação de custo e rollback conjunto verificados. Nenhum acesso a Supabase remoto.

Os cinco testes de fontes oficiais privadas permanecem ignorados. Os erros SQL/transporte injetados não são evidência de que esses mesmos erros ocorreram no incidente. Sem logs da execução real, limites efetivos e leitura de metadados do banco, a causa-raiz e o resultado exato da tentativa continuam pendentes.

Na etapa inicial de auditoria (commit `8770143`), não houve push, PR, merge, deploy, publicação de base, migration no Supabase, alteração de variável/credencial ou escrita em Production. A autorização posterior permite preparar um PR, mantendo a proibição de deploy e de escritas no Supabase.

## Preparação exclusiva para revisão

O commit `8770143` permanece na história de `fix/audit-import-500`. Os complementos para revisão são restritos à mesma instrumentação e às salvaguardas solicitadas:

- Exceções do destino dos logs são contidas, sem fallback para erro bruto e sem substituir o resultado da importação. Há testes de sucesso e falha de persistência com os dois loggers indisponíveis.
- O teste de sucesso compara os argumentos completos da RPC ao dataset retornado, incluindo `expected_id` e `actor_id`: nenhum campo de diagnóstico é persistido no payload financeiro.
- As consultas revisáveis estão em [`queries/audit-import-attempts.sql`](queries/audit-import-attempts.sql). Usam snapshot `REPEATABLE READ READ ONLY`, selecionam somente metadados e terminam com `ROLLBACK`. O teste verifica o modo somente leitura, a correlação entre versão corrente/histórico/log e a preservação integral das tabelas. Não foram executadas no Supabase.
- `vercel.json` desabilita o deploy automático **somente** para `fix/audit-import-500`, via `git.deploymentEnabled`. As demais branches mantêm o padrão. A opção foi conferida nos tipos e no validador oficial de `@vercel/config` 0.14.1, obtido do npm com integridade verificada. Isso permite enviar a branch para revisão sem solicitar Preview automático.

Resultados da preparação para revisão: **170 testes unitários/de integração aprovados, 5 ignorados e 0 reprovados**; execução completa E2E com **27 aprovados, 2 ignorados e 0 reprovados**; build aprovado. Os ignorados continuam dependendo de bases oficiais privadas e não foram contabilizados como aprovados.

Permanecem inalterados o layout, os indicadores, as fórmulas financeiras, o schema e os dados do Supabase, o fluxo de autenticação/autorização, a configuração do rate limiter e os status de erro existentes. A alteração observável é o diagnóstico estruturado e o cabeçalho de correlação já descritos acima. Um merge ou deploy continua dependendo de autorização explícita.
