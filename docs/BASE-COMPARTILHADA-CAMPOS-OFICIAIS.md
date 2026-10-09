# Campos oficiais na consulta compartilhada

## Diagnóstico antes da alteração

O fluxo Excel → `parseFile` → `validateBase` mantém B (Agendamento), I (Médico) e K (Representante Principal). `keyOf` consolida Empresa + Agendamento. A coluna J (Paciente) não integra os registros validados e é removida antes do envio pelo navegador. `saveDataset` envia o Dataset original à RPC transacional `replace_retention_dataset`, que grava `retention_current.payload`. A consulta administrativa retorna esse payload com a auditoria normalizada.

A substituição ocorre exclusivamente em `server/public-data.ts`, depois da leitura de `retention_current` e antes da serialização de `/api/public/dataset`. A proteção anterior era intencional: HMAC dos três campos, da chave de cirurgia e das notas. Não é corrupção no Supabase nem problema visual. Não há outro snapshot público persistido a atualizar. Não se deve recuperar nomes por hashes, reimportar a base nem executar migrações para esta correção.

O diagnóstico foi verificado no código, na base local criptografada e com Supabase HTTP simulado. O payload real de produção não foi consultado: este ambiente não tem credenciais do Supabase/Vercel. O relato de que a tela administrativa publicada apresenta os originais é consistente com esse fluxo.

## Política de publicação

`RETENTION_PUBLIC_IDENTIFIERS=true`, configurada exclusivamente no servidor, permite publicar os valores originais de B/I/K na resposta pública e o agendamento original da auditoria, inclusive para registros em quarentena. Nenhuma associação fixa ou tentativa de reversão de hash é usada. Strings com zeros à esquerda são preservadas; zeros já perdidos na origem não são inventados.

Ausência da variável, `false` ou qualquer outro valor mantém a proteção anterior. A ativação exige confirmação da política da Biosaúde para divulgar os três campos sem login, conforme seção 9 do pedido. Não é um controle configurável pelo navegador, query string ou usuário público.

Notas de cobrança permanecem pseudonimizadas; pacientes e propriedades extras de registros/payload não são publicados. As credenciais ficam no servidor. Rotas administrativas, autenticação, autorização, armazenamento e RPC não mudam. A interface, filtros, exportação, rankings e fórmulas não foram modificados.

## Atualização controlada

1. Confirmar a autorização de divulgação dos três campos.
2. Revisar a alteração e os testes; confirmar B/I/K pelo acesso administrativo existente.
3. Configurar `RETENTION_PUBLIC_IDENTIFIERS=true` no ambiente Vercel que deverá divulgar os campos, usando as ferramentas da conta autorizada. Não colocar credenciais em código ou no navegador.
4. Gerar deployment da revisão testada e conferir o Preview contra a base administrativa. Aplicar os controles de proteção de Preview da conta.
5. Após validação, promover a revisão validada para produção pelo mecanismo de deployment do Vercel, mantendo o deployment anterior para rollback. Não substituir registros do Supabase: a correção é aplicada em cada leitura.
6. Abrir a URL pública sem sessão, verificar `/api/public/dataset`, tabela, detalhes, filtros, auditoria, pesquisa e Excel. Recarregar e reabrir o navegador. `Cache-Control: no-store` já existe na API e no Vercel.
7. Se falhar, restaurar o deployment anterior e sua configuração. Para voltar a ocultar os três campos, desativar a variável e gerar um novo deployment.

Nenhuma publicação de produção ou gravação na base oficial foi realizada por este trabalho até esta etapa. A conferência publicada é um requisito pendente, não um resultado presumido de testes locais.

## Arquivos

- `server/public-data.ts`: projeção seletiva dos campos autorizados e lista explícita de propriedades públicas.
- `server/app.ts`: política do servidor na rota pública.
- `.env.example`: opção documentada, desativada por padrão.
- `tests/public-data.test.ts`: política nos dois modos, zeros à esquerda, empresas distintas, dados financeiros e proteção de extras/pacientes/notas.
- `tests/official-identifiers.test.ts`: amostra de 40 registros da planilha disponível comparada aos registros administrativos locais e à projeção pública autorizada.
- `tests/admin-integration.test.ts`: consulta via HTTP/Supabase simulado nos dois modos, leituras repetidas e nenhuma gravação ao alterar a projeção.
- `tests/e2e/audit.spec.ts`: consulta sem login, filtros originais, expansão, auditoria, Excel, recarregamento e reabertura, controles administrativos bloqueados e responsividade.
- Este relatório e `README.md`: diagnóstico, configuração e limites de implantação.

A planilha disponível neste ambiente tem 3.149 registros, enquanto as imagens mostram 12.325. A amostra real local não substitui a comparação da base publicada de 12.325 registros.

## Validação desta revisão

- `npm run build`: aprovado, incluindo TypeScript do frontend e NodeNext do backend; somente o aviso existente sobre tamanho dos chunks.
- `VALIDATE_OFFICIAL_BASE=1 OFFICIAL_BASE_PATH=… npm test`: 95 testes aprovados, incluindo amostra real de 40 registros, reconciliação financeira, autorização e runtime ESM. Sem a planilha privada, os três testes condicionais são pulados.
- `npm run test:e2e`: 17 testes aprovados, com dados fictícios/interceptações para a consulta pública autorizada, exportação original, recarregamento/reabertura e controles bloqueados. Responsividade verificada em 1920, 1024 e 390 px.
- O frontend de produção mantém os mesmos artefatos e não recebeu alteração; fórmulas, estilos, gráficos, componentes e armazenamento também não mudaram. Não há chave administrativa ou variável de política no bundle do frontend.
- As comparações financeiras incluem a visão integral (cirurgias, totais, faturamento, pendência, dias, faixas, histórico e rankings), substituindo somente as notas pseudonimizadas por suas originais na comparação de teste. Isso evita confundir a proteção intencional da nota com mudança financeira.
- **Pendente:** autorização de divulgação, configuração da variável em Vercel, implantação e comparação diretamente com a base publicada de 12.325 registros. Não houve merge ou deployment de produção desta revisão.
