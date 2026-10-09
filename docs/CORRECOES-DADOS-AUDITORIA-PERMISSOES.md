# Correções de dados, auditoria e permissões

Os identificadores vistos nas imagens são produzidos por `server/public-data.ts`, na projeção anonimizada; não há erro de mapeamento das colunas B/I/K e os valores originais permanecem no armazenamento. Após login autorizado, a interface usa `/api/dataset` e apresenta os identificadores originais na tabela, nos detalhes, filtros e rankings. A chave original Empresa + Agendamento permanece intacta. A consulta pública conserva a proteção, inclusive para agendamentos em ocorrências de quarentena; pacientes permanecem ausentes.

O critério `note_without_date` foi removido do validador de auditoria. Nas versões existentes, a normalização na leitura retira somente essa ocorrência e recalcula os registros inconsistentes/para conferência, sem alterar ou regravar os registros financeiros. Datas inválidas, faturamentos anteriores e demais critérios legítimos continuam ativos. A ausência de data mantém a pendência financeira.

A auditoria mantém a grade e a rolagem, acrescenta Agendamento, pesquisa parcial sem distinguir maiúsculas/minúsculas, limpeza da pesquisa e filtro de severidade. O Excel exporta todas as ocorrências filtradas, inclusive fora da área visível, com cabeçalho, autofiltro e larguras configuradas. Agendamentos são originais no acesso administrativo e protegidos no modo público.

Os três botões de gerenciamento, o upload e a data de corte são bloqueados sem administrador autenticado. Além das verificações nos handlers da interface, `/api/template`, `/api/validate` e `/api/import` exigem autorização no servidor. A validação/atualização temporária continua disponível ao administrador sem gravação; a publicação conserva a RPC transacional e o controle de concorrência existentes. Não há mudança em autenticação, RLS, tabelas ou esquema.

## Evidência na planilha disponível neste ambiente

- 40 registros válidos conferidos diretamente nas colunas B, I e K da planilha anexada.
- Base local: 3.149 registros originais, 3.137 válidos e 12 em quarentena.
- Ocorrências: 156 antes, 86 depois; removidas 70 ocorrências de nota sem data.
- Registros inconsistentes: 136 antes, 82 depois; 70 registros somente para conferência.
- Saldo retido preservado: R$ 8.489.909,79 em 504 cirurgias.
- Histórico, faixas, estoque/fluxo e rankings reconciliados pelos testes existentes.

Esses números pertencem à planilha anexada/local. As imagens mostram uma versão compartilhada com 12.325 registros; não há acesso às credenciais ou a essa fonte completa no ambiente de testes. A normalização aplica-se também a bases existentes maiores, mas seus totais publicados deverão ser confirmados no ambiente autorizado. Nenhum registro do Supabase real foi alterado.

## Verificação

- `npm run build`: aprovado, incluindo TypeScript/NodeNext; permanece o aviso existente de tamanho de chunks.
- `VALIDATE_OFFICIAL_BASE=1 OFFICIAL_BASE_PATH=/caminho/para/planilha.xlsx npm test`: 93 testes aprovados.
- `npm run test:e2e`: 16 testes Chromium aprovados.
- Testes de auditoria, Excel, dados originais, privacidade e preservação financeira.
- SDK Supabase e API Express contra servidor HTTP fictício: bloqueio de anônimos, sessões inválidas, analyst/viewer/sem perfil e acesso administrativo autorizado.
- Chromium: acesso público com gerenciamento bloqueado, tentativa de remover `disabled` no DOM, login, nomes originais no ambiente autorizado, saída/recarga, resposta privada atrasada após saída, pesquisa, resultados vazios, exportação de 80 ocorrências além da rolagem e regressões de layout/filtros/relatórios.

Não houve merge nem comando de publicação. A integração hospedada com o usuário real precisa de validação após revisão.

## Arquivos alterados

- Interface: `src/App.tsx`, `src/components/BaseManagement.tsx`, `src/components/AuditPanel.tsx`, `src/styles.css`.
- Dados e serviços: `src/lib/domain.ts`, `src/lib/audit.ts`, `server/app.ts`, `server/public-data.ts`, `server/reports.ts`.
- Transporte e exportações: `src/lib/api.ts`, `src/lib/downloads.ts`, `src/lib/audit-export.ts`.
- Testes: `tests/domain.test.ts`, `tests/audit.test.ts`, `tests/official-identifiers.test.ts`, `tests/admin-integration.test.ts`, `tests/e2e/admin.spec.ts`, `tests/e2e/audit.spec.ts`, `tests/e2e/dashboard.spec.ts`.
- Documentação: `README.md`, `docs/GERENCIAMENTO-BASE.md`, este relatório.
