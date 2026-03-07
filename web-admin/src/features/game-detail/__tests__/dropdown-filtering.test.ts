import { describe, it, expect } from "vitest";
import type { Base, Challenge } from "../../../types";
import {
  filterAvailableFixedChallenges,
  filterAvailableBases,
  filterAvailableUnlockBases,
} from "../dropdown-filters";

function base(
  id: string,
  overrides: Partial<Base> = {},
): Base {
  return {
    id,
    gameId: "g1",
    name: `Base ${id}`,
    description: "",
    lat: 0,
    lng: 0,
    nfcLinked: false,
    requirePresenceToSubmit: false,
    hidden: false,
    ...overrides,
  };
}

function challenge(
  id: string,
  overrides: Partial<Challenge> = {},
): Challenge {
  return {
    id,
    gameId: "g1",
    title: `Challenge ${id}`,
    description: "",
    content: "",
    completionContent: "",
    answerType: "text",
    autoValidate: false,
    points: 10,
    locationBound: false,
    ...overrides,
  };
}

describe("filterAvailableFixedChallenges", () => {
  it("excludes challenges fixed to other bases", () => {
    const challenges = [challenge("c1"), challenge("c2"), challenge("c3")];
    const bases = [base("b1", { fixedChallengeId: "c1" }), base("b2")];
    const result = filterAvailableFixedChallenges(challenges, bases, "b2", undefined);
    expect(result.map((c) => c.id)).toEqual(["c2", "c3"]);
  });

  it("keeps currently selected challenge", () => {
    const challenges = [challenge("c1"), challenge("c2")];
    const bases = [
      base("b1", { fixedChallengeId: "c1" }),
      base("b2", { fixedChallengeId: "c1" }),
    ];
    const result = filterAvailableFixedChallenges(challenges, bases, "b2", "c1");
    expect(result.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("excludes own base from unavailable set", () => {
    const challenges = [challenge("c1"), challenge("c2")];
    const bases = [base("b1", { fixedChallengeId: "c1" })];
    const result = filterAvailableFixedChallenges(challenges, bases, "b1", "c1");
    expect(result.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("returns all when no bases have fixed challenges", () => {
    const challenges = [challenge("c1"), challenge("c2"), challenge("c3")];
    const bases = [base("b1"), base("b2")];
    const result = filterAvailableFixedChallenges(challenges, bases, undefined, undefined);
    expect(result).toHaveLength(3);
  });
});

describe("filterAvailableBases", () => {
  it("excludes bases with existing fixedChallengeId", () => {
    const bases = [
      base("b1", { fixedChallengeId: "c1" }),
      base("b2"),
      base("b3", { fixedChallengeId: "c2" }),
    ];
    const result = filterAvailableBases(bases, undefined);
    expect(result.map((b) => b.id)).toEqual(["b2"]);
  });

  it("keeps base matching current challenge", () => {
    const bases = [
      base("b1", { fixedChallengeId: "c1" }),
      base("b2", { fixedChallengeId: "c2" }),
    ];
    const result = filterAvailableBases(bases, "c1");
    expect(result.map((b) => b.id)).toEqual(["b1"]);
  });

  it("returns all when no bases have fixed challenges", () => {
    const bases = [base("b1"), base("b2")];
    const result = filterAvailableBases(bases, undefined);
    expect(result).toHaveLength(2);
  });
});

describe("filterAvailableUnlockBases", () => {
  it("only shows hidden bases", () => {
    const bases = [base("b1"), base("b2", { hidden: true }), base("b3", { hidden: true })];
    const result = filterAvailableUnlockBases(bases, [], undefined, undefined);
    expect(result.map((b) => b.id)).toEqual(["b2", "b3"]);
  });

  it("excludes own fixedBaseId", () => {
    const bases = [base("b1", { hidden: true }), base("b2", { hidden: true })];
    const result = filterAvailableUnlockBases(bases, [], undefined, "b1");
    expect(result.map((b) => b.id)).toEqual(["b2"]);
  });

  it("excludes bases already unlocked by other challenges", () => {
    const bases = [
      base("b1", { hidden: true }),
      base("b2", { hidden: true }),
      base("b3", { hidden: true }),
    ];
    const challenges = [
      challenge("c1", { unlocksBaseId: "b1" }),
      challenge("c2", { unlocksBaseId: "b2" }),
    ];
    const result = filterAvailableUnlockBases(bases, challenges, undefined, undefined);
    expect(result.map((b) => b.id)).toEqual(["b3"]);
  });

  it("keeps base unlocked by current challenge", () => {
    const bases = [base("b1", { hidden: true }), base("b2", { hidden: true })];
    const challenges = [
      challenge("c1", { unlocksBaseId: "b1" }),
      challenge("c2", { unlocksBaseId: "b2" }),
    ];
    const result = filterAvailableUnlockBases(bases, challenges, "c1", undefined);
    expect(result.map((b) => b.id)).toEqual(["b1"]);
  });

  it("returns empty when no hidden bases exist", () => {
    const bases = [base("b1"), base("b2")];
    const result = filterAvailableUnlockBases(bases, [], undefined, undefined);
    expect(result).toHaveLength(0);
  });
});
