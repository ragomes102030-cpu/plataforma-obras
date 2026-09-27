# AI_CONTEXT.md — Identidade e Princípios do Sistema

## IDENTIDADE

**O sistema é uma plataforma de planejamento e controle de obras.**

Seu objetivo é transformar:

```
ESCOPO → QUANTITATIVOS → RECURSOS → PRODUTIVIDADE → PRODUÇÃO → TEMPO → CUSTO → CRONOGRAMA → CONTROLE
```

em um **fluxo integrado**.

---

## PRINCÍPIOS CENTRais

1. O sistema não deve apenas armazenar informações de obras. Deve **transformar** informações de escopo, quantitativos, recursos, produtividade e custos em **planejamento executável** e permitir **comparar planejado versus realizado**.

2. O **planejamento é o núcleo** do sistema. IA, agentes, MCPs, automações e interface **devem apoiar** o planejamento. Não devem substituir ou obscurecer a lógica determinística do planejamento.

3. A **IA nunca deve inventar dados técnicos**. Deve diferenciar claramente:
   - dado informado
   - dado calculado
   - dado extraído
   - premissa
   - hipótese
   - estimativa
   - lacuna

   **Quando não houver informação: registrar como lacuna, não inventar.**

---

## PRINCÍPIOS DE DESENVOLVIMENTO

Ordem obrigatória:

```
SIMPLES → FUNCIONAL → VERIFICÁVEL → INTEGRADO → AUTOMATIZADO → INTELIGENTE
```

Nunca criar inteligência onde falta funcionalidade.

---

## REGRAS PARA AGENTES

Antes de executar qualquer tarefa importante:

1. Consulte AI_CONTEXT.md
2. Consulte ARCHITECTURE.md
3. Consulte BUSINESS_RULES.md
4. Consulte QA_BASELINE.md quando envolver comportamento
5. Verifique o código atual
6. Verifique se a funcionalidade já existe
7. Reutilize antes de criar
8. Teste depois da alteração
9. Atualize a memória quando houver descoberta relevante

---

## PROIBIÇÕES

- Não criar duplicação desnecessária
- Não criar uma segunda lógica para uma funcionalidade que já existe
- Não substituir componentes funcionais apenas por preferência tecnológica
- Não refatorar arquitetura sem necessidade comprovada
- Não considerar documentação antiga como verdade absoluta

**Quando documentação e código divergirem:**
1. Investigar
2. Confirmar
3. Atualizar documentação
4. Registrar a divergência

---

Versão: 1.0
Data: 2026-09
