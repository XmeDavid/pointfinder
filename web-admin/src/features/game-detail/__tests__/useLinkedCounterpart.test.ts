/**
 * Unit tests for useLinkedCounterpart — Wave 3d Sub-wave A.
 *
 * Tests cover all 7 cases specified in the plan (Section 5.1) plus extras for
 * the reverse direction (buildLinkedBasesMap) and de-duplication rules.
 *
 * These are pure function tests — no React rendering needed.
 */

import { describe, it, expect } from "vitest";
import type { Base, Challenge, Assignment } from "@/types";
import {
  buildLinkedChallengesMap,
  buildLinkedBasesMap,
  useLinkedChallengesForBase,
  useLinkedBasesForChallenge,
} from "../useLinkedCounterpart";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function base(id: string, overrides: Partial<Base> = {}): Base {
  return {
    id,
    gameId: "g1",
    name: `Base ${id}`,
    description: "",
    lat: 0,
    lng: 0,
    nfcLinked: false,
    hidden: false,
    ...overrides,
  };
}

function challenge(id: string, overrides: Partial<Challenge> = {}): Challenge {
  return {
    id,
    gameId: "g1",
    title: `Challenge ${id}`,
    description: "",
    content: "",
    completionContent: "",
    answerType: "text",
    autoValidate: false,
    points: 100,
    locationBound: false,
    requirePresenceToSubmit: false,
    ...overrides,
  };
}

function assignment(
  id: string,
  baseId: string,
  challengeId: string,
  teamId?: string,
): Assignment {
  return { id, gameId: "g1", baseId, challengeId, teamId };
}

// ---------------------------------------------------------------------------
// buildLinkedChallengesMap (base → linked challenges)
// ---------------------------------------------------------------------------

describe("buildLinkedChallengesMap", () => {
  // Plan §5.1 case 1: Base with no assignments, no fixedChallenge → empty
  it("returns empty map for base with no links", () => {
    const bases = [base("b1")];
    const challenges = [challenge("c1")];
    const assignments: Assignment[] = [];

    const map = buildLinkedChallengesMap(bases, challenges, assignments);
    const result = useLinkedChallengesForBase("b1", map);

    expect(result).toEqual([]);
  });

  // Plan §5.1 case 2: Base with single fixed challenge → source='fixed'
  it("returns fixed challenge with source='fixed'", () => {
    const bases = [base("b1", { fixedChallengeId: "c1" })];
    const challenges = [challenge("c1")];
    const assignments: Assignment[] = [];

    const map = buildLinkedChallengesMap(bases, challenges, assignments);
    const result = useLinkedChallengesForBase("b1", map);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
    expect(result[0].title).toBe("Challenge c1");
    expect(result[0].source).toBe("fixed");
  });

  // Plan §5.1 case 3: Base with 3 assignment-linked challenges
  it("returns 3 distinct challenges from 3 assignments", () => {
    const bases = [base("b1")];
    const challenges = [challenge("c1"), challenge("c2"), challenge("c3")];
    const assignments = [
      assignment("a1", "b1", "c1"),
      assignment("a2", "b1", "c2"),
      assignment("a3", "b1", "c3"),
    ];

    const map = buildLinkedChallengesMap(bases, challenges, assignments);
    const result = useLinkedChallengesForBase("b1", map);

    expect(result).toHaveLength(3);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("c1");
    expect(ids).toContain("c2");
    expect(ids).toContain("c3");
    result.forEach((r) => expect(r.source).toBe("assignment"));
  });

  // Plan §5.1 case 4: fixedChallenge + 2 additional assignments → 3 (deduped)
  it("unions fixed + assignment links and deduplicates (3 unique challenges)", () => {
    const bases = [base("b1", { fixedChallengeId: "c1" })];
    const challenges = [challenge("c1"), challenge("c2"), challenge("c3")];
    const assignments = [
      assignment("a1", "b1", "c2"),
      assignment("a2", "b1", "c3"),
    ];

    const map = buildLinkedChallengesMap(bases, challenges, assignments);
    const result = useLinkedChallengesForBase("b1", map);

    expect(result).toHaveLength(3);
    const byId = new Map(result.map((r) => [r.id, r]));
    expect(byId.get("c1")?.source).toBe("fixed");
    expect(byId.get("c2")?.source).toBe("assignment");
    expect(byId.get("c3")?.source).toBe("assignment");
  });

  // Plan §5.1 case 5: multi-team assignments to same challenge → one entry
  it("deduplicates multi-team assignments to the same challenge", () => {
    const bases = [base("b1")];
    const challenges = [challenge("c1")];
    const assignments = [
      assignment("a1", "b1", "c1", "t1"),
      assignment("a2", "b1", "c1", "t2"),
    ];

    const map = buildLinkedChallengesMap(bases, challenges, assignments);
    const result = useLinkedChallengesForBase("b1", map);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
    expect(result[0].source).toBe("assignment");
  });

  // Plan §5.1 case 6: orphaned assignment (challenge deleted) → filtered out
  it("filters out orphaned challenge ids (challenge no longer exists)", () => {
    const bases = [base("b1")];
    const challenges: Challenge[] = []; // challenge deleted
    const assignments = [assignment("a1", "b1", "c_deleted")];

    const map = buildLinkedChallengesMap(bases, challenges, assignments);
    const result = useLinkedChallengesForBase("b1", map);

    expect(result).toEqual([]);
  });

  // Plan §5.1 case 7: empty inputs → no throws
  it("handles empty inputs without throwing", () => {
    expect(() =>
      buildLinkedChallengesMap([], [], []),
    ).not.toThrow();

    const map = buildLinkedChallengesMap([], [], []);
    expect(useLinkedChallengesForBase("any", map)).toEqual([]);
  });

  // De-duplication: same pair as 'fixed' AND 'assignment' → 'fixed' wins
  it("prefers 'fixed' source over 'assignment' when same challenge appears via both", () => {
    const bases = [base("b1", { fixedChallengeId: "c1" })];
    const challenges = [challenge("c1")];
    const assignments = [assignment("a1", "b1", "c1")]; // also via assignment

    const map = buildLinkedChallengesMap(bases, challenges, assignments);
    const result = useLinkedChallengesForBase("b1", map);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
    expect(result[0].source).toBe("fixed"); // not 'assignment'
  });

  // unlocksBaseIds direction: challenge unlocks a base → that challenge is
  // a linked challenge for that base (source='unlock')
  it("includes challenge that unlocks a base as a linked challenge (source='unlock')", () => {
    const bases = [base("b1")];
    const challenges = [challenge("c1", { unlocksBaseIds: ["b1"] })];
    const assignments: Assignment[] = [];

    const map = buildLinkedChallengesMap(bases, challenges, assignments);
    const result = useLinkedChallengesForBase("b1", map);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
    expect(result[0].source).toBe("unlock");
  });
});

