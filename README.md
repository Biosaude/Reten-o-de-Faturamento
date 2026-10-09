# BIOSAÚDE | Retenção de Faturamento

Dashboard executivo independente em React 19 + TypeScript, com API Express, acesso direto sem login, motor financeiro histórico e publicação na Vercel. O projeto está no checkout `Biosaude/Reten-o-de-Faturamento`. O Dashboard Comercial foi usado apenas como referência; nenhuma conexão, credencial, regra comercial ou arquivo de produção foi reutilizado.

## Desenvolvimento

Requisitos: Node >= 22, npm e Chromium para os testes de navegador. Neste ambiente, Node 24 e `/usr/bin/chromium` já estão disponíveis.

```sh
cd /workspace/Reten-o-de-Faturamento
npm ci
npm run dev
```

A interface usa a porta 5173 e a API a porta 3001, ambas vinculadas a `127.0.0.1`. A página abre diretamente, sem login ou dependência de Supabase Auth. A leitura compartilhada é anonimizada e as importações temporárias, exclusivas de administradores autenticados, ficam na memória desta sessão do navegador. O botão **Acesso administrativo** permite que usuários `admin` autorizados salvem a base compartilhada; os endpoints de gravação continuam autenticados. A função Vercel proíbe o modo administrativo local.

A base oficial já foi importada neste ambiente, com corte confirmado pelo usuário em **30/09/2026**. Ela é armazenada em `.local/dataset.enc`, criptografada com AES-256-GCM. A chave local fica em `.local/encryption.key`, com permissão 0600. Esses arquivos devem permanecer privados e são ignorados pelo Git. Não são enviados à Vercel nem incluídos em `dist`. Processos precisam ser reiniciados em uma nova tarefa.

Para importar em uma máquina sem a base preparada:

```sh
npm run seed:local -- /caminho/para/base-oficial.xlsx 2026-09-30
```

Após o login administrativo, é possível selecionar Excel/CSV diretamente na seção **Gerenciamento da Base de Dados**. A seleção valida as 14 colunas, mostra o nome, os totais e a quarentena; **Atualizar Dashboard** substitui a versão da sessão de forma atômica e preserva os filtros. Não há anexação nem exclusão de linhas legítimas. Nesse modo temporário, o servidor verifica a autorização e valida o arquivo sem persistência; a versão exibida é descartada ao recarregar. Após entrar em **Acesso administrativo**, o administrador também pode escolher **Base compartilhada (Supabase)**, revisar o arquivo, confirmar e salvar permanentemente pela API existente. Reimportações substituem, sem somar. A API administrativa compartilhada continua rejeitando versões repetidas e conflitos concorrentes. Consulte [docs/GERENCIAMENTO-BASE.md](docs/GERENCIAMENTO-BASE.md).

## Verificação

```sh
npm test
npm run build
npm run test:e2e
npx tsx scripts/readiness.ts  # com a API local em execução
```

A validação específica da planilha oficial usa um arquivo **agregado**, sem pacientes, gerado separadamente em Python/openpyxl/Decimal:

```sh
VALIDATE_OFFICIAL_BASE=1 npm test
npm run audit:data
```

Esse teste só deve ser habilitado para a versão oficial validada em setembro. Bases futuras naturalmente terão resultados diferentes. Os testes de navegador exigem a base oficial no armazenamento local e preparam uma cópia criptografada em `.local/e2e`, preservando a base usada no desenvolvimento; `CHROMIUM_PATH` permite selecionar o executável. O relatório original está em [docs/VALIDACAO.md](docs/VALIDACAO.md); os testes e limites da melhoria de acesso direto estão em [docs/GERENCIAMENTO-BASE.md](docs/GERENCIAMENTO-BASE.md).

## Cálculos e filtros

