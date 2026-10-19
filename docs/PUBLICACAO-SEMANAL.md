# Revisão do PR #10 — publicação semanal e versões financeiras

## Verificação anterior à implementação

O motor apura cada registro na data T: cirurgia até T e faturamento vazio ou posterior a T significam pendência. Parcelas faturadas até T deixam de compor o saldo, preservando a classificação parcial por Empresa + Agendamento. Trocar a origem do metadado `asOf` para o dia da publicação **não muda essas fórmulas**, mas estabelece uma nova convenção operacional: a planilha confirmada deve representar a posição desse dia.

Limitações identificadas antes da mudança:

- Uma planilha desatualizada ou de fechamento anterior não se torna atual por ter sido enviada hoje. Não há metadado no arquivo que permita descobrir isso com segurança. O administrador confirma expressamente a posição do dia ao publicar. Não se infere o corte da maior cirurgia ou faturamento.
- A regra solicitada substitui a anterior de corte manual. A nova rotina não permite publicar hoje com um corte retroativo. Fechamentos anteriores são consultas históricas; importar um arquivo antigo como se fosse de hoje produziria uma interpretação incorreta da cobertura, embora as fórmulas permaneçam iguais.
- Data de publicação e horário são um único instante registrado no servidor. `asOf` é o dia civil desse instante em `America/Sao_Paulo`, sem depender do relógio/fuso do navegador. A posição é por dia, não intradia: a origem não contém horário de faturamento; isso limita fechamentos dentro do próprio dia.
- Reconstruir T usando os registros atuais e consultar a versão efetivamente publicada anteriormente são operações diferentes. Correções retroativas ou linhas adicionadas posteriormente podem mudar a reconstrução com a base atual; por isso é necessário preservar também o conjunto financeiro de cada publicação.
- A versão anterior do PR preservava somente os registros com ocorrências no arquivo de auditoria, insuficiente para reconstruir integralmente uma publicação passada. Não é possível recuperar registros financeiros de versões antigas já descartadas. Não são inventados dados ou versões ausentes.

## Implementação

`POST /api/import` continua exclusivo de administradores. Após confirmação e autorização, calcula `updatedAt` e `asOf` do mesmo instante de servidor. Campos `asOf`, `updatedAt` ou `confirmedAsOf` enviados por um cliente antigo não controlam os metadados da publicação. O relógio é uma dependência interna substituível nos testes; não é controlado por parâmetros HTTP.

No modo **Base compartilhada (Supabase)**, não há campo de segunda data. O administrador seleciona, revisa e confirma que o arquivo representa a posição do dia da publicação. A prévia pode ocorrer em outro dia: o instante definitivo é capturado na requisição de confirmação. Repetir arquivo/dados/auditoria no mesmo corte continua retornando 409; republicar em um novo dia gera uma nova versão, sem somar linhas de versões diferentes.

O modo temporário e seu corte de simulação permanecem disponíveis. Ele é identificado como base da sessão e não substitui o Supabase. A escolha do destino permanece explícita para preservar a funcionalidade existente.

A resposta da publicação alimenta a base única utilizada por KPIs, gráficos, tabelas e rankings. Os filtros existentes são preservados: quando o usuário estiver consultando uma data passada, essa consulta continua histórica; “Posição atual” relê a versão oficial mais recente e limpa apenas os filtros temporais, preservando as demais dimensões.

### Versões completas e consultas

A migration incremental 003 amplia o arquivo existente com `financial_complete`. Cada nova publicação conserva seu payload completo: registros financeiros válidos, auditoria e originais das ocorrências sem pacientes. Dados, corte, horário, histórico e log de importação são persistidos na mesma transação e com a proteção de concorrência existente. Erros em arquivo ou log desfazem toda a atualização. O armazenamento local cifrado preserva os mesmos dados de forma atômica e enriquece o arquivo da versão corrente ao ler um estado antigo.

A versão corrente disponível é preservada no upgrade. Arquivos anteriores que possuem somente auditoria continuam intactos e consultáveis na auditoria administrativa, mas não são apresentados como versões financeiras completas.

O filtro **Versão financeira**, na grade de filtros existente, permite consultar uma versão preservada e seus fechamentos. O padrão continua sendo **Base oficial mais recente**. A seleção de uma versão não grava no servidor. A comparação entre auditorias usa como referência a versão financeira em consulta na tela. O badge indica **VERSÃO HISTÓRICA**. “Posição atual” retorna à versão oficial corrente e também sai da seleção histórica. Ano, mês, quarter e data específica continuam limitados ao corte da versão consultada. Não se somam estoques de versões ou períodos.

Endpoints de consulta:

