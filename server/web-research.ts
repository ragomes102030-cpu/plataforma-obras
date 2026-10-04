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

  const rawCandidates =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>).data ?? parsed
      : [];
  const candidates: unknown[] = Array.isArray(rawCandidates) ? rawCandidates : [];

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

        if (!response.ok) {
          throw new Error("Pesquisa web HTTP " + response.status);
        }

        const raw = await response.text();
        return parseSearchResponse(raw, query);
      } catch (error) {
        console.error(
          JSON.stringify({
            evento: "web_research_error",
            query,
            erro: error instanceof Error ? error.message : String(error),
          })
        );
        return [];
      } finally {
        clearTimeout(timer);
      }
    })
  );

  const dedup = new Map<string, WebResearchEvidence>();
  for (const batch of results) {
    for (const item of batch) {
      if (!dedup.has(item.url)) dedup.set(item.url, item);
    }
  }

  return Array.from(dedup.values())
    .sort((left, right) => {
      const weight = (item: WebResearchEvidence) =>
        item.sourceType === "standard"
          ? 4
          : item.sourceType === "official"
            ? 3
            : item.sourceType === "reference"
              ? 2
              : 1;
      return weight(right) - weight(left);
    })
    .slice(0, maxResults);
}

export function buildEapResearchQueries(
  issues: Array<{ code: string; message: string }>
): string[] {
  const queries = new Set<string>();

  for (const issue of issues) {
    const message = issue.message.toLowerCase();
    if (issue.code === "possible_scope_overlap" || /sobreposi|duplicad/.test(message)) {
      queries.add(
        "WBS work breakdown structure dictionary scope inclusions exclusions overlapping responsibilities work package construction PMI"
      );
      queries.add(
        "construction WBS work package scope definition responsibility assignment WBS dictionary official guidance"
      );
    }

    if (issue.code === "eap_leaf_not_ready" || /falta\(m\) respons|responsável/.test(message)) {
      queries.add(
        "WBS work package responsibility assignment WBS dictionary owner accountable construction project PMI"
      );
    }

    if (/decompos|nível de detalhe|critério de parada/.test(message)) {
      queries.add(
        "WBS decomposition level of detail 100 percent rule work package PMI"
      );
    }
  }

  if (!queries.size) {
    queries.add(
      "WBS work breakdown structure construction scope dictionary work package 100 percent rule PMI"
    );
  }

  return Array.from(queries).slice(0, 4);
}