- A chave é a tupla `Empresa + Agendamento`, sem colisões de concatenação. Empresa é normalizada em maiúsculas e agendamento preserva sua representação textual.
- A coluna N é convertida em centavos inteiros, com arredondamento decimal de meia unidade para cima. Cada linha válida contribui uma única vez. Somatórios acima do limite inteiro seguro são rejeitados.
- Cirurgia iniciada até a referência T está pendente se não tiver data de faturamento ou se o faturamento for posterior a T. Faturamento em T encerra a retenção naquele dia. A nota isolada não encerra a retenção e não gera ocorrência de auditoria pela ausência da data.
- Faixas exclusivas: 0–45, 46–90, 91–135, 136–180 e >180 dias corridos. A média usa cirurgias distintas, sem ponderação financeira.
- O saldo representa a posição no último fechamento selecionado. O faturamento representa fluxo nos meses selecionados por **data de faturamento**, incluindo faturamento parcial. Cirurgias faturadas no período são agendamentos com ao menos uma linha faturada naquele período; não apenas cirurgias totalmente encerradas.
- Mês e quarter se combinam por interseção. Multisseleção de meses soma somente fluxos e usa o último mês disponível para o estoque. Períodos posteriores ao corte não são apresentados. Períodos incompletos são marcados como parciais.
- A comparação anterior usa o mês anterior ao último mês selecionado; com apenas quarters selecionados, usa o quarter anterior. O padrão anual compara o saldo mais recente com o fechamento mensal anterior, enquanto o fluxo cobre o ano disponível.
- Dimensões filtram **registros financeiros** antes da consolidação. Em agendamentos com múltiplos clientes/tipos/representantes, todos os valores são preservados e a situação financeira é calculada sobre o recorte selecionado. A tabela mostra os valores distintos; não inventa um cliente único. Rankings calculam contagens distintas dentro de cada grupo, que podem se sobrepor; seus valores sempre reconciliam com o saldo.
- Situação e faixa são reavaliadas em cada fechamento histórico. As transições com esses filtros representam entradas/saídas do recorte, e não necessariamente encerramento real da cirurgia. Sem esses filtros, as transições distinguem permanência, migração, faturamento total, novas pendências e liberação parcial.
- Exportações usam o mesmo motor e os mesmos filtros. Busca textual, ordenação, paginação e Top N são controles de apresentação; os relatórios incluem todo o recorte financeiro filtrado, não apenas a página visível.

## Qualidade da base

Registros com faturamento anterior à cirurgia, datas inválidas, identidade ausente ou valor inválido/negativo ficam em quarentena. Datas de cirurgia conflitantes colocam o agendamento inteiro em quarentena. É uma política conservadora de exclusão explícita, sem alteração da planilha. A inclusão dos registros em quarentena depende de conferência e reimportação da fonte corrigida pelo responsável pelos dados.

Divergências de dimensões e possíveis duplicatas geram avisos e preservam os registros. Paciente é descartado antes do envio da importação pela interface e novamente pelo validador do servidor: nenhum nome de paciente é armazenado, exibido ou exportado. A planilha original permanece apenas como anexo privado fornecido pelo usuário, fora do projeto público.

## Produção independente na Vercel

**Projeto já configurado:** reutilize o Supabase Auth e o perfil `admin` existentes em `retention_roles`. Não recrie o banco, usuários ou tabelas e não reaplique a migração. As etapas 1 e 2 abaixo se destinam apenas à instalação inicial. O gerenciamento administrativo da interface utiliza a configuração existente descrita em [docs/GERENCIAMENTO-BASE.md](docs/GERENCIAMENTO-BASE.md).

O acesso à interface não exige configuração de Supabase. Sem armazenamento compartilhado, a página abre com indicadores vazios e permite analisar um Excel/CSV na sessão. Configure um Supabase independente apenas para a base compartilhada e as operações administrativas protegidas.

