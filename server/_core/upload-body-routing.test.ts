import { describe, expect, it } from "vitest";

// Keep this contract aligned with the pre-global JSON parser in index.ts.
const CAMINHOS_DE_UPLOAD =
  /^\/api\/trpc\/(catalog\.(?:inspect|import)PriceSheet|documents\.upload)([,?]|$)/;

describe("large JSON body routing for file uploads", () => {
  it.each([
    "/api/trpc/catalog.inspectPriceSheet",
    "/api/trpc/catalog.importPriceSheet",
    "/api/trpc/documents.upload",
    "/api/trpc/catalog.inspectPriceSheet,catalog.importPriceSheet?batch=1",
  ])("routes %s through the large body parser", path => {
    expect(CAMINHOS_DE_UPLOAD.test(path)).toBe(true);
  });

  it.each([
    "/api/trpc/catalog.listPriceSheets",
    "/api/trpc/projects.get",
    "/api/trpc/documents.list",
  ])("keeps %s on the default body limit", path => {
    expect(CAMINHOS_DE_UPLOAD.test(path)).toBe(false);
  });
});
