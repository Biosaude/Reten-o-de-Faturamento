# Conciliação financeira da base geral — 16/10/2026

## Conclusão

Os três valores informados foram reproduzidos exatamente a partir da planilha enviada, sem modificar valores, fórmulas, filtros, classificação ou data de corte do sistema. A diferença decorre de comparar **L vazia no arquivo atual** com a **posição histórica de 09/10/2026**, somada à diferença entre selecionar somente cirurgias totalmente pendentes ou também incluir as parcelas pendentes das parcialmente faturadas. Não foi comprovado erro no motor financeiro.

A posição de 09/10 foi identificada pela reprodução exata dos dois saldos relatados; isso não constitui leitura da configuração de produção. Em simulação de 16/10/2026, sem filtro de situação, o motor já retorna R$ 12.407.370,81. Não foi feita correção numérica, alteração automática de corte, importação ou publicação de base.

## Arquivo efetivamente conferido

- `Base de dados retenção de faturamento geral.xlsx`, aba `Cirurgias Realizadas  01`, 14 colunas A–N.
- SHA-256: `8139db7941f515f4685d7125f8f4203f092580913ccadc95d9080bcb2ad43e9e`.
- 17.683 registros; 3 empresas; cirurgias de 01/01/2024 a 15/10/2026; faturamentos até 16/10/2026.
- 5.790 registros de cirurgias em 2024, 6.316 em 2025 e 5.577 em 2026.
- Total original: **R$ 289.993.794,55**; válido: **R$ 279.248.480,76**; quarentena: **R$ 10.745.313,79**. Os três valores conciliam exatamente.
- 17.185 registros válidos; 498 em quarentena: 455 por datas distintas dentro de Empresa + Agendamento e 43 por faturamento anterior à cirurgia. Nenhum foi liberado ou removido para atingir um total.
- Nenhuma duplicata exata na planilha. Repetições legítimas e agendamentos iguais em empresas diferentes foram preservados.

A soma independente Python/openpyxl/Decimal identificou **917 linhas com L vazia**, totalizando **R$ 12.407.370,81**, incluindo todos os anos e sem filtro de situação ou dimensão. Não se aplicou filtro de ano da cirurgia para reproduzir o Excel. Uma dessas linhas está em quarentena e tem valor zero; a diferença de contagem não altera a soma.

## Ponte exata: Excel → posição histórica de 09/10/2026

| Conjunto | Linhas | Valor |
|---|---:|---:|
| Excel: L vazia, todos os registros | 917 | R$ 12.407.370,81 |
| Subtrair: L vazia e cirurgia posterior a 09/10, registros válidos | 41 | − R$ 485.114,05 |
| Subtrair: L vazia em quarentena | 1 | − R$ 0,00 |
| Adicionar: cirurgia até 09/10, válida, com faturamento posterior a 09/10 | 187 | + R$ 3.357.677,42 |
| Dashboard: saldo pendente em 09/10, sem filtro de situação | 1.062 linhas financeiras | **R$ 15.279.934,18** |

875 linhas de L vazia estão nos dois conjuntos, com R$ 11.922.256,76. Somando as 187 linhas faturadas após a referência, chegam-se às 1.062 linhas pendentes do fechamento histórico. A diferença final é **R$ 2.872.563,37**, sem resíduo ou diferença de interpretação dos valores/datas dos 17.185 registros válidos.

Registros sem data de faturamento ou faturados depois da referência são pendentes naquela referência. Cirurgias posteriores ainda não entram no estoque. A existência de nota de cobrança não substitui a data de faturamento.

## Situação das cirurgias em 09/10

| Situação | Cirurgias pendentes | Saldo pendente |
|---|---:|---:|
| Totalmente pendente | 833 | R$ 13.425.335,84 |
| Parcialmente faturada | 190 | R$ 1.854.598,34 |
| Sem filtro de situação | 1.023 | **R$ 15.279.934,18** |

