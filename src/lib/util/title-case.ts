/**
 * Normalise a free-typed name to Title Case for display
 * (e.g. "resistance band" → "Resistance Band", "DUMBBELL" → "Dumbbell").
 * Storage is left untouched; this is a display-layer transform.
 */
export function toTitleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
