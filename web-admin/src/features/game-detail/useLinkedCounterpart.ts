/**
 * useLinkedCounterpart.ts
 *
 * Shared computation utilities for base↔challenge cross-navigation (Wave 3d).
 *
 * Three linkage sources are unioned:
 *   - Base.fixedChallengeId          → source: 'fixed'
 *   - Challenge.unlocksBaseIds[]     → source: 'unlock'
 *   - Assignment.baseId/challengeId  → source: 'assignment'
 *
 * De-duplication: if the same counterpart id appears via multiple sources,
 * only one entry is kept with priority: 'fixed' > 'unlock' > 'assignment'.
 *
 * Performance: build the full linkage maps once (at page level) and look up
 * per-card. The exported functions accept the full arrays and return Maps so
 * callers can do O(1) per-card lookups inside .map() renders.
 *
 * Sub-wave A: hook + data plumbing. No UI wiring (Sub-wave B) or dialog/URL
 * param handling (Sub-wave C).
 */

import type { Assignment, Base, Challenge } from "@/types";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type LinkSource = "fixed" | "unlock" | "assignment";

export interface LinkedChallenge {
  id: string;
  title: string;
  source: LinkSource;
}

export interface LinkedBase {
  id: string;
  name: string;
  source: LinkSource;
}

// ---------------------------------------------------------------------------
// Source priority for de-duplication
// 'fixed' wins over 'unlock' wins over 'assignment'
// ---------------------------------------------------------------------------

const SOURCE_PRIORITY: Record<LinkSource, number> = {
  fixed: 0,
  unlock: 1,
  assignment: 2,
};

function higherPriority(a: LinkSource, b: LinkSource): LinkSource {
  return SOURCE_PRIORITY[a] <= SOURCE_PRIORITY[b] ? a : b;
}

// ---------------------------------------------------------------------------
// buildLinkedChallengesMap
//
// Returns Map<baseId, LinkedChallenge[]> — one entry per unique challenge id.
// Callers look up by base id for O(1) per-card access.
// ---------------------------------------------------------------------------

export function buildLinkedChallengesMap(
  bases: Base[],
  challenges: Challenge[],
  assignments: Assignment[],
): Map<string, LinkedChallenge[]> {
  const challengeById = new Map(challenges.map((c) => [c.id, c]));

  // intermediate: Map<baseId, Map<challengeId, LinkSource>>
  const rawMap = new Map<string, Map<string, LinkSource>>();

  function ensureBase(baseId: string): Map<string, LinkSource> {
    let m = rawMap.get(baseId);
    if (!m) {
      m = new Map();
      rawMap.set(baseId, m);
    }
    return m;
  }

  function upsert(baseId: string, challengeId: string, source: LinkSource): void {
    const m = ensureBase(baseId);
    const existing = m.get(challengeId);
    m.set(challengeId, existing ? higherPriority(existing, source) : source);
  }

  // 1. fixedChallengeId links
  for (const base of bases) {
    if (base.fixedChallengeId) {
      upsert(base.id, base.fixedChallengeId, "fixed");
    }
  }

  // 2. unlocksBaseIds — reverse direction: challenge unlocks base means the
  //    challenge that triggers the unlock is linked to the base that contains
  //    the trigger. For the base→challenge direction we look for challenges
  //    whose fixedChallengeId is set on a base AND unlocksBaseIds points
  //    elsewhere — but the simpler interpretation the plan specifies is:
  //    if a challenge unlocks a base, that challenge is linked to that base.
  for (const challenge of challenges) {
    if (challenge.unlocksBaseIds && challenge.unlocksBaseIds.length > 0) {
      for (const baseId of challenge.unlocksBaseIds) {
        upsert(baseId, challenge.id, "unlock");
      }
    }
  }

  // 3. assignment links
  for (const assignment of assignments) {
    upsert(assignment.baseId, assignment.challengeId, "assignment");
  }

  // Materialise: filter out orphaned challenge ids (challenge no longer exists)
  const result = new Map<string, LinkedChallenge[]>();
  for (const [baseId, challengeMap] of rawMap) {
    const linked: LinkedChallenge[] = [];
    for (const [challengeId, source] of challengeMap) {
      const challenge = challengeById.get(challengeId);
      if (challenge) {
        linked.push({ id: challengeId, title: challenge.title, source });
      }
      // orphaned challenge ids are silently filtered out (see plan §6.4)
    }
    if (linked.length > 0) {
      result.set(baseId, linked);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// buildLinkedBasesMap
//
// Returns Map<challengeId, LinkedBase[]> — one entry per unique base id.
// Reverse direction of buildLinkedChallengesMap.
// ---------------------------------------------------------------------------

export function buildLinkedBasesMap(
  bases: Base[],
  challenges: Challenge[],
  assignments: Assignment[],
): Map<string, LinkedBase[]> {
  const baseById = new Map(bases.map((b) => [b.id, b]));

  // intermediate: Map<challengeId, Map<baseId, LinkSource>>
  const rawMap = new Map<string, Map<string, LinkSource>>();

  function ensureChallenge(challengeId: string): Map<string, LinkSource> {
    let m = rawMap.get(challengeId);
    if (!m) {
      m = new Map();
      rawMap.set(challengeId, m);
    }
    return m;
  }

  function upsert(challengeId: string, baseId: string, source: LinkSource): void {
    const m = ensureChallenge(challengeId);
    const existing = m.get(baseId);
    m.set(baseId, existing ? higherPriority(existing, source) : source);
  }

  // 1. fixedChallengeId — reverse: base.fixedChallengeId means that challenge
  //    is fixed to that base → the base is a 'fixed' link for the challenge.
  for (const base of bases) {
    if (base.fixedChallengeId) {
      upsert(base.fixedChallengeId, base.id, "fixed");
    }
  }

  // 2. unlocksBaseIds — challenge unlocks base → that base is an 'unlock' link
  //    for the challenge.
  for (const challenge of challenges) {
    if (challenge.unlocksBaseIds && challenge.unlocksBaseIds.length > 0) {
      for (const baseId of challenge.unlocksBaseIds) {
        upsert(challenge.id, baseId, "unlock");
      }
    }
  }

  // 3. assignment links — reverse
  for (const assignment of assignments) {
    upsert(assignment.challengeId, assignment.baseId, "assignment");
  }

  // Materialise: filter orphaned base ids
  const result = new Map<string, LinkedBase[]>();
  for (const [challengeId, baseMap] of rawMap) {
    const linked: LinkedBase[] = [];
    for (const [baseId, source] of baseMap) {
      const base = baseById.get(baseId);
      if (base) {
        linked.push({ id: baseId, name: base.name, source });
      }
    }
    if (linked.length > 0) {
      result.set(challengeId, linked);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Convenience accessors (per-id queries against the prebuilt maps)
// These are the named functions the plan documents as the hook API.
// Sub-wave B wires these into card renders via the map computed at page level.
// ---------------------------------------------------------------------------

export function useLinkedChallengesForBase(
  baseId: string,
  linkedChallengesMap: Map<string, LinkedChallenge[]>,
): LinkedChallenge[] {
  return linkedChallengesMap.get(baseId) ?? [];
}

export function useLinkedBasesForChallenge(
  challengeId: string,
  linkedBasesMap: Map<string, LinkedBase[]>,
): LinkedBase[] {
  return linkedBasesMap.get(challengeId) ?? [];
}
