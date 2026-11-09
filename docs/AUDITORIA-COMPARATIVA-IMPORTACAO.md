# Auditoria da importação — 09/11/2026

Branch isolada: `fix/import-response-size`. Referência: `origin/main` em `bc2fbd0`, após PR #11.

## Conclusão

**Correção pronta para revisão técnica; publicação ainda depende de homologação autorizada na Vercel.** Foi reproduzida uma falha de entrega por tamanho da resposta, com a persistência simulada já concluída. A correção mantém integralmente o JSON e reduz a resposta da nova base de 8.677.805 para aproximadamente 1.144.236 bytes no teste HTTP isolado.

Isso comprova o defeito sob um limite de resposta de 4.500.000 bytes, mas **não comprova a causa histórica do Request ID `xtlsm-1794254468822-8ae52fa1bfee`**. Não há código de erro nativo nem stack trace dessa execução. As duas bases geram JSON acima do limite; portanto, o tamanho sozinho não explica por que a base antiga teria funcionado naquele ambiente. Nenhuma publicação real foi executada para testar a infraestrutura.

## Comparação integral dos anexos

“modelo-retencao-faturamento.xlsx” foi tratado como antigo; “modelo-retencao-faturamento 09 de novembro.xlsx”, como novo. A inspeção percorreu todas as células e linhas dos dois arquivos, com ExcelJS e conferência de formatos. Nenhuma célula foi tratada como instrução. Não foram incluídos registros, identificadores de pacientes ou valores financeiros neste relatório, nos testes versionados ou no código.

| Medida | Antigo | Novo |
|---|---:|---:|
| Arquivo XLSX, bytes | 1.731.072 | 1.820.461 |
| Abas | 1 | 1 |
| Colunas declaradas | 14 | 15 |
| Linhas de dados | 18.256 | 18.031 |
| Registros válidos | 17.757* | 17.532 |
| Quarentena | 499* | 499 |
| Ocorrências de auditoria | 4.202* | 3.983 |
| Registros detalhados de auditoria | 1.052* | 881 |
| Corpo JSON de importação, bytes | 3.489.873* | 3.607.425 |
| Dataset JSON sem compressão, bytes | 8.515.989* | 8.677.805 |
| Corpo estimado do RPC, bytes | 8.516.108* | 8.677.924 |
| Resposta HTTP gzip nível 1, bytes | 1.057.710* | 1.144.236 |

Os tamanhos HTTP incluem metadados gerados; IDs e horários podem alterar poucos bytes em outra execução. Os corpos de importação ficam abaixo do limite Express de `4mb` e de 4,5 MB. O JSON retornado é maior que o pedido porque agrega registros normalizados, auditoria e detalhes de quarentena.

**Ressalva do antigo (*):** há 14 cabeçalhos, mas todas as linhas têm uma célula O adicional, vazia e formatada. O parser atual interpreta a largura como 15 e rejeita o arquivo bruto por incompatibilidade de largura. Esse comportamento já existe na referência, antes desta correção. Para comparação e reprodução de transporte, foi utilizada uma projeção privada de suas 14 colunas declaradas, removendo apenas a célula adicional comprovadamente vazia. O anexo permaneceu intacto. Não se afirma que a importação literal desse arquivo antigo passou, nem se alterou o parser para contornar esse problema distinto.

Nos dois arquivos, as datas das colunas C/L são células de data com formato `mm-dd-yy`; os valores monetários são numéricos com formato de moeda. Não há fórmulas nem resultados de fórmulas ausentes. Na base nova, N é `Custo médio total` e O é `Valor total`; na antiga, N é `Valor total`. O mapeamento existente por cabeçalho preserva valor em centavos e custo em centavos separados. A coluna de custo nova não contém ausências, valores inválidos ou negativos; 19 linhas têm custo zero.

As 499 linhas em quarentena correspondem a 44 ocorrências de faturamento anterior à cirurgia e 455 de datas de cirurgia conflitantes em cada base. Existem ainda avisos de divergências cadastrais; a base antiga tem 163 avisos de possível duplicidade e a nova nenhum. Avisos não devem ser somados como se fossem linhas adicionais em quarentena.

Comparando os registros válidos por conteúdo financeiro/cadastral, sem custo, paciente e posição de origem, há 17.169 registros comuns, 588 ocorrências exclusivas da antiga e 363 da nova. A nova base não representa somente a inclusão de uma coluna: também altera o conjunto de dados. Isso explica diferenças nos totais entre arquivos sem implicar mudança de fórmula.

## Fluxo e diagnóstico

O caminho auditado é `api/handler.ts` → `createApp(false)` → limite JSON/rate limiting → validação do bearer no Supabase → consulta de papel → exigência de administrador → validação de estrutura, confirmação e `expectedId` → leitura da versão atual → normalização financeira → verificações de duplicidade/data → `saveDataset` → `res.json(ds)`.

`saveDataset` verifica a disponibilidade do histórico e chama `replace_retention_dataset`. A implementação SQL versionada utiliza lock transacional, comparação da versão esperada e gravação de histórico/base corrente/auditoria na mesma chamada transacional. Erro dentro dessa chamada deve reverter suas gravações. Entretanto, erro **depois** do retorno do RPC, inclusive na resposta HTTP, pode ocorrer com a versão inteira já persistida. HTTP 500 não prova ausência de gravação. A manutenção da base anterior na interface também pode refletir estado em cache.

A reprodução utilizou o aplicativo real com autenticação/provedor simulados, gateway local que rejeita respostas acima de 4.500.000 bytes e armazenamento substituído. A nova base e a projeção antiga retornaram 500 sem compressão **depois de uma chamada bem-sucedida ao armazenamento simulado**; com compressão retornaram 200, preservando o Dataset completo, a validação e a recarga. O gateway é um modelo explícito, não uma emulação certificada da Vercel.