O filtro de situação é aplicado depois da classificação por Empresa + Agendamento, no recorte de dimensões selecionado. O saldo da parcialmente faturada inclui apenas suas parcelas pendentes, sem os valores já faturados. Não há dupla contagem financeira. As cirurgias totalmente faturadas contribuem com zero para o saldo pendente.

A diferença de R$ 1.017.965,03 entre “Totalmente pendente” e o Excel também fica explicada: **R$ 3.357.677,42 − R$ 485.114,05 − R$ 1.854.598,34 = R$ 1.017.965,03**.

O filtro Ano = 2026 define os fechamentos e o fluxo do ano. O estoque histórico preserva pendências de cirurgias anteriores; não equivale a filtrar a coluna C exclusivamente por cirurgias de 2026. Os testes incluem esse carregamento de saldos anteriores.

## Posições recalculadas no mesmo arquivo

| Referência simulada | Sem filtro de situação | Totalmente pendente | Parcialmente faturada |
|---|---:|---:|---:|
| 30/09/2026 | R$ 14.172.342,77 | R$ 12.380.944,43 | R$ 1.791.398,34 |
| 08/10/2026 | R$ 15.357.458,86 | R$ 13.567.880,52 | R$ 1.789.578,34 |
| 09/10/2026 | R$ 15.279.934,18 | R$ 13.425.335,84 | R$ 1.854.598,34 |
| 15/10/2026 | R$ 12.408.041,17 | R$ 10.570.806,87 | R$ 1.837.234,30 |
| 16/10/2026 | **R$ 12.407.370,81** | R$ 10.511.120,97 | R$ 1.896.249,84 |

Em 15/10, ainda há três linhas faturadas em 16/10, totalizando R$ 670,36; por isso o saldo de 15/10 não equivale ao filtro de L vazia do arquivo atual. A referência é um parâmetro explícito da auditoria; nenhuma data no dashboard ou no Supabase foi alterada.

## KPIs, faixas e histórico

A apuração independente verificou, nas cinco referências: pendência, cirurgias pendentes, média simples do KPI, cirurgias parcialmente/totalmente faturadas, fluxo e quantidade de cirurgias faturadas no ano até a referência, saldos/contagens/médias das cinco faixas, fechamentos mensais e trimestrais, e rankings das oito dimensões, incluindo valores, contagens distintas, percentuais e médias ponderadas. As projeções administrativa e pública locais produziram as mesmas visões financeiras, exceto pela proteção intencional das notas.

| Faixa | Saldo em 09/10 | Cirurgias |
|---|---:|---:|
| 0–45 dias | R$ 8.510.225,26 | 549 |
| 46–90 dias | R$ 3.396.648,55 | 169 |
| 91–135 dias | R$ 1.062.195,92 | 68 |
| 136–180 dias | R$ 898.211,30 | 58 |
| Acima de 180 dias | R$ 1.412.653,15 | 179 |
| Total | **R$ 15.279.934,18** | **1.023** |

Média de retenção em 09/10: 117,784946 dias; fluxo faturado de 2026 até a referência: R$ 83.202.602,24 em 4.938 cirurgias. Em 16/10: 912 cirurgias pendentes, média de 130,167763 dias, fluxo de R$ 86.601.572,16 em 5.115 cirurgias. Esses números são posições distintas, não resultados antes/depois de uma mudança de fórmula.

## Procedimento reproduzível, sem gravar no banco

Requisitos: dependências Node do projeto, Python 3 e `openpyxl==3.1.5` (`python3 -m pip install -r scripts/requirements-audit.txt`, respeitando o ambiente Python utilizado).

```sh
node --import tsx scripts/reconcile-financial.ts \
  '/caminho/Base de dados retenção de faturamento geral.xlsx' \
  2026-10-16 .local/financial-audit/report \
  2026-09-30 2026-10-08 2026-10-09 2026-10-15
```

