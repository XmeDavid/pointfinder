import type { Assignment, Challenge } from '@/types/v2'

/** Column key for the rows that apply to every team. */
export const ALL_TEAMS = 'all'

export type AssignmentRow = Omit<Assignment, 'id'> & { id?: string }
export type BaseMode = 'none' | 'all' | 'teams'

/**
 * The assignment model is a grid: one row per base, one column for "all
 * teams" plus one per team, each cell a challenge or nothing. The backend's
 * rules are the grid's rules:
 *
 * - a base is either an all-teams row or per-team rows, never both;
 * - within one column a challenge appears at most once (a team meets a
 *   challenge at one base; an all-teams challenge lives at one base).
 *
 * Every function here returns the complete next list for the bulk-set
 * endpoint, so the server sees a consistent whole rather than a sequence of
 * single writes that can conflict half-way.
 */
export function baseMode(rows: readonly AssignmentRow[], baseId: string): BaseMode {
  const own = rows.filter((row) => row.baseId === baseId)
  if (own.length === 0) return 'none'
  return own.some((row) => !row.teamId) ? 'all' : 'teams'
}

export function cellChallenge(rows: readonly AssignmentRow[], baseId: string, column: string): string | null {
  const row = rows.find((candidate) =>
    candidate.baseId === baseId && (column === ALL_TEAMS ? !candidate.teamId : candidate.teamId === column),
  )
  return row?.challengeId ?? null
}

/** Challenges a cell may take: not used elsewhere in the same column. */
export function optionsFor(
  rows: readonly AssignmentRow[],
  challenges: readonly Challenge[],
  baseId: string,
  column: string,
): Challenge[] {
  const taken = new Set(
    rows
      .filter((row) => row.baseId !== baseId && (column === ALL_TEAMS ? !row.teamId : row.teamId === column))
      .map((row) => row.challengeId),
  )
  return challenges.filter((challenge) => !taken.has(challenge.id))
}

/**
 * Sets one cell and returns the whole next list.
 *
 * - All-teams column: the base's per-team rows go; the same challenge's
 *   all-teams row at another base goes too.
 * - Team column on an all-teams base: the base converts to per-team, every
 *   other team keeping the challenge it had (unless that team already meets it
 *   elsewhere), and this team takes the new one.
 * - Team column otherwise: this team's row at the base is replaced, and the
 *   same challenge is dropped from this team's other bases.
 * - A null challenge clears the cell (all-teams: the whole base).
 */
export function setCell(
  rows: readonly AssignmentRow[],
  gameId: string,
  baseId: string,
  column: string,
  challengeId: string | null,
  teamIds: readonly string[],
): AssignmentRow[] {
  const otherBases = rows.filter((row) => row.baseId !== baseId)
  const own = rows.filter((row) => row.baseId === baseId)

  if (column === ALL_TEAMS) {
    if (challengeId === null) return otherBases
    const withoutDuplicate = otherBases.filter((row) => !(!row.teamId && row.challengeId === challengeId))
    return [...withoutDuplicate, { gameId, baseId, challengeId }]
  }

  const teamId = column
  const allRow = own.find((row) => !row.teamId)
  let next = otherBases
  const keep: AssignmentRow[] = own.filter((row) => row.teamId && row.teamId !== teamId)
  if (allRow) {
    for (const other of teamIds) {
      if (other === teamId) continue
      const meetsElsewhere = next.some((row) => row.teamId === other && row.challengeId === allRow.challengeId)
      if (!meetsElsewhere) keep.push({ gameId, baseId, challengeId: allRow.challengeId, teamId: other })
    }
  }
  if (challengeId !== null) {
    next = next.filter((row) => !(row.teamId === teamId && row.challengeId === challengeId))
    keep.push({ gameId, baseId, challengeId, teamId })
  }
  return [...next, ...keep]
}

/** Converts an all-teams base to per-team rows, every team keeping the challenge. */
export function splitToTeams(
  rows: readonly AssignmentRow[],
  gameId: string,
  baseId: string,
  teamIds: readonly string[],
): AssignmentRow[] {
  const allRow = rows.find((row) => row.baseId === baseId && !row.teamId)
  if (!allRow) return [...rows]
  const otherBases = rows.filter((row) => row.baseId !== baseId)
  const perTeam = teamIds
    .filter((teamId) => !otherBases.some((row) => row.teamId === teamId && row.challengeId === allRow.challengeId))
    .map((teamId) => ({ gameId, baseId, challengeId: allRow.challengeId, teamId }))
  return [...otherBases, ...perTeam]
}

/** Collapses a per-team base to one all-teams row carrying `challengeId`. */
export function mergeToAll(
  rows: readonly AssignmentRow[],
  gameId: string,
  baseId: string,
  challengeId: string,
): AssignmentRow[] {
  return setCell(rows, gameId, baseId, ALL_TEAMS, challengeId, [])
}

/** Removes every row of one challenge (unassign it everywhere). */
export function clearChallenge(rows: readonly AssignmentRow[], challengeId: string): AssignmentRow[] {
  return rows.filter((row) => row.challengeId !== challengeId)
}

/** Where a challenge sits for one column, or null. */
export function baseOfChallenge(rows: readonly AssignmentRow[], challengeId: string, column: string): string | null {
  const row = rows.find((candidate) =>
    candidate.challengeId === challengeId && (column === ALL_TEAMS ? !candidate.teamId : candidate.teamId === column),
  )
  return row?.baseId ?? null
}
