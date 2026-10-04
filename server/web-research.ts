import { ENV } from "./_core/env";

export type WebResearchEvidence = {
  query: string;
  title: string;
  url: string;
  snippet: string;
  sourceType: "official" | "standard" | "reference" | "other";
};

function classifySource(url: string): WebResearchEvidence["sourceType"] {
  const lower = url.toLowerCase();
  if (lower.includes("pmi.org") || lower.includes("wbdg.org") || lower.includes("gov.") || lower.includes(".gov/")) {
    return lower.includes("pmi.org") ? "standard" : "official";
  }
  if (lower.includes("edu") || lower.includes("ac.uk") || lower.includes("sciencedirect.com")) {
    return "reference";
  }
  return "other";
}

export function parseSearchResponse(raw: string, query: string): WebResearchEvidence[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const candidates: unknown[] =
    parsed && typeof parsed === "object"
      ? Array.isArray((parsed as Record<string, unknown>).data)
        ? (parsed as Record<string, unknown>).data
        : Array.isArray(parsed)
          ? parsed
          : []
      : [];

  return candidates
    .map(item => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url.trim() : "";
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const snippet =
        typeof record.content === "string"
          ? record.content.trim()
          : typeof record.description === "string"
            ? record.description.trim()
            : "";
      if (!url || !title) return null;
      return {
        query,
        title: title.slice(0, 240),
        url: url.slice(0, 1200),
        snippet: snippet.slice(0, 1200),
        sourceType: classifySource(url),
      } satisfies WebResearchEvidence;
    })
    .filter((item): item is WebResearchEvidence => Boolean(item));
}

export async function searchWebEvidence(
  queries: string[],
  maxResults = 8
): Promise<WebResearchEvidence[]> {
  if (!ENV.webResearchApiKey) {
    return [];
  }

  const uniqueQueries = Array.from(
    new Set(
      queries
        .map(query => query.trim())
        .filter(Boolean)
    )
  ).slice(0, 4);

  const results = await Promise.all(
    uniqueQueries.map(async query => {
      const url =
        ENV.webResearchBaseUrl.replace(/\/$/, "") +
        "/?q=" +
        encodeURIComponent(query);

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        Math.max(5_000, ENV.webResearchTimeoutMs)
      );

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer " + ENV.webResearchApiKey,
          },
          signal: controller.signal,
        });