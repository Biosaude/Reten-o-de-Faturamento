# Homologação técnica — Retenção a Preço de Custo

**Classificação: APTO PARA PRODUÇÃO no escopo dos dois bloqueios técnicos corrigidos.** A execução completa dos comandos terminou sem reprovações nos testes executados. As regressões opcionais com bases oficiais privadas continuam explicitamente ignoradas, não aprovadas. Esta classificação não certifica o conteúdo de uma futura extração nem a configuração do Supabase remoto.

Branch: `feat/retencao-preco-custo`. Referência aprovada da implementação: `c8c43bc`. Referência de rollback: `63d82479f4ee3631e9b3be49fb3272dbbe0bba4a`, merge do PR #10.

## Causa e correção dos bloqueios

| Bloqueio | Causa | Correção |
| --- | --- | --- |
| Contaminação dos testes seguintes | `cost.spec.ts` publicava dados fictícios numa única API com armazenamento `.local/e2e` compartilhado por toda a suíte. | Cada teste agora usa um processo de API local, porta aleatória, sessões e diretório temporário exclusivos. O processo e os arquivos são removidos ao término, inclusive em falhas. Os demais testes recebem sua própria base inicial. Não é preciso restaurar a base de outro teste, pois ela nunca é compartilhada. |
| Ausência de `.local/dataset.enc` | O preparo antigo copiava um armazenamento privado do desenvolvimento, ausente num checkout limpo. Os cenários gerais também exigiam valores fixos da antiga base oficial. | O preparo agora apenas constrói o bundle de produção. Cenários funcionais usam uma fixture sintética pequena, explicitamente fictícia e com resultados conhecidos por soma direta. As asserções de valores oficiais foram preservadas em regressões opcionais que exigem suas fontes privadas. |

Os specs usam a fixture comum de isolamento, inclusive o de custo. Os testes de login simulado refletem a origem local dinâmica nos cabeçalhos CORS. O servidor local do E2E recebe somente `PATH`, `TMPDIR`, `LOCAL_DATA_DIR` e `NODE_ENV`; não recebe credenciais ou identidades da instância. Ele recusa diretórios compartilhados e qualquer variável de configuração Supabase. O navegador bloqueia requisições externas não simuladas, e service workers ficam desabilitados. Os mocks de autenticação existentes continuam sem acesso externo.

Dois testes de segurança verificam o encerramento antes de qualquer persistência quando o helper recebe um diretório compartilhado ou configuração Supabase. Todos os endpoints reais exercitados no E2E usam `createApp(true)` em loopback. Nenhum teste grava no Supabase.

## Origem do armazenamento privado

`.local/dataset.enc` é produzido por `server/store.ts` após `npm run seed:local` ou uma publicação administrativa no modo local. Ele contém o payload corrente e as versões, cifrados com AES-256-GCM; `.local/encryption.key` contém a chave, com permissão 0600. Ambos são ignorados pelo Git e não pertencem ao bundle de produção nem às fixtures versionadas. A ausência desses arquivos numa nova máquina é esperada.

Não é possível reconstruir a antiga base oficial apenas a partir de seus agregados. Os exemplos sintéticos não tentam reproduzir seus valores. A base sintética de quatro linhas usa saldo de R$ 700, faturamento de R$ 50 e três cirurgias; em Q2 o saldo é R$ 350, e a faixa acima de 180 dias no corte contém R$ 100. Esses resultados são conferidos pela interface e pelas exportações.

## Dependências oficiais opcionais

| Teste | Fonte privada necessária | Execução sem a fonte |
| --- | --- | --- |
| `tests/e2e/official-base.spec.ts` | `E2E_OFFICIAL_DATA_DIR`: diretório contendo `dataset.enc` e `encryption.key` da base correta de setembro/2026, cujo saldo é R$ 8.489.909,79 em 504 cirurgias. Os arquivos são copiados somente para o diretório temporário exclusivo desse teste. | Ignorado com motivo explícito; mantém as asserções anteriores de setembro, Q2 e faixa acima de 180 dias. |
| Regressão visual oficial em `tests/e2e/reference.spec.ts` | `OFFICIAL_RECONCILIATION_PATH`: planilha geral privada validada com corte 16/10/2026, com as referências descritas em `docs/CONCILIACAO-FINANCEIRA-GERAL.md`. | Ignorada com motivo explícito. Os cenários sintéticos de corte, histórico, refresh e publicação continuam executados. |
| Cinco casos condicionais Vitest | Arquivos e flags das bases oficiais de setembro/outubro, descritos nos próprios testes e na documentação de validação. | Continuam pulados; não foram desabilitados ou contabilizados como aprovados. |

Para executar as duas regressões E2E oficiais junto dos demais casos:

```sh
E2E_OFFICIAL_DATA_DIR=/caminho/privado/base-setembro \
OFFICIAL_RECONCILIATION_PATH=/caminho/privado/geral.xlsx \
npm run test:e2e
```

Uma fonte errada fornecida explicitamente falhará nas asserções. O anexo de 15 colunas recebido para validar custo tem outros totais e não foi usado como substituto da antiga fixture oficial. A alternativa segura executada combina cenários funcionais sintéticos, integração local real, testes de banco efêmero e conciliação independente do anexo fornecido.

## Resultados da validação

