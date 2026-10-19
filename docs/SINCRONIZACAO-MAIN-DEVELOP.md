# Sincronização Main ↔ Develop

**Data do registro:** 2026-10-15 (atualizado em 19/10/2026)
**Autor:** Hermes Agent
**Status:** Concluído e automatizado

---

## Regra vigente (19/10/2026)

**`develop` é espelho de `main`. Não é branch de trabalho.**

- Todo push em `main` dispara `.github/workflows/sync-develop.yml`, que faz
  fast-forward da `develop` para o mesmo commit.
- Se a `develop` tiver commit que a `main` não tem, o workflow **falha** e lista
  os commits. Ele não usa `--force` em push: nunca apaga trabalho de ninguém.
- PR é sempre aberto contra `main`, a partir de uma branch de feature. A
  `develop` não recebe commit direto.
- Quando o workflow passa, `main` e `develop` estão no mesmo SHA — e é isso que
  o job confere antes de terminar.

O script está travado por teste (`server/branch-sync.test.ts`): quem tirar a
checagem de divergência ou trocar por `push --force` quebra a suíte.

---

## Problema (histórico)

A branch `main` estava bloqueada em commits de correção de Dockerfile (para DockHosting), enquanto a branch `develop` tinha 1258 commits à frente com todo o progresso do sistema Kanban, EPM, EAP, CPM, LOB, etc.

Plataformas de deploy estavam configuradas para puxar da `main`, resultando em deploys com código desatualizado. Hoje só o DockHosting constrói (ver `docs/STACK-ATUAL.md`).

## Solução aplicada em 15/10 (histórico)

1. **Reset forçado da branch `main`** para o último commit de `develop`:

   ```bash
   git checkout main
   git reset --hard origin/develop
   git push origin main --force-with-lease
   ```

2. **Resultado:** `main` foi para o commit `f4cf8d7` (último de `develop`), com todos os recursos implementados:
   - Motor CPM determinístico com persistência
   - Sistema de versões de plano (baseline/versionamento)
   - EAP visual com validação estrutural
   - Linha de Balanço e Gantt redesenhados
   - Curva S operacional
   - Catálogo SEINFRA-CE 028.1 (4437 serviços, 11828 insumos)
   - Orçamento com CUB/BDI declarados
   - Controle de produção (medição, avanço físico)
   - Motor de raciocínio estruturado do Arquimedes
   - Skills executáveis (TypeScript)
   - Contratos de saída Zod
   - Integração MCP opcional (EAP, Cronograma, Gantt/LOB)
   - Auditoria de coerência de engenharia
   - Fallback local como fonte primária

## Configurações de deploy

| Plataforma | Branch | Configuração | Observação |
|------------|--------|--------------|------------|
| DockHosting | `main` | `nixpacks.toml` | **Única** plataforma de produção: Nixpacks, Node 22, start `npm start` |
| ~~Render~~ | — | — | fora do projeto (out/2026); `render.yaml` não existe mais |
| ~~Vercel~~ | — | — | fora do projeto (out/2026); `vercel.json` não existe mais |

## Lições aprendidas

- **Nunca deixar `main` parada** enquanto `develop` avança significativamente.
- **Usar `--force-with-lease`** sempre que possível para evitar sobrescrever trabalho alheio.
- **Worktrees separados** para `main` e `develop` podem causar confusão — manter clareza.
- **Igualdade de branch não se mantém na disciplina:** ou é automática (workflow) ou volta a divergir. Foi o que motivou o `sync-develop.yml`.

## Próximos passos

1. ~~Monitorar deploy nas plataformas~~ — feito: `deploy-verify.yml` compara o commit do `/healthz` com o da `main` e falha em 45 min se não bater.
2. Considerar proteger `main` como protected branch (exigir PR + checks verdes).
3. ~~Implementar CI que falha merges com conflito entre branches~~ — feito: `sync-develop.yml`, que falha quando a `develop` tem commit fora da `main`.
