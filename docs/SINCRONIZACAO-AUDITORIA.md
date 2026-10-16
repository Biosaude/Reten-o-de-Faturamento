> **Regra operacional revisada em 16/10/2026:** a publicação agora define o corte pelo relógio do servidor, sem segunda data manual, e preserva versões financeiras completas. As instruções de corte manual abaixo documentam a implementação anterior. Para o procedimento vigente e a preparação única das migrations 002/003, consulte [Publicação semanal](PUBLICACAO-SEMANAL.md).

# Sincronização da posição publicada e rastreabilidade da quarentena

## Diagnóstico de 16/10/2026

O domínio informado é https://reten-o-de-faturamento.vercel.app/. A consulta HTTP a ele e ao endereço individual do deployment foi bloqueada pelo proxy deste ambiente (403). Portanto, **não foi possível ler o payload real de produção nem confirmar seu `id` e `asOf`**. Não houve publicação de arquivo, alteração do Supabase, execução de migration, merge ou deploy.

O GitHub registra o deployment Production 7120847676, criado às 13:59:09 UTC, com SHA `a86a263a8a9db5a209268ecc36dcce2b65c26c27`. Esse commit inclui o PR #9. Entretanto, o PR #9 foi integrado em `audit/financial-reconciliation`, enquanto `main` permanece no merge do PR #8 (`e39990efc6c577f176bdf7f5d66b3942fbe29f97`). Este PR tem **base main** e inclui a integração das mudanças de referência dinâmica do #9 para evitar regressão no próximo deployment a partir de main.

`BASE DA SESSÃO` identifica uma importação temporária feita pelo administrador; não comprova que a versão persistida tenha o mesmo corte. Antes desta correção, “Posição atual” apenas limpava os filtros temporais e continuava usando essa base temporária. Essa causa foi reproduzida nos testes. O corte da seleção de arquivo é confirmado pelo administrador; não é deduzido da maior data da planilha ou do horário da importação.

Agora “Posição atual” consulta novamente `/api/dataset` com sessão ou `/api/public/dataset` sem sessão, troca a base somente após sucesso e limpa somente os filtros temporais. Falhas preservam a base e os filtros anteriores. Leituras atrasadas não substituem uma importação mais recente; sair da sessão descarta o cache administrativo e busca novamente a projeção pública. Os fetches não usam cache. O servidor já enviava `Cache-Control: no-store`.

A confirmação de publicação inclui o corte exato (`confirmedAsOf === asOf`). A seleção temporária continua disponível e não publica automaticamente. O horário de atualização e a posição financeira continuam separados. Não foram modificadas as fórmulas, o agrupamento Empresa + Agendamento, o tratamento de faturamento parcial ou os componentes de indicadores, rankings e gráficos.

## Conciliação com a planilha fornecida

Arquivo: `Base de dados retenção de faturamento geral.xlsx`; SHA-256 `8139db7941f515f4685d7125f8f4203f092580913ccadc95d9080bcb2ad43e9e`. Corte de 16/10/2026 confirmado pelo usuário, não inferido dos registros.

| Verificação | Resultado |
|---|---:|
| Registros originais | 17.683 |
| Registros válidos no motor | 17.185 |
| Registros em quarentena, distintos por linha | 498 |
| Total original | R$ 289.993.794,55 |
| Total válido | R$ 279.248.480,76 |
| Valor dos registros em quarentena | R$ 10.745.313,79 |
| Faturamento anterior à cirurgia | 43 linhas / R$ 922.555,42 |
| Datas de cirurgia conflitantes | 455 linhas / R$ 9.822.758,37 |

As duas últimas categorias de erro são disjuntas nesta planilha e conciliam os 498 registros. Categorias de avisos podem se sobrepor: seus totais não devem ser somados como saldo retido ou como total distinto de quarentena. Valores inválidos são identificados como indisponíveis, sem inventar um valor financeiro.

| Posição financeira, sem filtro de situação | Saldo conciliado |
|---|---:|
| 09/10/2026 | R$ 15.279.934,18 |
| 16/10/2026 | R$ 12.407.370,81 |
| Setembro/2026 | R$ 14.172.342,77 |
| Agosto/2026 | R$ 13.865.911,99 |
| Segundo trimestre/2026 | R$ 11.874.767,67 |

