// Shared reconciliation helpers for grouping a free-text field (genre tag,
// artist name) that isn't normalized at the source — the same underlying
// value can appear with inconsistent casing/whitespace across rows, so
// aggregating by it needs a stable key plus a way to pick the best-looking
// display label among the variants that collapse into it.

export function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase();
}

// Prefers an already-capitalized variant over a lowercase one when merging
// same-key values that differ only in casing (e.g. "rock" vs "Rock") —
// doesn't force capitalization, since that would wrongly mangle legitimately
// lowercase names (e.g. artist "deadmau5").
export function preferLabel(existing: string | undefined, candidate: string): string {
  const trimmed = candidate.trim();
  if (!existing) return trimmed;
  if (!/^[A-Z]/.test(existing) && /^[A-Z]/.test(trimmed)) return trimmed;
  return existing;
}
