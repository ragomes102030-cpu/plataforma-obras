# Recuperação de confiabilidade — Aurora EAP, TLS e baselines

## Escopo desta alteração

Este pacote recupera três invariantes sem alterar os dados da AURORA TESTE durante a revisão da PR.

### 1. GitHub Actions / Supabase (TLS seguro)

O fluxo `.github/workflows/aurora-eap-regression.yml` continua lendo `SUPABASE_DB_URL` e agora também pode ler o secret `SUPABASE_DB_CA_PEM`.

Para habilitar a regressão online:
1. No **Supabase**, abra o projeto `tromrvfijbtihuilvnuk` → **Database Settings** → **SSL Configuration** → **Download Certificate**. Utilize a CA apropriada ao endpoint selecionado no botão **Connect** (incluindo session pooler).
2. No **GitHub** `ragomes102030-cpu/plataforma-obras` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
3. Crie `SUPABASE_DB_CA_PEM` e cole o conteúdo completo do certificado PEM, incluindo linhas BEGIN/END CERTIFICATE. Isto é uma CA, não a senha de banco.
4. Confirme que o secret `SUPABASE_DB_URL` continua apontando para o endereço exato oferecido pelo Supabase. **Não copie a URL nem senha nos logs**.
5. Acione manualmente o workflow **Aurora EAP Regression** e confirme a mensagem `passed: true` com métricas estruturais.

O script usa `rejectUnauthorized: true`, valida o formato PEM, remove `sslmode` da URL para evitar sobrescrever a configuração segura do driver e informa erro de cadeia de certificados com uma instrução clara. **Se a CA ainda não estiver configurada, o teste pode continuar falhando; isso é preferível a aceitar conexão não autenticada.**

### 2. Uma baseline vigente por obra

`drizzle/0020_baseline_vigente_unica.sql`:
- Preserva todos os registros e os itens das baselines.
- Quando há várias `ativa` na mesma obra, mantém a mais recente por `createdAt`, desempate por `id`, como já era selecionada implicitamente pela consulta anterior; marca as demais `arquivada`.
- Cria índice único parcial em `projectId` para impedir duas ativas.
- Não ativa nada em projetos sem baseline vigente.

A API, após aprovar uma nova captura de baseline, arquiva a anterior e insere a nova na **mesma transação**. A comparação automática seleciona somente a ativa. Baselines arquivadas continuam disponíveis se o usuário as selecionar explicitamente.

**Atenção:** a migração altera status de baselines históricas também em outras obras que eventualmente contenham duplicatas; não altera os valores planejados, itens, IDs, datas ou as próprias baselines. Só aplicar na publicação aprovada e auditada.

### 3. Regressão que tolera edição legítima da EAP

O teste valida raiz, níveis, códigos, nomes, folhas, dicionário de escopo, duração e vínculo das dependências. As contagens exatas deixam de ser obrigatórias. Para congelar uma fotografia específica, use a variável opcional `AURORA_EAP_SNAPSHOT=69:53:15` no GitHub Actions.

O script não insere, atualiza nem exclui registros da AURORA TESTE.

## Critérios de aprovação

- CI: `pnpm check`, `pnpm test`, `pnpm build`, auditoria do esquema;
- PGlite confirma migração, preservação histórica, exclusividade e idempotência;
- Aurora EAP Regression real só poderá ficar verde depois da configuração de CA adequada;
- aprovação da política de migração para todas as obras e do uso da baseline mais recente quando havia múltiplas ativas;
- não fazer merge automático.
