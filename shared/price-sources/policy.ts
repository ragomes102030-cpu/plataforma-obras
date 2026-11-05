export type FonteCusto = "SEINFRA" | "SINAPI";

export function fontePreferencialParaLocalizacao(localizacao: string | null | undefined): FonteCusto {
  const texto = (localizacao ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(ce|ceara|fortaleza|caucaia|maracanau|sobral|juazeiro do norte)\b/.test(texto) ? "SEINFRA" : "SINAPI";
}

export function fontesPermitidasParaLocalizacao(localizacao: string | null | undefined): FonteCusto[] {
  const principal = fontePreferencialParaLocalizacao(localizacao);
  return principal === "SEINFRA" ? ["SEINFRA", "SINAPI"] : ["SINAPI", "SEINFRA"];
}
