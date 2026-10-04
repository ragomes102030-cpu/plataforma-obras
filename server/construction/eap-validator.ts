        id: -(index + 1),
        projectId: currentNodes[0]?.projectId ?? 0,
        parentId: parent?.id ?? null,
        code,
        name: item.name,
        level: code.split(".").length,
        nodeType: item.nodeType,
        unit: item.unit ?? null,
        plannedQuantity: item.plannedQuantity ?? null,
        externalId: null,
        externalUid: null,
        sortOrder: currentNodes.length + index,
      });
      continue;
    }

    if (item.operation === "update") {
      // IDs são internos à versão e podem ficar obsoletos quando uma
      // versão aprovada é clonada. O código EAP é a referência estável para
      // reconciliar uma proposta antiga com a versão atual, desde que o ID
      // recebido não exista mais. Se o ID ainda existe, ele continua sendo
      // a autoridade e não permitimos uma troca silenciosa por código.
      let resolvedNodeId =
        item.nodeId ??
        (item.code ? byCode.get(item.code.trim())?.id : undefined);

      if (item.nodeId != null && !byId.has(String(item.nodeId)) && item.code) {
        const rebound = byCode.get(item.code.trim());
        if (rebound) {
          resolvedNodeId = rebound.id;
          issues.push({
            code: "proposal_stale_node_id_rebound",
            severity: "warning",
            message:
              "A proposta trouxe um nodeId de uma versão anterior; o nó foi reconciliado com segurança pelo código EAP " +
              rebound.code +
              " na versão atual.",
            entityRef: String(item.nodeId),
          });
        }
      }

      if (!resolvedNodeId) {
        issues.push({
          code: "proposal_update_without_node",
          severity: "error",
          message:
            'A atualização "' +
            item.name +
            '" não informa nodeId nem referencia um código EAP existente para resolução segura.',
          entityRef: ref,
        });
        normalizedNodes.push({ ...item });
        continue;
      }

      const resolvedId = Number(resolvedNodeId);
      if (!Number.isFinite(resolvedId)) {
        issues.push({ code: "proposal_invalid_node_id", severity: "error", message: "nodeId inválido para atualização segura.", entityRef: String(resolvedNodeId) });
        normalizedNodes.push({ ...item });
        continue;
      }

      if (seenNodeIds.has(resolvedId)) {
        issues.push({
          code: "proposal_duplicate_node_operation",
          severity: "error",
          message: "O nó " + item.nodeId + " aparece mais de uma vez na proposta.",
          entityRef: String(resolvedNodeId),
        });
        normalizedNodes.push({ ...item });
        continue;
      }
      seenNodeIds.add(resolvedId);

      const current = byId.get(String(resolvedId));
      if (!current) {
        issues.push({
          code: "proposal_node_not_found",
          severity: "error",
          message:
            "A proposta tenta atualizar o nó " + item.nodeId +
            ", mas ele não existe na EAP atual.",
          entityRef: String(item.nodeId),
        });
        normalizedNodes.push({ ...item });
        continue;
      }

      const currentParentCode =
        current.parentId === null
          ? null
          : currentNodes.find(candidate => candidate.id === current.parentId)?.code ?? null;

      if (item.parentCode !== currentParentCode) {
        issues.push({
          code: "proposal_update_parent_mismatch",
          severity: "error",
          message:
            "A atualização de " + current.code +
            " informa um pai diferente do pai atual. Mudança de hierarquia deve ser tratada manualmente na EAP.",
          entityRef: String(item.nodeId),
        });
      }

      if (item.code && item.code !== current.code) {
        issues.push({
          code: "proposal_update_code_change",
          severity: "warning",
          message:
            "O código " + item.code + " não foi aceito para " + current.code +
            "; a numeração da EAP é controlada pelo sistema.",
          entityRef: String(item.nodeId),
        });
      }

      normalizedNodes.push({
        ...item,
        nodeId: resolvedId,
        code: current.code,
        parentCode: currentParentCode,
      });
      continue;
    }

    issues.push({
      code: "proposal_manual_hierarchy_change",
      severity: "error",
      message:
        'A operação "' + item.operation +
        '" não é aplicada automaticamente. Movimentações e exclusões devem ser feitas manualmente pelo engenheiro na EAP.',
      entityRef: ref,
    });
    normalizedNodes.push({ ...item });
  }

  const siblingNames = new Map<string, Set<string>>();
  for (const item of normalizedNodes.filter(node =>