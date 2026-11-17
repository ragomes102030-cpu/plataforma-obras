# Piazza budget multi-service linking

## Intent

Let a budget item represent a real work package made from multiple active official SEINFRA/SINAPI service lines, so a generic placeholder such as a floor package can be priced by its actual measurable parts without a JSON import.

## Chosen approach

Use the existing serviceCompositions and compositionComponents tables. Add a budget-editor flow that selects multiple official services, records each coefficient per output unit, calculates the composed unit price, and atomically links the generated analytic composition to the item. Each component must come from one active regional catalog; the saved quantity and its evidence remain on the budget item.

## Constraints

- Never infer an output unit or quantity from the price lookup.
- Preserve the project's region and catalog-period checks.
- Store components relationally with official item IDs, coefficients, and price snapshots; do not store JSON blobs.
- Clearly label user-built compositions as QA/analytic combinations, not official published SEINFRA compositions.
- Keep the single-service and official-composition paths working.
- Allow clearing a prior direct service/composition link when the search field is empty.

## Acceptance

- A user can add and remove multiple official services, set a coefficient for each, see the calculated unit price, and save one linked analytic composition.
- Server validation rejects inactive, non-service, mixed-catalog, wrong-region, duplicate, empty, or non-positive component selections.
- Saving creates the composition, its component snapshots, updates the budget item, and writes one audit event atomically.
- The budget item's unit must match the composition output unit; its total remains output quantity multiplied by composed unit price.
- A single official service link can be removed without a dummy search.