- `/api/public/versions` e `/api/public/versions/:id`: somente metadados públicos e projeção sanitizada dos dados, respectivamente. Sem ator, arquivo original, paciente ou nota de cobrança original. Agendamento, Médico e Representante seguem a política pública já autorizada e sua opção de revogação.
- `/api/versions` e `/api/versions/:id`: exigem a mesma autenticação e autorização já usada para ler `/api/dataset`.
- `/api/audit/versions` e `/api/audit/versions/:id`: permanecem administrativos, com a resposta histórica de auditoria separada dos indicadores.

A tabela continua com RLS e sem privilégios de leitura direta para `anon` ou `authenticated`. A chave de serviço permanece exclusivamente no backend. Não há controles públicos de edição ou publicação.

## Testes e resultados

Os testes usam somente armazenamento local temporário, provedores de autenticação simulados, PostgreSQL local PGlite e planilhas fictícias para gravação. A planilha oficial é usada apenas em conciliação de leitura. Nenhuma migration, importação, exclusão ou alteração foi executada no Supabase real.

Cenário financeiro fictício principal:

| Consulta | Saldo |
|---|---:|
| Primeira publicação em 02/10/2026, parcela já faturada e parcelas pendentes | R$ 500,00 |
| Segunda publicação em 16/10/2026, com faturamento de uma parcela em 09/10 e cirurgia posterior ao primeiro corte | R$ 350,00 |
| Reconstrução de 02/10 com a segunda base | R$ 500,00 |
| Consulta da primeira versão preservada, em 02/10 | R$ 500,00 |

A cirurgia futura ao primeiro corte não entra no fechamento antigo. Faturamento posterior ao fechamento não quita o histórico. Quarentena permanece fora dos KPIs. O cenário de navegador repete duas publicações e a consulta de duas semanas antes com parcelas fictícias, sem cirurgia adicional, chegando a R$ 300,00 na segunda posição.

Verificações específicas:

- Data e horário de publicação capturados pelo servidor e campos de cliente ignorados.
- Virada de dia em UTC respeitando Brasília.
- Duas publicações, mesma versão/corte no público e administrativo, recarga e consulta anterior.
- Versão anterior com todos os registros e valores originais, independentemente do estado corrente.
- Conflito entre administradores e repetição idêntica, sem duplicação.
- Migration 001 → 002 → 003 em PostgreSQL local; rollback após falha tardia; RLS preservada.
- Consulta pública sanitizada, histórico privado autenticado e gravação protegida.
- Interface sem segunda data na publicação, com modo temporário preservado e filtro de versão.

`npm test` com `OFFICIAL_RECONCILIATION_PATH` apontando para a planilha oficial: **124 testes aprovados, 3 ignorados, saída 0**, em 18 suítes executadas. A conciliação confirmou novamente 09/10: R$ 15.279.934,18; 16/10: R$ 12.407.370,81; setembro: R$ 14.172.342,77; agosto: R$ 13.865.911,99; Q2: R$ 11.874.767,67. Uma execução anterior teve timeout transitório no teste de Excel; ele passou isoladamente em 155 ms e na repetição integral em 130 ms, sem mudar o teste ou seu limite de tempo.

**Build:** `npm run build` aprovado, incluindo TypeScript frontend/backend e Vite. Permanece o aviso de chunk maior que 500 kB da exportação Excel.

**Interface:** 17 cenários únicos aprovados nos arquivos de administração, auditoria, referência, sincronização e publicação semanal. A seleção inicial aprovou 15; o novo teste semanal precisou corrigir apenas o seletor do nome acessível do botão. A execução final com a planilha oficial aprovou os dois cenários selecionados: todos os fechamentos públicos/administrativos e a publicação semanal, incluindo larguras de 1920, 1024 e 390 pixels. O teste oficial usa a planilha completa e permaneceu conciliado. O teste público antigo dependente da base inicial e os cenários antigos de dashboard com essa mesma dependência não foram executados.

Testes antigos que dependem da base privada inicial de 3.149 registros continuam condicionados à disponibilidade desse arquivo; não foram removidos nem apresentados como aprovados.

## Riscos e limites operacionais

