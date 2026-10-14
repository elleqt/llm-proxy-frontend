/**
 * The levels upstream knows, offered for every model. `auto` is outside the server's default
 * set (Ollama refuses it) but stays on offer for vendors that take it.
 */
export const KNOWN_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "auto"] as const;

/** A level as the server accepts it, after lower-casing and trimming. */
export const LEVEL_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

/** Whether two lists hold the same levels, order aside. Neither has duplicates. */
export function sameLevels(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && b.every((level) => a.includes(level));
}

/**
 * A model's levels as the request carries them: absent while the checked set is the default
 * one (`null` means "follows the default"), so a model never pins a copy of the default set.
 */
export function levelsInput(levels: readonly string[] | null, defaults: readonly string[]): string[] | undefined {
  return levels === null || sameLevels(levels, defaults) ? undefined : [...levels];
}

/** The provider-wide list the form shows, read from the per-model lists the API stores. */
export type ProviderLevels = { kind: "default" } | { kind: "own"; levels: string[] } | { kind: "mixed" };

/**
 * Every model following the default set (a stored copy of it counts) is `default`; every
 * model with the same own list is `own`, in the first model's order; anything else `mixed`.
 */
export function providerLevels(
  models: readonly { reasoningLevels?: string[] }[],
  defaults: readonly string[],
): ProviderLevels {
  const lists = models.map((model) => levelsInput(model.reasoningLevels ?? null, defaults));
  const first = lists[0];
  if (first === undefined) return lists.every((list) => list === undefined) ? { kind: "default" } : { kind: "mixed" };
  return lists.every((list) => list !== undefined && sameLevels(list, first))
    ? { kind: "own", levels: first }
    : { kind: "mixed" };
}

export type LevelsKind = ProviderLevels["kind"];

/** What a shown list is: `null` (nothing checked while models differ) is `mixed`. */
export function levelsKind(value: readonly string[] | null, defaults: readonly string[]): LevelsKind {
  return value === null ? "mixed" : levelsInput(value, defaults) === undefined ? "default" : "own";
}