Esses resultados são asserções dos testes, não constantes do motor. A apuração independente compara cada registro e os indicadores com a origem; não utiliza a situação atual para fechar datas anteriores. O export local `/workspace/quarentena-base-16-10-2026.xlsx` contém as 498 linhas e ocorrências, sem pacientes, identificado como **prévia local**, sem representar publicação no Supabase.

## Auditoria e segurança

A validação passa a conservar os campos originais A–I e K–N de cada registro com ocorrência, incluindo os rejeitados, sem admiti-los no motor financeiro. J/Paciente não é capturado. Datas, valores e campos inválidos permanecem disponíveis como recebidos para diagnóstico. Filtros por agendamento/pesquisa, empresa, motivo, classificação do registro e período de cirurgia permitem exportar os registros filtrados uma única vez por linha, com versão, corte, atualização, linha de origem, classificação e motivos.

A consulta pública mantém a projeção explícita: Agendamento, Médico e Representante seguem a autorização já existente; notas de cobrança continuam pseudonimizadas. Nenhum paciente ou chave administrativa chega ao frontend. A opção de servidor que revoga a exposição dos três identificadores continua funcionando, inclusive para o identificador numérico zero.

Somente administradores consultam `/api/audit/versions` e `/api/audit/versions/:id`. Selecionar uma auditoria histórica não troca a base dos indicadores financeiros. A comparação de um registro rejeitado antigo com a versão atual só informa correspondência quando ela é única; casos ambíguos ficam “Correspondência não confirmada”. Essa comparação não altera classificações ou valores no motor.

Versões antigas cujos originais rejeitados já haviam sido descartados não podem ser reconstruídas integralmente. Os logs existentes permanecem listados; detalhes ausentes são sinalizados. Uma nova publicação explícita do arquivo original pode enriquecer a auditoria atual mesmo quando os registros financeiros e o corte não mudaram; uma repetição integralmente idêntica continua rejeitada com 409.

## Persistência e implantação a revisar

A migration **`supabase/migrations/002_retention_audit_versions.sql` não foi aplicada**. Ela adiciona um arquivo de auditorias protegido por RLS, sem recriar as tabelas existentes ou excluir registros. Preserva a versão corrente disponível e os logs anteriores. Publicações seguintes arquivam a auditoria anterior e a nova, atualizam o payload corrente e registram a importação na mesma transação, com a proteção de concorrência existente. Falha em qualquer etapa desfaz toda a transação, incluindo o corte. O arquivo é cumulativo; não há rotina de exclusão automática.

O backend verifica a disponibilidade da nova tabela antes de gravar. Se ela estiver ausente, retorna 503 sem substituir a versão oficial. A consulta corrente continua acessível. O armazenamento local de testes mantém base e histórico no mesmo arquivo cifrado, gravado atomicamente.

Procedimento após revisão e autorização:

1. Revisar este PR contra **main**, incluindo a integração do #9. Não executar merge/deploy automaticamente.
2. Aplicar somente a migration 002 no projeto de retenção existente antes de habilitar novas gravações com este código. Não reaplicar 001 nem recriar usuários/tabelas. Rever o SQL e as políticas antes da execução.
3. Após publicação autorizada do código, entrar com o administrador existente. Definir corte **16/10/2026 antes da seleção do arquivo**, escolher **Base compartilhada (Supabase)**, revisar 17.683 originais / 17.185 válidos / 498 em quarentena e confirmar o corte na publicação. A importação temporária não atualiza a base compartilhada.
4. Recarregar a página pública e administrativa ou usar “Posição atual”. Conferir o mesmo `id`, `asOf` e atualização na versão compartilhada. Limpar também filtros não temporais para comparar o saldo global de R$ 12.407.370,81.
5. Conferir as demais posições históricas e o export das 498 linhas da auditoria. Preservar o arquivo de versões caso seja necessário reverter o código; não remover tabelas ou logs para reverter a interface.

A publicação do arquivo oficial continua sendo uma ação administrativa separada. Apenas o merge do código não altera o corte armazenado nem publica a planilha.

## Validação automatizada

Os testes de autenticação usam o SDK Supabase real contra um provedor HTTP local simulado, com credenciais fictícias válidas/inválidas e perfis admin/não admin. Não houve login com senha real. Os testes de SQL executam as migrations 001 e 002 em PostgreSQL local via PGlite (dependência exclusivamente de desenvolvimento), incluindo histórico, RLS, concorrência e rollback de falha posterior à atualização. Nenhum desses testes grava no Supabase oficial.

