/**
 * Ensures product documents have consistent field names for API response.
 * Legacy compatibility: maps description, whenToUse to shortDescription, suitableFor.
 */

type ProductRecord = Record<string, unknown>;

export function ensureBilingualProduct(p: ProductRecord): ProductRecord {
  const desc = (p.description as string) ?? (p.shortDescription as string) ?? (p.fullDescription as string);
  const forWhom = (p.suitableFor as string) ?? (p.whenToUse as string);
  return {
    ...p,
    shortDescription: (p.shortDescription as string) ?? desc,
    fullDescription: (p.fullDescription as string) ?? desc,
    description: (p.description as string) ?? desc,
    howToUse: (p.howToUse as string) ?? (p.usage_uz as string) ?? (p.usage_ru as string),
    suitableFor: (p.suitableFor as string) ?? (p.for_whom_uz as string) ?? (p.for_whom_ru as string) ?? forWhom,
  };
}