| Comando/verificação | Aprovados | Ignorados | Reprovados | Resultado |
| --- | ---: | ---: | ---: | --- |
| `npm test` | 148 | 5 | 0 | Código de saída 0; unitários e integração, incluindo segurança do helper E2E. |
| `npm run test:e2e` | 27 | 2 | 0 | Código de saída 0; todos os 29 testes foram incluídos na execução, com duas dependências oficiais explicitamente ignoradas. |
| `npm run test:e2e -- --fully-parallel --workers=2` | 27 | 2 | 0 | Código de saída 0; confirma independência de estado com cenários concorrentes. |
| `npm run build` | — | — | — | Aprovado: TypeScript do projeto/função Vercel e bundle Vite. O preparo de ambas as execuções E2E também construiu o projeto. |
| `npx tsx scripts/reconcile-cost.ts ... 2026-11-09` | 18 cenários | 0 | 0 | Comparação independente ExcelJS/TypeScript e Python/openpyxl/Decimal do anexo, incluindo os valores de cada linha válida. |

Esses resultados não equivalem à aprovação de todos os casos oficiais: dois E2E e cinco Vitest não foram executados. Nenhum caso reprovado foi ocultado com `skip`, e as asserções oficiais anteriores foram preservadas. A execução padrão passou mesmo com `.local/dataset.enc` ausente.

As colunas N/O, compatibilidade de 14/15 colunas, filtros, custos nulos/zero/inválidos, versões legadas, persistência e recarga permanecem cobertos pelos testes de custo existentes. A conciliação do anexo confirmou 18.031 linhas de origem, 17.532 válidas e 499 em quarentena. Na referência de teste 09/11/2026, o saldo foi R$ 13.549.464,41 e o custo retido R$ 5.162.312,18, com cobertura de 821/821 linhas pendentes. As projeções financeiras legadas conferiram em todos os cenários comparados.

## Preservação da implementação e Supabase

Nenhum arquivo de `src/`, `server/`, `api/` ou `supabase/`, nem dependência/lockfile, foi alterado por esta correção. O layout, as fórmulas financeiras, os campos de custo aprovados e o mecanismo de histórico permanecem iguais ao commit `c8c43bc`. A comparação da auditoria com o código real do PR #10 já confirmou 46 cenários financeiros e leitura dos novos payloads pela versão antiga; essa implementação foi preservada.

**Não há migration nova ou requisito SQL adicional nesta branch em relação ao PR #10.** O custo continua nos payloads JSONB. A infraestrutura 002/003 do histórico financeiro continua sendo pré-requisito da versão do PR #10; sua aplicação no Supabase remoto não foi inspecionada nem alterada nesta homologação. Os testes SQL usaram apenas banco efêmero. Não executar nem reaplicar migrations como parte desta correção.

## Procedimento de rollback para o PR #10

1. Pausar publicações administrativas e registrar a implantação corrente, a versão financeira e o corte exibidos. Preservar o histórico e o backup operacional conforme a rotina da organização.
2. O operador responsável seleciona a implantação imutável correspondente ao merge do PR #10 (`63d8247`). Este procedimento é documentação; nenhum rollback/deploy foi executado nesta entrega.
3. Manter o schema e os payloads JSONB existentes. Não há down migration. A versão antiga lê `cents` dos novos registros, preservando os indicadores financeiros, e não apresenta o KPI de custo.
4. Conferir leitura pública, referência financeira, totais e acesso ao histórico; confirmar que gravações sem autorização continuam negadas.
5. Se as publicações forem retomadas na versão antiga, usar o modelo de **14 colunas**, com **Valor total em N**, baixado dessa versão. Para preparar uma cópia da planilha nova, remover a coluna inteira `Custo médio total`, deslocando `Valor total` de O para N. Apenas esvaziar N mantendo 15 colunas não produz o formato legado. Preservar o arquivo original de 15 colunas em local privado.
6. A API antiga rejeita 15 colunas com HTTP 400 sem substituir a base. Uma publicação de 14 colunas autorizada cria uma nova versão corrente sem custo, enquanto a versão financeira anterior com custo permanece no histórico. A troca de código não restaura automaticamente uma versão de dados; selecionar uma versão histórica é uma consulta.
7. Ao retornar à versão com custo, as versões legadas continuam exibindo custo indisponível. Uma nova publicação com custo usa a planilha de 15 colunas e a confirmação administrativa normal, sem inferir custos ausentes.

## Arquivos desta correção

- Configuração e preparo: `playwright.config.ts`, `scripts/e2e-prepare.ts`.
- Servidor e fixtures exclusivos: `scripts/e2e-server.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/synthetic-data.ts`.
- Specs adaptados à fixture comum: `tests/e2e/admin.spec.ts`, `audit.spec.ts`, `cost.spec.ts`, `dashboard.spec.ts`, `reference.spec.ts`, `sync-audit.spec.ts`, `weekly.spec.ts`.
- Preservação das asserções oficiais: `tests/e2e/official-base.spec.ts`.
- Proteções de segurança: `tests/e2e-server-safety.test.ts`.
- Documentação: `README.md`, `docs/RETENCAO-PRECO-CUSTO.md`, este relatório.

## Riscos residuais

As verificações específicas das bases oficiais privadas permanecem pendentes até o fornecimento das fontes corretas. A integração com o Supabase real e o conteúdo da próxima extração não foram certificados por esta execução local. O rollback de código é compatível com a leitura financeira, mas exige o procedimento de importação legado descrito acima. O build mantém o aviso de tamanho de chunks já existente; ele não impediu a compilação nem alterou esta implementação.

Não houve merge, deploy, migration, importação ou publicação no Supabase de produção.
