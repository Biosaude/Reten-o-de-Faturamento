# Referência financeira dinâmica e histórico

## Diagnóstico

Não há `09/10/2026` nem `2026-10-09` fixado no código de produção. `BaseManagement` recebe o corte informado pelo administrador; `/api/import` o valida com `validateBase` e persiste `Dataset.asOf`. `/api/public/dataset` e `/api/dataset` preservam esse campo. `period` o utiliza para limitar o fechamento exibido por `App`.

Os valores da auditoria do PR #8 foram reproduzidos com referência em 09/10. Isso não significa que 09/10 fosse uma constante do motor. Não foi possível ler o payload publicado pelo Vercel neste ambiente, portanto não se afirma ter confirmado diretamente o corte/configuração de produção.

Foram identificados dois pontos no código a ajustar: `defaultFilters` fixava o ano inicial em 2026, e não havia seleção de data específica. Além disso, as séries mensais/trimestrais eram limitadas ao corte da base, mesmo quando uma consulta selecionava um fechamento anterior; agora nenhuma série ultrapassa a referência escolhida.

## Regra implementada

| Seleção | Referência do estoque |
|---|---|
| Abertura / Posição atual | `asOf` validado da versão carregada |
| Ano isolado, anterior ao corte | 31/12 daquele ano |
| Ano que contém o corte | Corte validado, limitado a 31/12 |
| Mês | Último dia do último mês selecionado, limitado ao corte |
| Quarter | Último dia do último trimestre selecionado, limitado ao corte |
| Mês + quarter | Interseção existente, fechamento do último mês elegível |
| Data específica | Dia selecionado, até o corte validado |
| Corte ausente/inválido/futuro | Sem fechamento; solicitar definição administrativa |

O ano inicial é obtido do corte da base, sem constante de ano e sem usar a data do relógio para inventar cobertura. A validação do relógio apenas impede um corte futuro, conforme a regra já aplicada à importação.

`Data específica` limpa os filtros de mês/quarter, e a seleção de ano/mês/quarter limpa a data específica para evitar interpretações conflitantes. `Posição atual` limpa somente filtros temporais; empresa, situação, faixa e demais dimensões permanecem. `Limpar filtros` restaura a posição atual e limpa todo o recorte, como antes.

Um novo dataset move a posição corrente para seu corte validado quando não há uma seleção temporal explícita. Consultas históricas selecionadas são preservadas. A consulta pública acessada novamente/recarregada lê o corte da versão publicada. Não foi adicionado polling ou reescrito o mecanismo de publicação.

## Estoque e fluxo

As regras de `snapshot`, `summarize`, `ranking`, conversão de datas/moeda, validação de registros, agrupamento Empresa + Agendamento, classificação parcial e quarentena não foram alteradas. Só foram modificados a resolução do período e o limite temporal fornecido a essas funções.

O estoque continua sendo apurado na última referência selecionada, sem somar saldos mensais. O fluxo segue as datas de faturamento nos meses selecionados e termina na referência. Na data específica, sem seleção de meses, o fluxo corresponde ao ano até aquele dia. As séries mensais/trimestrais também terminam nesse dia; meses/trimestres incompletos são identificados como parciais.

Os endpoints de exportação aceitam agora ano omitido (posição atual) e `referenceDate` ISO válido. Isso evita descartar o filtro na exportação administrativa. Pedidos antigos com ano explícito continuam funcionando; permissões e rotas foram preservadas.

## Datas na interface

- `Posição financeira em: DD/MM/AAAA`: data efetivamente utilizada por KPIs, faixas e rankings.
- `Última atualização da base: DD/MM/AAAA HH:mm:ss`: `updatedAt`, apresentado separadamente no cabeçalho, em America/Sao_Paulo.
- O corte validado continua identificado no rodapé dos filtros.

Foi incluído somente o controle de data específica, o botão de retorno à posição atual e os textos necessários. Layout de cards, gráficos, tabela e gerenciamento não foi alterado. Uma regra CSS mantém o novo input no tamanho dos seletores existentes.

## Autoridade do corte