Os payloads reais também passaram por `SELECT $1::jsonb AS payload` em PostgreSQL embarcado efêmero, com igualdade integral após leitura. Isso verifica serialização JSON/JSONB e a coluna opcional `costCents`; não testa rede, permissões, limites do PostgREST, timeout ou execução do RPC no projeto Supabase real. Nenhuma DDL, migration ou gravação SQL foi executada nessa reprodução. O armazenamento existente é JSONB, sem uma nova coluna SQL obrigatória para custo. Esta correção não exige migration. O estado das migrations em Production não foi consultado.

O erro genérico do endpoint também pode esconder falhas de leitura, transporte/RPC ou serialização. A autenticação tem resposta própria 401/403/503; conflitos de versão retornam 409 e histórico indisponível retorna 503. Não apareceu falha de serialização nos anexos. Não há evidência disponível de negação de permissão, limite do Supabase, timeout ou falta de memória no incidente. Os 16,04 s e 520 MB informados não bastam para provar nenhuma dessas causas. O pico local inclui cliente, servidor e PostgreSQL WASM no mesmo processo e não é comparável ao consumo da função Vercel.

O aviso `Forwarded` relatado ocorreu em `/api/validate` com HTTP 200. A validação interna da biblioteca de rate limiting registra esse aviso sem necessariamente interromper a requisição; ele não demonstra a causa do 500. Nenhuma configuração de proxy, autenticação, autorização ou rate limiting foi alterada.

Sem consultar Production, não se pode afirmar se a tentativa histórica gravou uma versão nem se a infraestrutura instalada coincide com os SQLs versionados. A auditoria demonstra a possibilidade de sucesso do banco seguido de falha HTTP, não gravações parciais comprovadas no projeto real.

## Correção aplicada

`server/large-json-response.ts` comprime com gzip nível 1 somente respostas JSON serializadas acima de 4.000.000 bytes, quando o cliente aceita gzip. Usa `Content-Encoding`, `Vary: Accept-Encoding` e tamanho calculado pelo Express para o corpo comprimido. O objeto e os bytes JSON após descompressão permanecem iguais; `fetch().json()` e o contrato do frontend permanecem iguais.

A única integração é um middleware em `/api` no `server/app.ts`. Isso cobre validação, publicação, leitura e versões históricas, evitando corrigir apenas o POST e deixar a recarga falhar pelo mesmo tamanho. JSON pequeno e relatórios binários permanecem sem compressão. Clientes que recusam gzip mantêm o comportamento anterior; para eles o limite continua sendo uma restrição. A compressão não elimina o custo de gerar o Dataset e não garante acomodar bases futuras arbitrariamente maiores.

Não houve mudanças em layout, filtros, indicadores, domínio financeiro, persistência, SQL, variáveis, credenciais, dependências ou configuração de deploy. Não foram adicionados logs com dados dos anexos.

## Validação

| Execução | Resultado |
|---|---|
| Unitários/integração: `npx vitest run --exclude tests/audit-history-migration.test.ts --exclude tests/weekly-migration.test.ts` | 154 aprovados, 5 ignorados, 0 reprovados |
| Arquivos de testes que executam migrations | 2 arquivos / 5 testes não executados, respeitando a restrição de não executar migrations |
| Suíte E2E: `npm run test:e2e` | 28 aprovados, 2 ignorados, 0 reprovados |
| Reprodução privada dos dois anexos | 1 teste aprovado, 0 ignorados, 0 reprovados |
| Conciliação independente com `Decimal` | 18 cenários coincidentes |
| `npm run build` | Aprovado; aviso de tamanho de chunks do frontend |

Os 5 testes unitários ignorados e 2 E2E ignorados dependem de fixtures oficiais privadas ausentes; não foram inventados dados para substituí-los nem declarados aprovados. A suíte padrão de unitários não foi executada integralmente porque inclui testes que aplicam migrations. A suíte E2E foi executada por completo, com as duas exclusões declaradas pela própria suíte.

Os sete novos casos unitários/integração verificam limite simulado, negociação gzip, recusa de gzip, JSON pequeno, bytes binários, igualdade de valores e importação autenticada grande seguida de recarga. O novo E2E publica 18.031 linhas inteiramente sintéticas, incluindo 499 em quarentena, em armazenamento local isolado, conferindo o indicador financeiro e o de custo após recarga. Nenhum teste acessou o Supabase de Production.

Com os anexos privados, as projeções financeiras anteriores foram comparadas em três referências de data, sem diferença causada pelo transporte ou pela coluna de custo. A conciliação independente percorreu 18 cenários, incluindo dimensões, situações, faixas e referências de data. Os testes existentes de histórico e filtros passaram. A implementação financeira permanece idêntica à referência.

## Arquivos e limites finais

Arquivos da entrega: `server/app.ts`, `server/large-json-response.ts`, `tests/large-json-response.test.ts`, `tests/e2e/large-import.spec.ts` e este relatório. Os scripts de inspeção e resultados contendo dados dos anexos permanecem em `.local/`, ignorado pelo Git, com acesso restrito. Os testes versionados contêm somente dados sintéticos.

A solução está pronta para revisão do defeito reproduzido. A confirmação da causa do incidente e da eficácia na infraestrutura Vercel específica permanece pendente de evidência nativa/homologação autorizada. Não se declara a publicação em Production homologada por um gateway local. Não foram realizadas importações reais, migrations, alterações no Supabase, push, criação de PR, merge ou deploy nesta entrega.
