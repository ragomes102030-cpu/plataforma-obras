# Aurora Teste — Incidente de versionamento da proposta EAP

**Obra:** OB-PUPOCN — AURORA TESTE  
**Data:** 2026-10-03  
**Tipo:** falha de reconciliação de proposta/versionamento  
**Ambiente:** teste controlado; não representa obra real.

## Sintoma

A tela apresentava 31 erros informando que a proposta tentava atualizar nós que não existiam na EAP atual, com IDs como 2561, 2562, 2563, 2574 e outros.

## Evidência

Os IDs eram identificadores internos de uma versão anterior da EAP. A versão atual possuía a estrutura correspondente, mas com IDs internos diferentes.

Portanto, o bloqueio não provava que a EAP atual estava estruturalmente inválida. O problema estava na referência usada pela proposta.

## Causa

A proposta carregava `nodeId` de uma versão anterior. A validação tratava a ausência desse ID na versão atual como erro imediato, sem tentar uma reconciliação segura pelo código WBS/EAP.

## Correção

A validação passou a usar a seguinte ordem:

1. `nodeId` existente na versão atual;
2. se o ID estiver obsoleto, código WBS/EAP correspondente e único;
3. sem correspondência segura, bloqueio permanece.

Também foi implementado o vínculo `baseVersionId` para que revisões de versões superseded não sejam apresentadas como revisão atual.

## Regra de engenharia para o Arquimedes

**IDs internos são específicos da versão. Códigos WBS/EAP são a referência estável de reconciliação, desde que a correspondência seja única e verificável.**

Reconciliação não autoriza aplicação.

## Proteções

- `server/construction/eap-validator.ts`
- `server/construction/eap-validator.test.ts`
- `server/routers.ts` com `baseVersionId`
- aprendizado registrado no Cérebro Mestre e no Bootstrap do Arquimedes.

## Estado

A correção de código foi implementada e a regressão foi adicionada. O deploy funcional e a confirmação visual na Aurora devem ser tratados separadamente.

## Aprendizado

Este caso entra na memória de engenharia como aprendizado global de propostas EAP versionadas: nunca assumir que um `nodeId` é estável entre versões.