A planilha geral contém registros até 15/10 e faturamentos até 16/10, mas isso não autoriza deduzir automaticamente o fechamento oficial. A referência 16/10 é utilizada nos testes como simulação conciliada do PR #8. A confirmação de que esse é o corte oficial foi solicitada ao usuário separadamente.

Se o payload publicado ainda tiver `asOf=2026-10-09`, este código continuará respeitando 09/10 até que o administrador valide e publique o corte atualizado pelo fluxo existente. Fazer merge/deploy do frontend não altera metadados no Supabase. Não se deve avançar o corte silenciosamente nem usar `updatedAt`/maior data dos registros como substituto.

## Regressão com a planilha do PR #8

Arquivo privado: `Base de dados retenção de faturamento geral.xlsx`, 17.683 registros; mesmo hash e critérios de `CONCILIACAO-FINANCEIRA-GERAL.md`.

| Consulta | Saldo pendente |
|---|---:|
| Data específica 09/10/2026, sem situação | R$ 15.279.934,18 |
| Posição atual com corte validado de teste em 16/10/2026 | R$ 12.407.370,81 |
| Setembro/2026 | R$ 14.172.342,77 |
| Agosto/2026 | R$ 13.865.911,99 |
| Q2/2026 | R$ 11.874.767,67 |

Esses números aparecem somente nos testes/evidências; não nas fórmulas. A conciliação independente do PR #8 continua passando com o novo comportamento padrão.

## Validação executada

- `npm run build`: aprovado, incluindo TypeScript do frontend e NodeNext do backend; aviso de chunk grande preexistente.
- `OFFICIAL_RECONCILIATION_PATH='/caminho/planilha.xlsx' npm test`: **106 testes aprovados e 3 pulados**. Os três antigos exigem o dataset privado de 3.149 registros, indisponível. A planilha geral atual foi testada em ambas as regressões financeiras.
- `E2E_MOCK_ONLY=1 OFFICIAL_RECONCILIATION_PATH='/caminho/planilha.xlsx' npm run test:e2e -- tests/e2e/reference.spec.ts tests/e2e/admin.spec.ts`: **10 testes aprovados**.
- Navegador: posição inicial, data específica, mês, ano, quarter, retorno à posição atual mantendo dimensões, duas datas distintas no cabeçalho, corte ausente, atualização administrativa corrente/histórica, logout/reload, controles públicos bloqueados, cenários de autorização existentes e responsividade em 1920/1024/390 px.
- O cenário de navegador com a planilha real confere os cinco saldos acima no acesso público e administrativo. APIs interceptadas impedem gravações em banco; testes HTTP usam API local e armazenamento simulado.
- A opção `E2E_MOCK_ONLY` evita preparar a base local antiga quando os arquivos selecionados interceptam todas as APIs. O modo padrão da suíte E2E não mudou.
- As funções financeiras e o armazenamento foram comparados com a revisão base; somas e regras de validação estão preservadas. Nenhum registro oficial foi alterado.

Não foram executados merge ou deploy de produção. A conexão real ao Supabase e a leitura direta da URL publicada não foram verificadas; os testes públicos/administrativos usaram serviços locais/simulados. O código e a regressão estão disponíveis para revisão.

## Arquivos desta alteração

- `src/lib/domain.ts`: ano padrão dinâmico, corte confiável, data específica e limites de período.
- `src/App.tsx`: seleção temporal, retorno à posição atual e identificação separada das duas datas.
- `src/styles.css`: tamanho do novo input de data.
- `server/app.ts`: compatibilidade dos filtros temporais na exportação autenticada.
- `tests/reference-date.test.ts`: seleção de referência e regressão financeira com o arquivo privado.
- `tests/reference-api.test.ts`: mesmo corte nos dois acessos e respeito à referência no Excel administrativo.
- `tests/e2e/reference.spec.ts`: fluxos de navegador públicos/administrativos, atualização e saldos oficiais.
- `playwright.config.ts`: preparação opcional para testes com APIs totalmente simuladas.
- Este relatório.

O PR #8 ainda estava aberto ao iniciar esta alteração. O PR de referência dinâmica tem a branch do PR #8 como base para manter o diff restrito a este pedido e reutilizar suas evidências/testes; deve ser revisado após ou em conjunto com aquela auditoria.
