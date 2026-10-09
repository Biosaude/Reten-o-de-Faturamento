# Gerenciamento da base de dados

A consulta pública continua abrindo sem login e utiliza `/api/public/dataset`, com os identificadores pessoais e internos pseudonimizados pelo servidor. Os indicadores, filtros, gráficos, rankings, exportações e regras financeiras existentes foram preservados.

A seção **Gerenciamento da Base de Dados**, no rodapé após a auditoria, mantém o modelo Excel, seleção de arquivo, atualização, data de corte, validação e metadados. Excel/CSV continuam passando pelo mesmo validador de 14 colunas. Pacientes são descartados antes de qualquer envio ao servidor.

## Importação temporária

**Atualizar Dashboard** continua sendo o comportamento padrão depois do login administrativo. Os três controles de gerenciamento, o seletor de arquivo e a data de corte ficam bloqueados na consulta pública. O modelo é servido por `/api/template` e a validação usa `/api/validate`; ambos verificam o perfil `admin` no servidor. O arquivo validado atualiza apenas a memória do navegador, preservando os filtros financeiros, sem gravação no Supabase. Ao recarregar, a versão pública compartilhada volta a ser consultada. Excel/PDF são gerados a partir da versão ativa e dos filtros existentes.

## Atualização compartilhada por administrador

1. Clique em **Acesso administrativo** e entre com o e-mail e a senha do usuário já cadastrado no Supabase Auth.
2. A interface valida a sessão pela rota existente `/api/me`. Apenas usuários com perfil `admin` em `retention_roles` podem habilitar a atualização compartilhada. Usuários sem esse perfil recebem uma mensagem e mantêm somente a consulta pública; o gerenciamento temporário também é exclusivo de administradores.
3. Selecione **Base compartilhada (Supabase)**. A interface consulta a versão compartilhada para obter o identificador usado no controle de concorrência, independentemente da planilha temporária exibida no dashboard.
4. Confira a data de corte, selecione o arquivo e revise registros, cirurgias e quarentena. Marque a confirmação explícita da substituição da base compartilhada.
5. Clique em **Salvar Base Compartilhada**. A rota existente `/api/import` valida novamente o token, o perfil e o arquivo no servidor, e utiliza a RPC transacional `replace_retention_dataset`, com o identificador esperado e o usuário responsável.
6. Após o sucesso, o administrador vê os dados originais autorizados da versão salva, preservando os filtros financeiros. A base compartilhada permanece disponível depois de sair ou recarregar, quando a interface volta a usar a projeção pública anonimizada. Dados privados não são reutilizados no modo público.

O controle de versão, rejeição de arquivos repetidos e de datas anteriores continua no backend. Conflitos de importação são apresentados como erro, sem informar sucesso.

## Autenticação e configuração existente

O login utiliza `/api/auth/config` e Supabase Auth `signInWithPassword`; não cria usuários, perfis, tabelas ou banco de dados. Configure no Vercel as variáveis de servidor já previstas: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (chave pública do cliente) e `SUPABASE_SERVICE_ROLE_KEY` (exclusiva do servidor). Nunca coloque a chave administrativa em variáveis `VITE_`.

O token administrativo fica somente em memória, sem persistência em localStorage. A sessão pode ser renovada enquanto a página está aberta; após recarregar, o administrador entra novamente para novas gravações. Senhas são limpas do formulário após cada tentativa e não são registradas em logs. A saída usa o encerramento local da sessão Supabase e a rota existente `/api/auth/logout`.

No desenvolvimento em loopback, o botão **Entrar no ambiente local** reutiliza `/api/auth/local`; esse modo permanece proibido na função Vercel. Não há login local habilitado em produção.

As migrações, permissões RLS, esquema e regras de acesso existentes não foram alterados. Para um projeto já configurado, não execute novamente a migração nem recrie usuários ou a base. Sem configuração de autenticação, a consulta pública permanece disponível; o gerenciamento exige autenticação administrativa válida.

## Dados originais e auditoria

Depois do login administrativo, `/api/dataset` fornece Agendamento, Médico e Representante originais para a tabela, seus detalhes, filtros e rankings. A chave armazenada Empresa + Agendamento não é modificada. O modo público continua apresentando pseudônimos, inclusive na auditoria. Ao entrar/sair, pesquisas e filtros de médico/representante são limpos para evitar valores de outro modo de privacidade; os demais filtros financeiros permanecem.

A condição `note_without_date` não gera mais ocorrência: o registro sem data válida continua financeiramente pendente. A auditoria de versões já armazenadas é ajustada na leitura, sem reimportar ou regravar registros. Agendamentos das ocorrências são recuperados por metadados da linha ou pela chave original, incluindo registros em quarentena.

A auditoria possui pesquisa por agendamento/linha/tipo/severidade, filtros Todas/Conferir/Quarentena e **Exportar Ocorrências (.xlsx)**. O Excel usa a lista filtrada completa, com as quatro colunas, cabeçalho formatado, filtros automáticos e larguras ajustadas. O arquivo respeita o modo de privacidade ativo.

## Validação

- Integração com Supabase HTTP simulado: credenciais válidas/inválidas, administração autorizada, bloqueio de analyst/viewer/usuário sem perfil e de tokens inválidos, confirmação obrigatória, RPC com dados fictícios, conflito de versão, nova leitura pública e anonimização.
- Chromium: login, senha inválida, perfil sem autorização, confirmação e gravação compartilhada, recarga/saída, conflito, padrão temporário e viewports 1920/1024/390 px. Os cenários administrativos interceptam todas as chamadas `/api/*` e usam somente dados fictícios em memória.
- Regressões existentes: base oficial e ranking reconciliados, fórmulas financeiras, filtros, importação temporária, Excel/PDF, layout e proteção dos endpoints.
- Build e carregamento ESM do backend continuam verificados.

Os testes não conectam ao Supabase de produção e não excluem nem substituem registros reais. O usuário existente, suas credenciais e a configuração hospedada do Vercel precisam ser validados no ambiente autorizado; não houve merge ou publicação automática.
