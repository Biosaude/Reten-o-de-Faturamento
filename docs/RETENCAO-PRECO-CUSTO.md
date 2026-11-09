# Retenção a Preço de Custo

Implementação em `feat/retencao-preco-custo`, para revisão. Nenhum deploy, merge, migration ou acesso ao banco de produção foi realizado.

## Regra e premissas

O campo **Custo médio total** é o custo total dos materiais **da linha**, conforme a estrutura informada. Não é custo unitário e não deve ser multiplicado por quantidade ou pelo número de linhas da cirurgia.

Cada registro financeiro tem um valor e uma única data de faturamento. Não há saldo parcialmente faturado dentro de uma linha. A cirurgia parcialmente faturada agrupa linhas faturadas e linhas pendentes. O indicador soma `costCents` uma vez por linha elegível cuja cirurgia já ocorreu e cujo faturamento está ausente ou é posterior à referência. Linhas faturadas até a referência não contribuem. Não há rateio proporcional nem apresentação de estimativa como custo comprovado: o indicador reflete o custo **informado pela origem** das linhas pendentes.

Exemplo: uma cirurgia tem uma linha pendente com valor R$ 100 e custo R$ 30, e outra faturada com valor R$ 200 e custo R$ 90. A retenção é R$ 100 e o custo retido é R$ 30, sem ratear R$ 120 sobre o valor agregado da cirurgia.

Custos idênticos em linhas diferentes não são eliminados: linhas legítimas e possíveis duplicatas seguem a política existente de preservação e conferência. Uma linha nunca é somada novamente por pertencer a uma cirurgia com vários faturamentos. Se uma futura fonte passar a repetir o custo integral da cirurgia em cada linha, ela terá outra semântica e precisará ser revisada antes de publicação; esta implementação não deduz isso por igualdade de valores.

Custos são convertidos para centavos inteiros com o arredondamento decimal existente. Zero é válido. Ausência, valor inválido ou negativo gera advertência rastreável, `costCents: null` e exclusão da cobertura de custo, preservando o registro e o valor financeiro. Valores ou somas fora da precisão segura são rejeitados. Registros em quarentena continuam fora de todos os indicadores.

A cobertura informa **linhas pendentes com custo válido / linhas pendentes elegíveis**, após todos os filtros. Com cobertura incompleta, a soma conhecida aparece como **parcial**; não é extrapolada. Sem nenhum custo conhecido, aparece **Indisponível**. O percentual é custo retido / valor retido, somente com cobertura integral e denominador positivo. Sem linhas pendentes, uma versão com o campo de custo pode indicar zero; versões legadas sem custo continuam indisponíveis.

## Importação, auditoria e interface

- Aceita as 14 colunas legadas e as 15 novas. O modelo baixado passa a ter **N: Custo médio total** e **O: Valor total**.
- Identifica os campos pelo nome do cabeçalho, tolerando acentos/caixa/espaços e reordenação; rejeita cabeçalhos duplicados, desconhecidos ou ausentes. O paciente é removido pela posição encontrada no cabeçalho, antes da requisição e novamente na validação do servidor.
- O formato interno da auditoria mantém os 14 campos legados, inclusive `cells[13]` para Valor total. O custo original fica em `auditRecords[].cost`, com a quantidade original de colunas registrada. Não há deslocamento dos valores históricos da auditoria.
- Mantém os seis KPIs existentes e acrescenta uma faixa de custo no mesmo padrão visual, com percentual e cobertura. Inclui custo nas faixas, fechamentos trimestrais, tabela analítica e detalhamento das linhas.
- Excel do navegador e da API incluem custo por linha/agendamento e a aba **Retenção a custo**, com posições mensais, trimestrais e faixas. O resumo Excel/PDF informa cobertura e premissa. As posições das colunas financeiras antigas nos relatórios são preservadas.

## Banco, versões e segurança

**Não há migration nova.** `retention_current.payload` e `retention_audit_versions.payload` já armazenam JSONB completo. O campo opcional `records[].costCents` é preservado pela publicação transacional existente e pelo armazenamento local cifrado. As migrations existentes 001–003 continuam sendo o pré-requisito do histórico financeiro, sem reaplicação ou execução automática.

Versões anteriores não recebem custos inferidos. A leitura do histórico continua usando o payload da versão selecionada. Publicar novamente alterando somente o custo produz uma nova versão; publicar conteúdo idêntico continua gerando conflito. Permissões, RLS, anonimização, proteção de notas/pacientes, controle de concorrência e rollback permanecem iguais.

## Conciliação do anexo

