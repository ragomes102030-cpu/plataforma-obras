/** Re-export point for server routers (keeps shared price-sources modular). */
export { seinfraAdapter } from "./seinfra";
export { findCandidates, exceedsPriceThreshold, priceVariation } from "./matching";
export type { ComparableRecord, MatchCandidate } from "./matching";
export type { PriceParseResult, ParsedPriceRecord } from "./types";
export { registerPriceSourceAdapter, getPriceSourceAdapter } from "./types";
