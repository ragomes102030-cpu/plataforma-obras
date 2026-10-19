#!/usr/bin/env node
/**
 * Guarda de versao do build.
 *
 * O build roda em Nixpacks, longe da nossa maquina. Quando o Node vem errado o
 * erro aparece la na frente, disfarcado: o Vite 7 reclama de "Node.js 20.19+ or
 * 22.12+" e o @tailwindcss/oxide estoura com "Cannot find native binding" (que
 * nao tem nada a ver com o problema real). Perder 20 minutos de deploy para ler
 * esse erro e caro; por isso o primeiro comando do build e este, que falha na
 * primeira linha com a versao que realmente chegou.
 *
 * Uso: node scripts/check-node.mjs  (primeiro comando de [phases.install] no
 * nixpacks.toml). Sai com codigo 1 se o Node for antigo demais.
 */

import { pathToFileURL } from "node:url";

/** Menor major aceito: Vite 7 exige 20.19+/22.12+ e o resto do stack assume 22. */
export const MIN_NODE = 22;

/**
 * @param {string} [versao] versao a testar (padrao: a do processo atual)
 * @param {number} [minimo] major minimo
 * @returns {boolean}
 */
export function versaoSuficiente(versao = process.versions.node, minimo = MIN_NODE) {
  const major = Number(String(versao).replace(/^v/, "").split(".")[0]);
  return Number.isFinite(major) && major >= minimo;
}

function executadoDiretamente() {
  const entrada = process.argv[1];
  if (!entrada) return false;
  try {
    return import.meta.url === pathToFileURL(entrada).href;
  } catch {
    return false;
  }
}

if (executadoDiretamente()) {
  if (!versaoSuficiente()) {
    console.error(
      `[build] Node ${process.version} e antigo demais. Este projeto exige Node ${MIN_NODE}+ ` +
        "(Vite 7 + @tailwindcss/oxide). Corrija o nixpacks.toml (nixPkgs = [\"nodejs_22\"]) " +
        'ou o `engines.node` do package.json e rode de novo.'
    );
    process.exit(1);
  }
  console.log(`[build] Node ${process.version} OK`);
}
