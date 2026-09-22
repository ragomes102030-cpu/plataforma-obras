export const NAV_PATHS: Record<string, string> = {
  "Portfólio": "/",
  EAP: "/eap",
  "Orçamento": "/orcamento",
  Catálogo: "/catalogo",
  Cronogramas: "/cronogramas",
  "Linha de Balanço": "/lob",
  Produção: "/producao",
  Restrições: "/restricoes",
  Relatórios: "/relatorios",
  "Agente IA": "/agente",
  "Configurações": "/configuracoes",
};

export const PATH_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(NAV_PATHS).map(([label, path]) => [path, label])
);

export const MODULE_PATHS = Object.values(NAV_PATHS).filter(
  path => path !== "/"
);

export function labelFromPath(pathname: string): string {
  return PATH_LABELS[pathname] ?? "Portfólio";
}
