# Validação — base oficial, corte em 30/09/2026

Arquivo autorizado: **Base de dados retenção de faturamento.xlsx**. O usuário confirmou que este é o arquivo oficial atual, apesar da diferença de nome em relação ao texto inicial. Uma aba, 14 colunas A–N, 3.149 registros.

## Auditoria da origem

| Indicador | Resultado |
|---|---:|
| Registros financeiros | 3.149 |
| Agendamentos distintos por empresa | 3.008 |
| Agendamentos com múltiplas linhas | 131 |
| Empresas | 1 |
| Colisões de agendamento entre empresas | 0 |
| Duplicatas exatas | 0 |
| Total financeiro original | R$ 55.599.369,49 |
| Registros válidos | 3.137 |
| Valor válido | R$ 55.342.089,49 |
| Registros em quarentena | 12 |
| Valor em quarentena | R$ 257.280,00 |
| Datas inválidas/ausentes | 0 |
| Faturamentos anteriores à cirurgia | 12 |
| Notas preenchidas sem data | 70 |
| Registros com algum aviso/erro | 136 |

Os 70 registros sem data possuem **0** no campo Nota de Cobrança. O valor foi preservado literalmente e sinalizado para conferência; ele não foi interpretado como prova de faturamento. Há 16 agendamentos com tipos divergentes, 13 com clientes divergentes e 3 com representantes divergentes. Não há datas de cirurgia divergentes dentro do mesmo agendamento. As divergências de dimensões geram avisos, sem excluir valores válidos. Algumas ocorrências se sobrepõem; contagens de ocorrências não equivalem a registros distintos.

A cronologia inválida foi colocada em quarentena explicitamente, sem corrigir datas ou ajustar valores. Todos os registros financeiros legítimos foram preservados. Os 12 agendamentos exclusivamente em quarentena não são classificados nos indicadores validados.

## Posição validada em setembro

| Indicador | Resultado |
|---|---:|
| Saldo pendente | R$ 8.489.909,79 |
| Cirurgias pendentes, incluindo parciais | 504 |
| Totalmente pendentes | 451 |
| Parcialmente faturadas | 53 |
| Totalmente faturadas, registros válidos | 2.492 |
| Faturado válido até setembro | R$ 46.852.179,70 |
| Retenção média das pendentes | 61,91 dias |

O valor faturado acima é validado e exclui a quarentena. O total original inclui a quarentena e é apresentado separadamente. Existe faturamento posterior até 07/10/2026; essas datas foram preservadas, mas não alteram o fechamento de setembro nem são exibidas como fluxo disponível de outubro.

| Faixa | Saldo pendente | Cirurgias |
|---|---:|---:|
| 0–45 dias | R$ 4.599.025,93 | 255 |
| 46–90 dias | R$ 2.349.283,11 | 131 |
| 91–135 dias | R$ 832.500,85 | 52 |
| 136–180 dias | R$ 521.653,90 | 41 |
| >180 dias | R$ 187.446,00 | 25 |
| Total | R$ 8.489.909,79 | 504 |

Q1: R$ 6.673.830,12, 348 cirurgias pendentes. Q2: R$ 8.127.399,40, 411 cirurgias pendentes. Q3: R$ 8.489.909,79, 504 cirurgias pendentes. Q4 não é um fechamento disponível nesta base.

## Evidências de execução

**51 testes automatizados e 4 testes de navegador aprovados.** O comando padrão `npm test` executa 50 testes e deixa o teste específico da planilha desabilitado; com `VALIDATE_OFFICIAL_BASE=1`, todos os 51 foram executados e aprovados. Auditoria das dependências de produção: zero vulnerabilidades reportadas após atualização de `uuid` para uma versão corrigida compatível com o uso de `v4` do ExcelJS.

- Testes do motor: consolidação, faturamento parcial, cronologia inválida, nota sem data, limites 0/45/46/90/91/135/136/180/181, moeda em centavos, dimensões divergentes, filtros combinados e posições históricas.
- Exemplo de cirurgia de 20/02/2026 faturada em 10/10/2026: todos os meses de fevereiro a setembro e as faixas Q1/Q2/Q3 foram validados.
- Teste da planilha oficial compara os nove fechamentos, saldos e quantidades em cada faixa com cálculo independente Python/openpyxl/Decimal. Resultados agregados em `validacao-independente.json`; nenhum dado de paciente aparece nas fixtures.
- API: dados e exportação sem login negados; origem externa bloqueada no modo local; sessão HttpOnly; importação repetida rejeitada; modo local proibido na Vercel.
- Perfis de produção: provedor de identidade simulado valida consulta sem exportação/importação, analista com exportação sem importação e token inválido negado. Integração Supabase real ainda não executada.
- Relatórios: Excel reaberto para conferir os mesmos valores do motor; PDF válido e filtros respeitados.
- Navegador Chromium: viewport 1920×1080, filtros de quarter/faixa, expansão das linhas, downloads Excel/PDF, arquivo incompatível preservando a base, importação de Excel compatível, rejeição de repetição via CSV, viewport móvel 390×844 sem transbordamento da página e logout. Capturas ficam em `.local/screenshots`, fora do Git e do build.
- Build de produção com verificação TypeScript executado. O módulo Excel é carregado apenas durante importação; é um chunk grande, mas não participa do carregamento inicial.

## Limitações de produção

Não foram fornecidos nem reutilizados projetos, credenciais ou recursos do Supabase/Vercel comercial. A publicação não foi executada. Os passos de configuração independente, migration, usuários, perfis e verificação de produção estão no README. O funcionamento local e o build não substituem essa validação externa.

A responsabilidade pela correção dos 12 registros em quarentena permanece com a fonte dos dados. O dashboard torna visível a exclusão e mantém a linha de origem na auditoria. Os totais não incluem estimativas ou ajustes inventados.
