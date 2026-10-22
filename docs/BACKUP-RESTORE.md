# Backup e restauração

> Estado em 22/10/2026. Este documento existe porque, até esta data, **não
> havia nenhum backup**: o projeto Supabase estava no plano gratuito, a API de
> backups respondia `GET /v1/projects/tromrvfijbtihuilvnuk/database/backups` →
> `[]` e o PITR estava desligado. Um `DELETE` errado apagaria dado de obra sem
> volta.

## 1. O que existe hoje

| Camada | O que é | Onde |
| --- | --- | --- |
| Diário, automático | dump lógico do schema `public`, cifrado, com restauração conferida | GitHub Actions → `Backup diario do banco` → artifact `backup-AAAA-MM-DD` (90 dias) |
| Manual, sob demanda | o mesmo dump, rodado à mão | `workflow_dispatch` do mesmo workflow |
| Cópia local | dump pontual feito na estação do dono | `C:\Users\Correta Engenharia\plataforma-obras-backups\` |

O dump cobre **schema + dados** do `public` (42 tabelas de domínio + a tabela de
controle de migrações). Não cobre o schema `auth` do Supabase (usuários do
Supabase Auth) nem configuração de projeto — o login do sistema é por GitHub,
então o que importa para reconstruir o negócio está no `public`.

## 2. Como o workflow diário funciona

`.github/workflows/backup-diario.yml`, todo dia às **03:00 de Brasília**
(06:00 UTC):

1. `pg_dump 17` (imagem `postgres:17-alpine`) com `--no-owner --no-acl`,
   formato custom, compressão 9 — conectando com o usuário **de leitura**
   (`arquimedes_app`), o mesmo do runtime. O dump não precisa de superusuário.
2. Confere o índice do dump: menos de 40 tabelas ou menos de 40 blocos de dados
   ⇒ falha. Isso pega o caso "dump saiu truncado mas com tamanho plausível".
3. **Restaura** o dump num Postgres 17 descartável e compara a contagem de
   linhas tabela por tabela com a origem. Divergência ⇒ falha.
4. Cifra com GPG simétrico (AES256) e publica como artifact por 90 dias.

O repositório é **público**. Por isso o artifact é sempre cifrado: ele contém
nome de cliente, valor de contrato e preço de insumo.

## 3. Secrets necessários

| Secret | Uso |
| --- | --- |
| `SUPABASE_DB_URL` | conexão de leitura do banco |
| `BACKUP_GPG_PASSPHRASE` | senha do backup. **Sem ela ninguém restaura.** |

A senha do backup também precisa estar no gerenciador de senhas do dono do
sistema. Ela não é recuperável: se as duas cópias (GitHub e gerenciador)
sumirem, os artifacts ficam inúteis.

## 4. Restaurar — procedimento

Pré-requisitos: `pg_restore` 17 e `gpg`. No Windows, os binários do PostgreSQL
17 ficam em `C:\Users\Correta Engenharia\tmp\pgbin\edb\pgsql\bin` (instalação
portátil usada no ensaio de 22/10/2026).

```bash
# 1. decifrar (pede a senha do backup)
gpg --decrypt --output backup.dump backup-2026-10-22.dump.gpg

# 2. criar um banco VAZIO num servidor separado (nunca no de produção)
createdb -h 127.0.0.1 -p 5439 -U postgres restaurado

# 3. restaurar
pg_restore --no-owner --no-acl -d "host=127.0.0.1 port=5439 user=postgres dbname=restaurado" backup.dump

# 4. conferir
psql -h 127.0.0.1 -p 5439 -U postgres -d restaurado -c '\dt' | wc -l   # 40+
```

O aviso `schema "public" already exists` na restauração é esperado e inofensivo:
todo banco novo já nasce com esse schema.

Para devolver o sistema ao ar a partir do dump, o destino é um banco Postgres
novo (Supabase ou outro), com `DATABASE_URL`/`SUPABASE_DB_URL` do Render
apontando para ele, e as migrações aplicadas com `pnpm db:migrate`. O dump já
traz a tabela `__drizzle_migrations` preenchida, então o sistema sabe em que
versão de esquema está.

## 5. Ensaio de 22/10/2026 (o primeiro que existiu)

Feito na estação do dono, com PostgreSQL 17.11 portátil (mesma versão do
servidor de produção):

| Medida | Valor |
| --- | --- |
| Banco de produção | 31 MB |
| Dump (custom, compressão 9) | 2,14 MB |
| Tempo de dump | 22 s |
| Tempo de restauração | 1,5 s |
| Tabelas comparadas | 43 |
| Contagem de linhas | idêntica nas 43 |
| Checksum md5 do conteúdo | idêntico nas 12 tabelas de amostra (com `TimeZone=UTC`) |

Conclusão: **RTO real abaixo de 1 minuto** para o volume atual. O gargalo não é
o banco, é provisionar o destino e reapontar o Render.

## 6. O que ainda falta

- **Backup automático nativo**: o plano Pro do Supabase (~US$25/mês) traz
  backup diário gerenciado + PITR (restauração a qualquer minuto dos últimos 7
  dias). O workflow cobre a perda total, mas não cobre "apagaram uma obra às
  14h32, quero voltar para 14h30". Enquanto o plano for gratuito, a janela de
  recuperação é a do último dump (até 24h).
- **Testar a restauração fora do CI** uma vez por trimestre, no caminho
  descrito acima, para não depender de um workflow que ninguém olhou.

## 7. Custos e limites

- GitHub Actions: o repositório é público, então os minutos são gratuitos. O
  job leva ~2 min.
- Artifacts: 90 dias de retenção, ~2 MB por dia. Sem custo.
- Limite prático: dumps acima de ~500 MB deixariam de caber confortavelmente no
  tempo do job; hoje são 2 MB.