O TypeScript usa o mesmo leitor/validador/motor da aplicação, sem chamar importação, autenticação, store ou Supabase. Python lê o Excel de modo independente com Decimal, compara conjuntos, valores e datas linha a linha e calcula a ponte de cada referência. Falhas nas verificações encerram o processo com erro. A saída usa diretório privado (0700) e arquivos 0600.

São produzidos `engine.json` (evidência local), `reconciliation.json` (totais conciliados) e `row-reconciliation.csv` (uma linha por registro e referência, com Empresa, Agendamento, chave, datas, valor, situação, inclusão/exclusão e motivos). Não se exportam pacientes nem o conteúdo de notas. Não comitar a planilha ou as evidências detalhadas; o JSON em docs contém somente agregados e hash da origem.

Para comparar um snapshot público obtido por acesso autorizado, acrescente `--shared /caminho/snapshot.json`. A comparação verifica referência, conjuntos de linhas, datas, valores e identificadores financeiros; um snapshot desatualizado não é substituído nem republicado automaticamente. O teste fictício desse cenário detecta diferenças de versão financeira e corte. Não se compara o UUID aleatório gerado pela revalidação do Excel como se fosse o ID da versão publicada.

## Validação e limites

A suíte inclui testes fictícios de BR/ISO/Excel/UTC, centavos, faturamento antes/depois da referência, parcial, pagamento integral, repetição legítima, empresas diferentes, estoque de 2025 em 2026, referência posterior à última cirurgia, quarentena, status combinados com ano, ausência de filtro e snapshot desatualizado. Um teste altera propositalmente um centavo na evidência do motor e exige que o reconciliador independente rejeite a divergência. O teste privado compara o relatório completo com os agregados conferidos deste arquivo.

O código financeiro, componentes, layout, permissões, upload, store e migrations permaneceram inalterados. Foram adicionados somente scripts de auditoria, testes e documentação. Não houve merge, deploy, importação ou gravação na base oficial.

O commit implantado foi identificado pelo GitHub como `63690e0` (merge do PR #7), mas a API pública do Vercel continuou inacessível pelo proxy deste ambiente (`CONNECT` 403). Portanto, não foi possível conferir diretamente o ID, conteúdo, cache ou corte do payload publicado, nem o payload administrativo real. A equivalência local e a reprodução exata dos dois valores não comprovam que a versão de produção já foi atualizada com este arquivo. A planilha atual possui 17.683 registros; as capturas anteriores mostravam 12.325. Não são declaradas versões equivalentes sem essa conferência.

### Resultados da execução

- `npm run build`: aprovado, incluindo TypeScript; somente o aviso existente de tamanho dos chunks.
- `OFFICIAL_RECONCILIATION_PATH='/caminho/planilha-geral.xlsx' npm test`: **96 aprovados e 3 pulados**. Os três pulados são testes condicionais da base antiga de 3.149 registros, indisponível neste ambiente; o novo teste da planilha geral de 17.683 registros foi executado e aprovado.
- O processo independente comparou 17.185 linhas válidas sem diferenças de valor ou data e conciliou as cinco referências sem resíduos.
- Os testes existentes de exportação Excel/PDF e autorização passaram. A estrutura visual e os geradores de exportação não receberam alterações; os testes de navegador dependentes do dataset local antigo não foram repetidos nesta auditoria.

### Arquivos adicionados

- `scripts/reconcile-financial.ts`: execução explícita do motor sobre o Excel, evidências locais e chamada da apuração independente.
- `scripts/reconcile_financial.py`: leitura independente Decimal, validação, ponte por linha, KPIs/histórico/rankings e comparação opcional de snapshot.
- `scripts/requirements-audit.txt`: dependência Python da auditoria.
- `tests/financial-reconciliation.test.ts`: cenários sintéticos, rejeição de valor alterado, snapshot antigo e regressão com a planilha privada.
- `docs/conciliacao-financeira-geral.json`: agregados conferidos e hash do arquivo, sem identificadores pessoais.
- Este relatório.
