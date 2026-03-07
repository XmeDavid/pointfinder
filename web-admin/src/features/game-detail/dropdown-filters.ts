import type { Base, Challenge } from "../../types";

/**
 * Filters challenges for the fixed-challenge dropdown on a base edit form.
 * Excludes challenges already assigned as fixedChallengeId on other bases,
 * but keeps the currently-selected challenge (for no-change edits).
 */
export function filterAvailableFixedChallenges(
  challenges: Challenge[],
  bases: Base[],
  editingBaseId: string | undefined,
  currentFixedChallengeId: string | undefined,
): Challenge[] {
  const unavailableIds = new Set(
    bases
      .filter((b) => b.id !== editingBaseId && b.fixedChallengeId)
      .map((b) => b.fixedChallengeId as string),
  );
  return challenges.filter(
    (ch) => !unavailableIds.has(ch.id) || ch.id === currentFixedChallengeId,
  );
}

/**
 * Filters bases for the fixed-to-base dropdown on a challenge edit form.
 * Excludes bases that already have a fixedChallengeId assigned,
 * unless it matches the challenge being edited.
 */
export function filterAvailableBases(
  bases: Base[],
  editingChallengeId: string | undefined,
): Base[] {
  return bases.filter(
    (b) => !b.fixedChallengeId || b.fixedChallengeId === editingChallengeId,
  );
}

/**
 * Filters bases for the unlocks-base dropdown on a challenge edit form.
 * Only shows hidden bases, excludes the challenge's own fixed base,
 * and excludes bases already unlocked by other challenges.
 */
export function filterAvailableUnlockBases(
  bases: Base[],
  challenges: Challenge[],
  editingChallengeId: string | undefined,
  fixedBaseId: string | undefined,
): Base[] {
  const alreadyUnlockedBaseIds = new Set(
    challenges
      .filter((ch) => ch.unlocksBaseId && ch.id !== editingChallengeId)
      .map((ch) => ch.unlocksBaseId as string),
  );
  return bases.filter(
    (b) =>
      b.hidden && b.id !== fixedBaseId && !alreadyUnlockedBaseIds.has(b.id),
  );
}
