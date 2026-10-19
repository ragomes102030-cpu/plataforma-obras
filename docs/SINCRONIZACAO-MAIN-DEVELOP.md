# Sincronização Main ↔ Develop

**Data:** 2026-10-15  
**Autor:** Hermes Agent  
**Status:** ✅ Concluído

---

## Problema

A branch `main` estava bloqueada em commits de correção de Dockerfile (para DockHosting), enquanto a branch `develop` tinha 1258 commits à frente com todo o progresso do sistema Kanban, EPM, EAP, CPM, LOB, etc.

Plataformas de deploy estavam configuradas para puxar da `main`, resultando em deploys com código desatualizado. Hoje só o DockHosting constrói (ver `docs/STACK-ATUAL.md`).

## Solução Aplicada

1. **Reset forçado da branch `main`** para o último commit de `develop`:
   ```
   git checkout main
   git reset --hard origin/develop
   git push origin main --force-with-lease
   ```

2. **Resultado:** `main` agora está no commit `f4cf8d7` (último de `develop`), com todos os recursos implementados:
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

## Configurações de Deploy

| Plataforma | Branch | Configuração | Observação |
|------------|--------|--------------|------------|
| DockHosting | `main` | `nixpacks.toml` | **Única** plataforma de produção: Nixpacks, Node 22, start `npm start` |
| ~~Render~~ | — | — | fora do projeto (out/2026); `render.yaml` não existe mais |
| ~~Vercel~~ | — | — | fora do projeto (out/2026); `vercel.json` não existe mais |

## Lições Aprendidas

- **Nunca deixar `main` parada** enquanto `develop` avança significativamente
- **Usar `--force-with-lease`** sempre que possível para evitar sobrescrever trabalho alheio
- **Worktrees separados** para `main` e `develop` podem causar confusão — manter clareza

## Próximos Passos

1. Monitorar deploy nas plataformas após a atualização
2. Considerar proteger `main` como protected branch
3. Implementar CI que faila merges com conflito entre branches