1. Crie um **novo** projeto Supabase exclusivo para retenção. Execute `supabase/migrations/001_retention.sql` no SQL Editor desse projeto.
2. Desabilite cadastro público no Supabase Auth. Crie/convide os usuários e atribua seus perfis pelo SQL Editor, com o UUID real do usuário:

   ```sql
   insert into public.retention_roles(user_id, role)
   values ('UUID-DO-USUARIO', 'admin');
   ```

   Perfis: `admin` lê/importa/exporta; `analyst` lê/exporta; `viewer` lê. Os clientes não têm acesso direto às tabelas: RLS está habilitado e os privilégios de `anon` e `authenticated` são revogados. A API valida o token com Supabase e confere o perfil em toda operação.
3. Importe este projeto em um projeto **novo** na Vercel, separado do comercial. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` em variáveis de servidor, com valores do novo Supabase. Nunca use prefixo `VITE_` na chave de serviço, nem adicione valores ao Git. A chave anon é pública por design e é usada somente pelo login administrativo; a consulta pública do dashboard não depende dela. As tabelas não concedem acesso a ela.
4. Configure ambientes Preview e Production com projetos/dados de teste separados. O build é `npm run build`; saída `dist`; as rotas são definidas em `vercel.json`, com API em `api/handler.ts`.
5. Valide a leitura anonimizada sem sessão e o acesso negado aos endpoints administrativos sem perfil, bem como os perfis de importação/exportação administrativa. A suíte automatizada verifica essas regras com um provedor simulado; conexão ao Supabase real depende das configurações acima.
6. Carregue a base compartilhada pela API administrativa autenticada usando a planilha oficial e **30/09/2026**. A importação temporária atualiza somente a sessão do visitante; **Salvar Base Compartilhada**, disponível após login administrativo e confirmação, grava pela API existente e permanece após recarregar. Não copie `.local` para uma pasta pública. Confira R$ 8.489.909,79 pendentes em 504 cirurgias e 53 parciais.
7. Revise a quarentena e os indicadores, teste Excel/PDF e somente então disponibilize a leitura do dashboard. Supabase gerencia armazenamento cifrado e transporte TLS; configure backups, retenção e acesso ao projeto conforme as regras da organização. O log de importações registra usuário, arquivo, data e totais, sem pacientes.

Não houve criação de recursos externos nem publicação durante esta entrega. O build e o fluxo local foram testados; a publicação e a integração real do novo Supabase precisam ser verificadas após configuração.

## Arquitetura e referência

`src/lib/domain.ts` contém validação, consolidação, snapshots, faixas, filtros, rankings e transições. `src/App.tsx` organiza o dashboard. `server/app.ts` aplica autenticação e permissões; `server/store.ts` implementa armazenamento local criptografado/Supabase; `server/reports.ts` gera Excel/PDF. A migration mantém um snapshot corrente e um log de importações com atualização transacional e proteção contra concorrência.

A referência fornecida usa React/TypeScript, TanStack Start, componentes shadcn/Radix, Recharts e Lucide, com header fixo, limite de 1600px, superfícies claras, KPI com borda lateral e filtros em sete colunas. O novo projeto preserva esses padrões visuais e usa vermelho pontual, sem carregar as regras de metas/vendas, dados embarcados ou integrações do projeto comercial. A navegação de uma única página usa Vite + API independente para facilitar implantação na Vercel. O ZIP original permaneceu intacto.

### Publicação dos campos oficiais B/I/K

A política padrão continua protegendo os identificadores na consulta sem login. Após confirmação de autorização de divulgação pela Biosaúde, configure `RETENTION_PUBLIC_IDENTIFIERS=true` **no servidor Vercel** e gere um deployment da revisão validada. Isso publica exclusivamente Agendamento, Médico e Representante originais, inclusive na auditoria, sem reimportar nem modificar a base no Supabase. Pacientes não são publicados, notas continuam protegidas e as permissões administrativas permanecem iguais. Veja [diagnóstico, testes e procedimento de publicação](docs/BASE-COMPARTILHADA-CAMPOS-OFICIAIS.md).