- A atualização continua sendo um snapshot completo, sem somar publicações. A extração semanal deve conter a base completa atualizada, não somente as linhas da semana; os snapshots anteriores permanecem preservados.
- A confirmação não comprova a atualidade do arquivo: o administrador deve utilizar uma extração atualizada. A mudança de convenção de corte precisa ser comunicada aos usuários antes da implantação.
- Versões completas consomem mais espaço. O arquivo é cumulativo, sem rotina automática de remoção, respeitando a preservação solicitada. Monitorar armazenamento e backups no projeto de retenção.
- A planilha oficial enviada gera aproximadamente 3,46 MB de JSON de importação após remover pacientes, abaixo do limite de 4 MB do Express. Arquivos futuros maiores podem ultrapassar o limite HTTP; o limite de upload de arquivo de 10 MB não garante que sua conversão para JSON caiba na API. A infraestrutura Vercel também tem limites de payload. Não foram alterados o transporte ou os limites nesta revisão.
- Uma resposta oficial completa tem aproximadamente 8 MB. O teste de navegador precisa aguardar a renderização da base completa; isso não é uma medição de desempenho de produção. O armazenamento e a entrega de versões grandes devem ser monitorados.
- A infraestrutura de produção Vercel/Supabase não é reproduzida integralmente nos testes locais. Não foi realizado login com credenciais reais, nem teste de escrita em produção.

## Implantação segura — somente após autorização

Preparação técnica **uma única vez**:

1. Revisar o PR #10 e fazer backup do projeto de retenção existente. Não recriar o Supabase, usuários, perfis ou tabelas iniciais.
2. Verificar o histórico de migrations no ambiente alvo. Se só 001 estiver aplicada, revisar e aplicar 002 e depois 003. Se 002 já estiver aplicada, aplicar somente 003. Não reaplicar migrations existentes.
3. Verificar o backfill da versão corrente e os privilégios. Versões antigas sem dados financeiros completos devem continuar sem esse selo; seus logs e auditorias não devem ser excluídos.
4. Implantar o código somente após validação. O backend exige a coluna `financial_complete` antes de gravar; se a estrutura estiver ausente, falha com 503 e preserva a base oficial.
5. Fazer a primeira validação em ambiente isolado com dados fictícios e verificar relógio/fuso, duas versões e consulta de duas semanas antes. Só então autorizar o uso real.

Rotina semanal, **sem SQL, migrations, GitHub ou Vercel**:

1. Entrar com o administrador existente.
2. Selecionar **Base compartilhada (Supabase)** e carregar a extração completa e atualizada.
3. Revisar quantidade de registros, valores e quarentena.
4. Confirmar que a planilha representa a posição do dia e clicar em **Salvar Base Compartilhada**.
5. Conferir referência, horário e versão na consulta pública. Usar “Posição atual” para voltar à publicação corrente.

Não trocar o armazenamento para um estado anterior para consultar história: selecionar a versão no dashboard. Em uma reversão de código, preservar integralmente as tabelas de arquivo e os logs; não executar `DROP`, truncamento ou exclusão de versões.

## Arquivos alterados nesta revisão

- `server/publication.ts`: instante único e calendário financeiro de Brasília.
- `server/app.ts`: publicação automática e endpoints de consulta de versões.
- `server/store.ts`: snapshots financeiros completos, leitura de versões e compatibilidade local.
- `supabase/migrations/003_retention_financial_versions.sql`: upgrade incremental e RPC transacional.
- `src/components/BaseManagement.tsx`: publicação sem segunda data e confirmação de posição do dia.
- `src/App.tsx`: seleção de versão preservada e retorno à posição atual.
- `tests/weekly-publication.test.ts`, `tests/weekly-migration.test.ts`: metadados, duas publicações, histórico, integridade e permissões.
- `tests/e2e/weekly.spec.ts`: fluxo semanal completo no navegador.
- `tests/admin-integration.test.ts`, `tests/e2e/admin.spec.ts`, `tests/e2e/reference.spec.ts`: ajuste dos contratos de publicação nos testes existentes.
- `README.md`, `docs/SINCRONIZACAO-AUDITORIA.md`, `docs/REFERENCIA-FINANCEIRA-DINAMICA.md`, este relatório: documentação da nova regra e implantação.

Não foram alteradas as fórmulas em `src/lib/domain.ts`, a consolidação Empresa + Agendamento, os valores originais ou a classificação de faturamento parcial nesta revisão.

### Comandos executados

```sh
# OFFICIAL_RECONCILIATION_PATH aponta apenas para o arquivo privado de leitura.
npm test
npm run build
E2E_MOCK_ONLY=1 npm run test:e2e -- tests/e2e/weekly.spec.ts tests/e2e/admin.spec.ts tests/e2e/reference.spec.ts tests/e2e/sync-audit.spec.ts tests/e2e/audit.spec.ts --grep-invert 'consulta pública mantém controles bloqueados mesmo após manipulação do DOM'
# Regressão oficial e conferência final do fluxo semanal, com OFFICIAL_RECONCILIATION_PATH definido:
E2E_MOCK_ONLY=1 npm run test:e2e -- tests/e2e/reference.spec.ts tests/e2e/weekly.spec.ts --grep 'regressão visual dos saldos|publica duas semanas'
```
