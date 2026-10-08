# Melhoria: acesso direto e gerenciamento integrado

A página principal agora abre em uma sessão nova sem e-mail, senha, redirecionamento ou chamada a Supabase Auth. KPIs, filtros, gráficos, rankings e tabela mantêm a estrutura original. `src/lib/domain.ts`, incluindo a validação financeira e a reconstrução histórica, não foi modificado.

## Fluxo da interface

A seção **Gerenciamento da Base de Dados**, antes dos filtros e indicadores, reproduz o container branco, bordas discretas, título com ícone de banco, três cards horizontais e linha de metadados da referência comercial. Em dispositivos móveis os cards ficam em uma coluna.

1. **Baixar Modelo da Base** gera um Excel com uma aba e as 14 colunas oficiais A–N, sem dados reais ou modelo de metas/vendas.
2. **Selecionar Nova Base** aceita Excel e CSV, executa o validador existente e mostra nome, registros, cirurgias, valor em quarentena e sucesso/erro. A base ativa permanece intacta nessa etapa. Uma seleção inválida desabilita a atualização e conserva a versão anterior.
3. **Atualizar Dashboard** aplica um único dataset validado, preserva todos os filtros e atualiza simultaneamente os componentes. O carregamento é visível e o sucesso aparece após a aplicação. Nova seleção/substituição nunca soma dados à versão anterior.

A linha informativa deriva da base ativa: atualização, arquivo, quantidade de empresas, registros, cirurgias distintas e período de cirurgia dos registros válidos. A data de corte da nova base é explícita para não presumir cobertura de faturamento até a data atual.

## Segurança e persistência

A API `/api/public/dataset` é somente de leitura. A projeção pública mantém os números e datas usados nos cálculos, mas substitui os identificadores de agendamento, médico, representante e nota por pseudônimos gerados por HMAC com chave aleatória exclusiva do servidor. Nomes de pacientes já eram descartados pelo validador e continuam ausentes. O nome do arquivo compartilhado é apresentado como `Base compartilhada.xlsx` para não expor nomes internos.

A projeção pública não é o banco de dados e não permite gravação. Ela contém dados financeiros e dimensões organizacionais necessários ao dashboard. RLS, chave administrativa somente no servidor, armazenamento cifrado local e os endpoints administrativos autenticados permanecem preservados. As permissões desses endpoints independem da página principal, que não tem mais login.

**Importações feitas no dashboard têm escopo da sessão do navegador.** Não são enviadas à API, ao Supabase, ao localStorage ou a outros visitantes. Nomes de pacientes são descartados durante a leitura. Cada visitante pode analisar e exportar sua planilha com os filtros atuais. Ao recarregar/fechar a página, essa base é descartada e a projeção compartilhada volta a ser carregada. Os relatórios Excel/PDF são gerados a partir da versão ativa e do mesmo motor, no navegador.

Não há funcionalidade pública de gravação compartilhada. A atualização persistente do servidor continua exigindo os mecanismos administrativos existentes. A função transacional e o controle de versão do Supabase não foram alterados. Sem Supabase configurado, a API retorna ausência de base e a página ainda abre com os controles e indicadores vazios, permitindo selecionar uma planilha; não há bloqueio por falta de autenticação.

## Validação executada

- 53 testes automatizados aprovados com `VALIDATE_OFFICIAL_BASE=1 npm test`. O teste da base oficial continua comparando os nove fechamentos com cálculo independente Python/Decimal.
- 7 testes Chromium aprovados: sessão nova sem login; modelo reaberto com as 14 colunas; histórico original; importação válida e troca atômica; metadados; filtros mantidos e filtros por empresa/UF/cliente/hospital/mês/quarter; Excel com saldos da base importada; PDF; seleção incompatível; reimportação sem soma; ausência de escrita na API; descarte ao recarregar; funcionamento sem Supabase; viewports 1920, 1024 e 390 pixels.
- Teste de projeção pública comprova ausência dos identificadores originais e igualdade de valores, faixas, quantidades, fluxo e histórico antes/depois da anonimização.
- API continua negando gravação compartilhada sem autenticação. Testes dos perfis administrativos foram mantidos.
- TypeScript e build de produção aprovados. Auditoria das dependências de produção sem vulnerabilidades reportadas.

Capturas visuais ficam em `.local/screenshots/base-management-*.png`, fora do Git/build. O Dashboard Comercial original não foi modificado. O deploy real permanece sujeito à configuração da Vercel; os testes de acesso direto, importação e indicadores foram executados no ambiente local.

## Arquivos alterados ou adicionados

- Interface: `src/App.tsx`, `src/styles.css`, `src/components/BaseManagement.tsx`, `src/components/MultiSelect.tsx`.
- Leitura e arquivos: `src/lib/api.ts`, `src/lib/import.ts`, `src/lib/downloads.ts`, `src/lib/report-data.ts`.
- API e relatórios: `server/app.ts`, `server/public-data.ts`, `server/reports.ts`.
- Verificação: `scripts/readiness.ts`, `tests/api.test.ts`, `tests/public-data.test.ts`, `tests/e2e/dashboard.spec.ts`, `playwright.config.ts`.
- Dependências e documentação: `package.json`, `package-lock.json`, `README.md`, `docs/VALIDACAO.md`, este relatório.

`src/lib/domain.ts`, `server/store.ts` e a migration Supabase permanecem intactos. Nenhum componente, cálculo ou recurso do Dashboard Comercial original foi alterado.
