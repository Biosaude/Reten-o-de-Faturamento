# Ajustes de layout e ranking executivo

Alterações pontuais:

- `BaseManagement` foi movido intacto para depois da auditoria e de todas as seções analíticas, imediatamente antes do rodapé. Botões, campo de corte, metadados, mensagens, estados, hooks e processamento não foram alterados.
- O título principal é **Dashboard de Retenção de Faturamento · Biosaúde**, com Arial/Helvetica sans-serif, peso 700, cor grafite e tamanho responsivo. Logomarca e demais títulos/legendas permanecem intactos.
- O ranking apresenta Dimensão, Saldo Retido, **% Retenção**, Cirurgias e **Média Pond. (dias)**. Barras vermelhas, ordenação, numeração, seletores, altura das linhas e tamanho externo do card foram preservados. Em telas pequenas há rolagem horizontal dentro do ranking para manter todas as colunas disponíveis.

## Cálculos da apresentação

`src/lib/executive-ranking.ts` contém funções reutilizáveis específicas da apresentação do ranking:

- Participação = saldo pendente da categoria ÷ saldo total pendente do universo filtrado. O cálculo precede o corte Top N e tem duas casas decimais.
- Média ponderada = soma(dias × centavos pendentes) ÷ soma(centavos pendentes), com uma casa decimal na tela. Datas e filtros são os da posição selecionada; registros já faturados não contribuem para os pesos.
- Contagens e ordenação reutilizam o ranking existente, com cirurgias distintas por Empresa + Agendamento. Registros legítimos repetidos não são excluídos. Divisões com peso/saldo zero retornam zero.

O motor geral em `src/lib/domain.ts` não foi alterado. As médias dos demais KPIs/gráficos permanecem simples. As exportações existentes foram preservadas, conforme a restrição expressa do pedido; a nova apresentação é exclusiva do ranking na tela.

## Validação

- **77 testes automatizados aprovados** com `VALIDATE_OFFICIAL_BASE=1 npm test`. Incluem 23 casos específicos de ranking e a comparação independente da base oficial, além da regressão completa.
- Exemplo do pedido: 30 dias/R$ 10.000, 90 dias/R$ 30.000 e 180 dias/R$ 60.000 resultam em **138,0 dias** ponderados. O KPI simples do mesmo exemplo permanece em 100 dias.
- Todos os grupos somam 100% antes do arredondamento; Top N mantém o denominador completo. Foram validados faturamento parcial, múltiplos registros por cirurgia, faturamento posterior à posição histórica, uma/múltiplas empresas e UFs, cliente, mês, quarter e filtros combinados.
- Três clientes da planilha oficial, com referência em 30/09/2026, foram recalculados separadamente em Python/openpyxl/Decimal. Os resultados estão em `validacao-ranking-independente.json` e são comparados pelo teste `official-ranking.test.ts`.

| Cliente | Saldo pendente | Participação | Média ponderada |
|---|---:|---:|---:|
| UNIMED BELEM (SEDE ADMINISTRATIVA) | R$ 4.496.614,93 | 52,96% | 50,9 dias |
| BIOTECH | R$ 1.205.522,60 | 14,20% | 95,4 dias |
| IASB | R$ 629.534,60 | 7,42% | 59,0 dias |

- **9 testes Chromium aprovados**: gerenciamento no rodapé; título e peso da fonte; template oficial; seleção/validação/atualização; indicadores, filtros e exportações preservados; percentual com Top N; média na tela; responsividade 1920/1024/390 pixels sem sobreposição ou transbordamento da página.
- Verificação TypeScript e build de produção aprovados. Nenhuma dependência foi adicionada.
- Banco, Supabase, APIs, importação, persistência, tabelas analíticas, gráficos, faixas e identificação de cirurgias permanecem sem alterações. O Dashboard Comercial original não foi modificado.

## Arquivos modificados

Produção: `src/App.tsx`, `src/styles.css` e novo `src/lib/executive-ranking.ts`.

Verificação/documentação: `tests/e2e/dashboard.spec.ts`, novos `tests/executive-ranking.test.ts`, `tests/official-ranking.test.ts`, `docs/validacao-ranking-independente.json` e este relatório.
