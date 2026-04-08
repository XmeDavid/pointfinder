import type { Base, Challenge } from "@/types";

/**
 * Presentation-layer aggregate for the unified "Bases & Challenges" view.
 *
 * This module is deliberately pure and ignorant of React — it splits the raw
 * base + challenge lists into the shape the UI wants to render:
 *
 *   - `pairs`: bases with `fixedChallengeId` pointing at an existing challenge
 *   - `unpairedBases`: bases with no fixed challenge (random / decoupled mode)
 *   - `orphanedChallenges`: challenges not currently fixed to any base
 *   - `danglingBases`: bases whose `fixedChallengeId` points at a deleted/missing
 *     challenge — should be surfaced as a data-integrity warning
 *
 * IMPORTANT: this is an aggregate OVER the existing data model. It does NOT
 * collapse bases, challenges, and assignments into a new entity. The view
 * layer still edits each side via its own API client.
 */
export interface BaseChallengePair {
  base: Base;
  challenge: Challenge;
}

export interface AggregatedSetup {
  pairs: BaseChallengePair[];
  unpairedBases: Base[];
  orphanedChallenges: Challenge[];
  danglingBases: Base[];
}

export function aggregateBasesAndChallenges(
  bases: Base[],
  challenges: Challenge[],
): AggregatedSetup {
  const challengeById = new Map(challenges.map((c) => [c.id, c]));
  const fixedChallengeIds = new Set<string>();

  const pairs: BaseChallengePair[] = [];
  const unpairedBases: Base[] = [];
  const danglingBases: Base[] = [];

  for (const base of bases) {
    if (base.fixedChallengeId) {
      const challenge = challengeById.get(base.fixedChallengeId);
      if (challenge) {
        pairs.push({ base, challenge });
        fixedChallengeIds.add(challenge.id);
      } else {
        danglingBases.push(base);
      }
    } else {
      unpairedBases.push(base);
    }
  }

  const orphanedChallenges = challenges.filter((c) => !fixedChallengeIds.has(c.id));

  return { pairs, unpairedBases, orphanedChallenges, danglingBases };
}