// ---------------------------------------------------------------------------
// buildLinkedBasesMap (challenge → linked bases)
// ---------------------------------------------------------------------------

describe("buildLinkedBasesMap", () => {
  // Reverse of case 1: challenge with no links → empty
  it("returns empty for challenge with no links", () => {
    const bases = [base("b1")];
    const challenges = [challenge("c1")];
    const assignments: Assignment[] = [];

    const map = buildLinkedBasesMap(bases, challenges, assignments);
    const result = useLinkedBasesForChallenge("c1", map);

    expect(result).toEqual([]);
  });

  // Reverse of case 5: challenge that unlocksBaseIds → source='unlock'
  it("returns unlocked base with source='unlock'", () => {
    const bases = [base("b1")];
    const challenges = [challenge("c1", { unlocksBaseIds: ["b1"] })];
    const assignments: Assignment[] = [];

    const map = buildLinkedBasesMap(bases, challenges, assignments);
    const result = useLinkedBasesForChallenge("c1", map);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b1");
    expect(result[0].name).toBe("Base b1");
    expect(result[0].source).toBe("unlock");
  });

  // Reverse: base.fixedChallengeId = c1 → c1 has a 'fixed' link to that base
  it("returns fixed base for challenge that is fixedChallengeId of a base", () => {
    const bases = [base("b1", { fixedChallengeId: "c1" })];
    const challenges = [challenge("c1")];
    const assignments: Assignment[] = [];

    const map = buildLinkedBasesMap(bases, challenges, assignments);
    const result = useLinkedBasesForChallenge("c1", map);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b1");
    expect(result[0].source).toBe("fixed");
  });

  // Multiple base links via assignments
  it("returns multiple bases linked via assignments", () => {
    const bases = [base("b1"), base("b2"), base("b3")];
    const challenges = [challenge("c1")];
    const assignments = [
      assignment("a1", "b1", "c1"),
      assignment("a2", "b2", "c1"),
      assignment("a3", "b3", "c1"),
    ];

    const map = buildLinkedBasesMap(bases, challenges, assignments);
    const result = useLinkedBasesForChallenge("c1", map);

    expect(result).toHaveLength(3);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("b1");
    expect(ids).toContain("b2");
    expect(ids).toContain("b3");
  });

  // Orphaned base reference → filtered out
  it("filters out orphaned base ids (base deleted)", () => {
    const bases: Base[] = []; // base deleted
    const challenges = [challenge("c1", { unlocksBaseIds: ["b_deleted"] })];
    const assignments: Assignment[] = [];

    const map = buildLinkedBasesMap(bases, challenges, assignments);
    const result = useLinkedBasesForChallenge("c1", map);

    expect(result).toEqual([]);
  });

  // De-duplication: 'fixed' wins over 'assignment'
  it("prefers 'fixed' source over 'assignment' for same base", () => {
    const bases = [base("b1", { fixedChallengeId: "c1" })];
    const challenges = [challenge("c1")];
    const assignments = [assignment("a1", "b1", "c1")]; // also via assignment

    const map = buildLinkedBasesMap(bases, challenges, assignments);
    const result = useLinkedBasesForChallenge("c1", map);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b1");
    expect(result[0].source).toBe("fixed");
  });

  // Empty inputs
  it("handles empty inputs without throwing", () => {
    expect(() => buildLinkedBasesMap([], [], [])).not.toThrow();
    const map = buildLinkedBasesMap([], [], []);
    expect(useLinkedBasesForChallenge("any", map)).toEqual([]);
  });
});