A planilha fornecida tem **18.031 registros**, dos quais **17.532 válidos** e **499 em quarentena**, aplicando as regras financeiras existentes. A planilha foi lida por dois caminhos independentes: ExcelJS/TypeScript e openpyxl/Python com Decimal. Foram comparados os conjuntos de linhas válidas, os centavos de valor/custo de cada linha válida e 18 cenários de referência, dimensão, situação e faixa. Houve igualdade em todos os cenários. Uma projeção legada usando Valor total também preservou saldos, quantidades, médias, faixas, fluxos, rankings e movimentações.

As datas abaixo são **referências de teste**, sem confirmação de uma nova data oficial de publicação e sem importação do anexo no armazenamento compartilhado:

| Referência | Valor retido | Custo retido | Cobertura | Custo / retenção |
| --- | ---: | ---: | ---: | ---: |
| 30/09/2026 | R$ 14.408.345,70 | R$ 5.707.452,18 | 953 / 953 | 39,61% |
| 16/10/2026 | R$ 14.766.352,34 | R$ 5.818.293,89 | 929 / 929 | 39,40% |
| 09/11/2026 | R$ 13.549.464,41 | R$ 5.162.312,18 | 821 / 821 | 38,10% |

O payload de validação do anexo, já sem pacientes, tem **3.607.344 bytes** e foi aceito pelo endpoint administrativo local `/api/validate` com HTTP 200 e 17.532 registros válidos. O limite de requisição de 4 MB não precisou ser alterado. A planilha original e os resultados detalhados privados não foram adicionados ao Git.

Reprodução, com Python/openpyxl 3.1.5 (já especificado em `scripts/requirements-audit.txt`):

```sh
npx tsx scripts/reconcile-cost.ts /caminho/privado/planilha.xlsx 2026-11-09
```

Esse comando não publica dados nem acessa Supabase. Gera artefatos privados ignorados em `.local/cost-validation` e imprime apenas agregados. A conciliação financeira legada continua disponível pelo script anterior para planilhas de 14 colunas.

## Validação e homologação

- `npm test`: **148 aprovados, 5 pulados**; inclui os casos de custo, importação Excel/CSV reordenada, custos inválidos/zero/ausentes, quarentena, filtros, relatórios, armazenamento, reinicialização da API e proteção do servidor E2E contra diretório compartilhado/credenciais Supabase.
- `npm run build`: aprovado, incluindo checagem TypeScript do frontend, testes, scripts e função Vercel.
- Comando completo Playwright/Chromium: **27 aprovados, 2 pulados, 0 reprovados**, incluindo fluxos administrativos, publicação real em API local exclusiva por teste, persistência após recarga, filtros, versões financeiras com/sem custo, cenários do dashboard com fixture sintética explícita e layouts 1920/1024/390px. As duas regressões de dados oficiais privados não foram executadas; os resultados não representam aprovação de 29/29. Consulte a [homologação e o procedimento de rollback](HOMOLOGACAO-RETENCAO-CUSTO.md).
- PostgreSQL/PGlite: versões com custo preservadas, versão legada sem custo, rollback e RLS verificados no teste de publicação existente ampliado. Nenhuma conexão ao Supabase de produção.

A semântica de custo **por linha** segue a especificação recebida; nenhum rateio foi implementado. Cada publicação continua exigindo a revisão da extração e a confirmação administrativa normais. Os testes locais não certificam o conteúdo de uma futura extração nem a configuração do Supabase remoto. O relatório de homologação registra as verificações executadas e as dependências oficiais opcionais.

## Arquivos da implementação

| Área | Arquivos |
| --- | --- |
| Importação e cálculo | `src/lib/domain.ts`, `src/lib/import.ts`, `src/lib/retention-cost.ts` |
| Interface | `src/App.tsx`, `src/components/CostIndicator.tsx`, `src/styles.css` |
| API e leitura pública | `server/app.ts`, `server/public-data.ts` |
| Auditoria | `src/lib/audit-source.ts`, `src/lib/audit.ts`, `src/lib/audit-export.ts`, `src/components/AuditPanel.tsx` |
| Relatórios e modelo | `src/lib/report-data.ts`, `src/lib/downloads.ts`, `server/reports.ts` |
| Conciliação independente | `scripts/reconcile-cost.ts`, `scripts/reconcile_cost.py` |
| Testes | `tests/retention-cost.test.ts`, `tests/retention-cost-api.test.ts`, `tests/weekly-migration.test.ts`, `tests/e2e/cost.spec.ts`, `tests/e2e/dashboard.spec.ts` |
| Documentação | `README.md`, `docs/RETENCAO-PRECO-CUSTO.md` |
