import type { Game } from '@/types/game'

/** A practice game is the game a tutorial runs on; the server marks it. */
export function isPracticeGame(game: Pick<Game, 'tutorialScenario'> | null | undefined): boolean {
  return Boolean(game?.tutorialScenario)
}

/** Whole hours until a practice game ends itself, never below zero. */
export function practiceHoursLeft(expiresAt: string | null | undefined, now: number = Date.now()): number {
  if (!expiresAt) return 0
  const ms = new Date(expiresAt).getTime() - now
  return Math.max(0, Math.ceil(ms / 3_600_000))
}

/**
 * Where seeded practice bases should go: the operator's position, read on a
 * best-effort basis with a short timeout. Undefined when there is no
 * geolocation, it is denied, or it is slow; the server then uses its fallback.
 */
export function readPracticeCentre(timeoutMs = 3000): Promise<{ lat: number; lng: number } | undefined> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer)
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude })
      },
      () => {
        clearTimeout(timer)
        resolve(undefined)
      },
      { timeout: timeoutMs, maximumAge: 300_000 },
    )
  })
}

/** The operator's current practice game, if any has not ended. */
export function activePracticeGame(games: Game[] | undefined): Game | undefined {
  return (games ?? []).find((game) => isPracticeGame(game) && game.status !== 'ended')
}
