export interface CompositionComponentForEditor {
  compositionId: number;
  priceItemId: number;
  coefficient: string | number;
  unitPriceSnapshot: string | number;
  itemCode: string;
  itemDescription: string;
  itemUnit: string;
}

export interface CompositionForEditor {
  id: number;
  sourceCatalogId: number | null;
  referencePeriod: string | null;
}

export interface CatalogForEditor {
  id: number;
  name: string;
  sourceType: string;
  referencePeriod: string | null;
}

export interface SelectedOfficialService {
  id: number;
  code: string;
  description: string;
  unit: string;
  unitPrice: number | string;
  sourceType: string;
  catalogId: number;
  catalogName: string;
  referencePeriod?: string | null;
  coefficient: string;
}

export function mapCompositionComponentsForEditor(
  composition: CompositionForEditor,
  catalogs: CatalogForEditor[],
  components: CompositionComponentForEditor[],
): SelectedOfficialService[] {
  const catalog = catalogs.find(row => row.id === composition.sourceCatalogId);

  return components
    .filter(component => component.compositionId === composition.id)
    .map(component => ({
      id: component.priceItemId,
      code: component.itemCode,
      description: component.itemDescription,
      unit: component.itemUnit,
      unitPrice: component.unitPriceSnapshot,
      sourceType: catalog?.sourceType ?? "origem não identificada",
      catalogId: composition.sourceCatalogId ?? catalog?.id ?? 0,
      catalogName: catalog?.name ?? "Origem não identificada",
      referencePeriod: composition.referencePeriod ?? catalog?.referencePeriod ?? null,
      coefficient: String(component.coefficient),
    }));
}