Os testes de navegador cobrem retorno da sessão temporária à compartilhada, falha de leitura, preservação de filtros não temporais, histórico sem troca financeira, export filtrado, logout e proteção de dados, além dos fechamentos da planilha oficial e larguras de tela diferentes. Os testes antigos que dependem da base privada inicial de 3.149 registros não podem ser executados sem esse arquivo; não foram removidos ou convertidos em aprovações artificiais.

Comandos de reprodução, informando o caminho privado da planilha em `OFFICIAL_RECONCILIATION_PATH`:

```sh
npm test
npm run build
E2E_MOCK_ONLY=1 npm run test:e2e -- tests/e2e/reference.spec.ts tests/e2e/admin.spec.ts tests/e2e/audit.spec.ts tests/e2e/sync-audit.spec.ts --grep-invert 'consulta pública mantém controles bloqueados mesmo após manipulação do DOM'
```

As chamadas reais ao domínio público foram bloqueadas pelo proxy. Assim, a igualdade entre o payload público e o administrativo de produção permanece uma verificação operacional pendente; sua equivalência financeira e sanitização foram verificadas localmente. A execução local não reproduz integralmente a infraestrutura Vercel.

## Arquivos desta correção

- `src/App.tsx`, `src/lib/api.ts`: releitura canônica, descarte do estado temporário e proteção contra respostas atrasadas.
- `src/components/BaseManagement.tsx`, `server/app.ts`: confirmação do corte, enriquecimento explícito da auditoria e endpoints administrativos de histórico.
- `src/lib/audit-source.ts`, `src/lib/domain.ts`: captura dos originais das ocorrências, sem alteração das regras financeiras.
- `src/lib/audit.ts`, `src/lib/audit-export.ts`, `src/components/AuditPanel.tsx`, `src/styles.css`: detalhes, filtros, resumos, comparação conservadora de versões e Excel da auditoria.
- `server/public-data.ts`, `server/store.ts`, `supabase/migrations/002_retention_audit_versions.sql`: projeção segura e persistência transacional do histórico.
- `package.json`, `package-lock.json`: PGlite apenas para testes de SQL.
- `tests/audit-details.test.ts`, `tests/audit-history-migration.test.ts`, `tests/local-audit-history.test.ts`, `tests/published-sync.test.ts`, `tests/admin-integration.test.ts`, `tests/api.test.ts`, `tests/financial-reconciliation.test.ts`, `tests/reference-date.test.ts`: regressão financeira, privacidade, versões, rollback e permissões. A conciliação longa roda em processo assíncrono para manter o executor de testes responsivo.
- `tests/e2e/admin.spec.ts`, `tests/e2e/audit.spec.ts`, `tests/e2e/sync-audit.spec.ts`: integração da interface e exportações.
- `README.md`, este relatório: instalação incremental, diagnóstico e procedimento operacional.

A comparação com main também contém os arquivos já implementados no PR #9: `docs/REFERENCIA-FINANCEIRA-DINAMICA.md`, `playwright.config.ts`, `tests/e2e/reference.spec.ts`, `tests/reference-api.test.ts` e suas alterações de período nos arquivos compartilhados acima. Essas mudanças integram o trabalho anterior que ainda não havia chegado a main.

### Resultados finais desta execução

- `npm test` com a planilha oficial: **121 aprovados, 3 ignorados, código de saída 0**; os três ignorados dependem da base privada inicial ausente. As 16 suítes executadas passaram.
- `npm run build`: **aprovado**, TypeScript frontend/backend e Vite; permanece o aviso de chunk maior que 500 kB da exportação Excel.
- Chromium: **16 cenários aprovados** entre os quatro arquivos selecionados. A primeira execução aprovou 15 e encontrou timeout de 5 segundos na abertura da planilha completa. O trace confirmou resposta HTTP 200 de aproximadamente 8 MB; o teste desse arquivo foi ajustado para aguardar a renderização e a conclusão de “Posição atual”, sem sleeps ou redução da planilha. A repetição isolada passou por todos os fechamentos, login e recarga em cerca de 1,3 minuto. As demais 15 verificações já aprovadas não foram repetidas sem necessidade.
- A apuração independente, os testes da migration e a comparação pública/administrativa passaram; a produção real continua inacessível por este proxy. Nenhuma credencial real ou base oficial foi usada em testes de gravação.
