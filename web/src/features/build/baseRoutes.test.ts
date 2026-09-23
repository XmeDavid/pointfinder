import { describe, expect, it } from 'vitest'
import { createMockBase } from '@/test/factories/base'
import { createMockStage } from '@/test/factories/stage'
import { anyRouteEnforced, baseRouteGroups } from './baseRoutes'

describe('anyRouteEnforced', () => {
  it('counts the default route and every stage, preferring the stages at hand', () => {
    expect(anyRouteEnforced({ enforceBaseOrder: false }, [createMockStage({ enforceBaseOrder: true })])).toBe(true)
    expect(anyRouteEnforced({ enforceBaseOrder: true }, [])).toBe(true)
    expect(anyRouteEnforced({ enforceBaseOrder: false, routeOrderEnforced: true }, [createMockStage({ enforceBaseOrder: false })])).toBe(false)
  })

  it('uses the server’s answer until stages load, then the game flag on older servers', () => {
    expect(anyRouteEnforced({ enforceBaseOrder: false, routeOrderEnforced: true }, undefined)).toBe(true)
    expect(anyRouteEnforced({ enforceBaseOrder: true }, undefined)).toBe(true)
    expect(anyRouteEnforced(undefined, undefined)).toBe(false)
  })
})

describe('baseRouteGroups', () => {
  const free = createMockBase({ id: 'free', name: 'Free' })
  const a2 = createMockBase({ id: 'a2', name: 'Second', stageId: 'linear', sequenceNumber: 2 })
  const a1 = createMockBase({ id: 'a1', name: 'First', stageId: 'linear', sequenceNumber: 1 })
  const x = createMockBase({ id: 'x', name: 'Explore', stageId: 'explore' })

  it('lists the default route first, then stages by order, each in route order', () => {
    const stages = [
      createMockStage({ id: 'linear', name: 'Linear', orderIndex: 1, enforceBaseOrder: true, baseIds: ['a1', 'a2'] }),
      createMockStage({ id: 'explore', name: 'Explore', orderIndex: 0, enforceBaseOrder: false, baseIds: ['x'] }),
    ]
    const groups = baseRouteGroups([a2, x, free, a1], stages, false)
    expect(groups.map((g) => [g.key, g.enforced, g.bases.map((b) => b.id)])).toEqual([
      ['default', false, ['free']],
      ['explore', false, ['x']],
      ['linear', true, ['a1', 'a2']],
    ])
  })

  it('trusts the stage’s base list over a stale base row and leaves out empty routes', () => {
    const stages = [createMockStage({ id: 'linear', orderIndex: 0, enforceBaseOrder: true, baseIds: ['free'] })]
    const groups = baseRouteGroups([free], stages, true)
    expect(groups.map((g) => [g.key, g.bases.map((b) => b.id)])).toEqual([['linear', ['free']]])
  })

  it('puts a base of a deleted stage back on the default route', () => {
    const orphan = createMockBase({ id: 'orphan', stageId: 'gone' })
    expect(baseRouteGroups([orphan], [], true)).toMatchObject([{ key: 'default', enforced: true, bases: [{ id: 'orphan' }] }])
  })
})
