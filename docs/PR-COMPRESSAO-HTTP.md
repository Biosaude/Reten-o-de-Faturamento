# fix: compress oversized dataset JSON responses without changing the API contract

Destino proposto: `main`. Origem: `fix/import-response-size`. Status proposto: **draft**, aguardando homologação autorizada na Vercel. Correção de código: `46b9026`.

## Problema e alteração

Respostas completas de Dataset ultrapassam o limite de 4,5 MB usado na reprodução isolada. O POST pode terminar a persistência antes de falhar na entrega da resposta. A alteração comprime somente respostas JSON acima de 4.000.000 bytes quando o cliente aceita gzip, preservando o Dataset completo e o contrato consumido pelo frontend. Também cobre validação, leitura e histórico para que a recarga não tenha o mesmo problema.

Não altera layout, fórmulas, indicadores, filtros, autenticação, permissões, rate limiting, dependências, persistência ou esquema SQL. O JSON descomprimido permanece igual. Os testes versionados utilizam exclusivamente dados sintéticos; nenhum anexo ou dado financeiro confidencial integra este PR.

`vercel.json` desabilita deploys Git exclusivamente para a branch `fix/import-response-size`, respeitando a autorização de push/PR sem Preview automático. As demais configurações permanecem iguais.

## Validação

- `npm test`: 159 aprovados, 5 ignorados, 0 reprovados.
- Os cinco testes anteriormente pendentes de migrations passaram em PGlite efêmero isolado; já estão incluídos no total acima.
- `npm run test:e2e`: 28 aprovados, 2 ignorados, 0 reprovados.
- O caso de lote grande foi reforçado e repetido com sucesso: o Chromium recebe via `fetch` todos os registros e a auditoria após recarga, iguais à resposta da publicação. Essa repetição não é somada como novo teste da suíte.
- Reprodução privada dos anexos: 1 aprovado; 18 cenários de conciliação financeira coincidentes.
- `npm run build`: aprovado.
- Testes cobrem negociação e recusa de gzip, cabeçalhos, limite simulado, igualdade do JSON, respostas pequenas e binárias, autenticação, conflito de versão, indicadores, histórico e persistência isolada.

Os testes ignorados dependem de fixtures oficiais privadas ausentes e não são declarados aprovados. O relatório completo e as ressalvas da comparação dos anexos estão em `docs/AUDITORIA-COMPARATIVA-IMPORTACAO.md`.

## Pendências e riscos

A falha por tamanho foi reproduzida em gateway local. A causa histórica daquele Request ID e a eficácia no gateway Vercel do projeto **não estão comprovadas**. A consulta direta à documentação Vercel e à API GitHub foi bloqueada pela rede do ambiente. Inspeção do adaptador Node público não substitui homologação real.

Os testes locais demonstram redução do corpo abaixo de 4,5 MB e JSON completo. Ainda é preciso verificar na Vercel a negociação dos cabeçalhos, contabilização de tamanho e entrega íntegra ao navegador, em Preview isolado autorizado e com dados sintéticos. Clientes que recusam gzip e bases futuras maiores continuam sujeitos ao limite. A compressão preserva o custo de construção do Dataset em memória.

**Não realizar merge ou deploy com base apenas nesta validação local.** Manter o bloqueio de deploy Git desta branch; draft sozinho não impede Preview. Não foi autorizada alteração das configurações remotas nem execução de Preview, importação real ou escrita no Supabase de Production.

## Reversão

Em branch própria, executar `git revert --no-commit 46b9026` (ou utilizar o commit de squash correspondente). Preservar os relatórios posteriores em eventuais conflitos de documentação, conferir a remoção do middleware e de sua integração, registrar o commit, revisar o diff e repetir unitários, E2E e build em novo PR. Não executar deploy de reversão sem autorização. Não há migration ou mudança de dados para desfazer. A versão anterior imediata já aceita 15 colunas; não é necessário converter a planilha para 14 colunas. A reversão restaura o risco de respostas grandes e não reverte publicações eventualmente concluídas no banco.
