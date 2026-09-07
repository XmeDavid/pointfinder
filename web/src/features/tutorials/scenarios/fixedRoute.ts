import type { Scenario, TourActions, TourState } from '../types'

/**
 * Turn one setup game into a fixed route: enforce the order, choose what
 * unlocks the next base, and arrange the shared running order. Nothing here
 * creates or deletes an entity — every prepare only moves operator UI state.
 */
function ensureBuild(a: TourActions, s: TourState): void {
  if (s.mode !== 'build') a.setMode('build')
}

export const fixedRoute: Scenario = {
  id: 'fixed-route',
  entry: 'practice-game',
  title: 'tutorials.scenarios.fixedRoute.title',
  blurb: 'tutorials.scenarios.fixedRoute.blurb',
  steps: [
    {
      id: 'enable-order',
      route: 'workspace',
      anchor: 'enforce-base-order-switch',
      prepare: (a, s) => {
        ensureBuild(a, s)
        a.setSettingsPanelOpen(true)
      },
      done: { kind: 'predicate', test: (s) => s.game?.enforceBaseOrder === true },
      copy: {
        title: 'tutorials.fixedRoute.enable-order.title',
        body: 'tutorials.fixedRoute.enable-order.body',
      },
    },
    {
      id: 'unlock-trigger',
      route: 'workspace',
      // The three buttons render as unlock-trigger-CHECK_IN | SUBMISSION | COMPLETED.
      anchor: (s) => `unlock-trigger-${s.game?.unlockTrigger ?? 'CHECK_IN'}`,
      prepare: (a, s) => {
        ensureBuild(a, s)
        a.setSettingsPanelOpen(true)
      },
      done: { kind: 'ack' },
      copy: {
        title: 'tutorials.fixedRoute.unlock-trigger.title',
        body: 'tutorials.fixedRoute.unlock-trigger.body',
      },
    },
    {
      // Arrange route is disabled below two bases, so a thin game is asked for
      // bases first instead of being parked on a button it cannot press.
      id: 'add-bases',
      route: 'workspace',
      anchor: 'new-entity-btn',
      when: (s) => s.bases.length < 2,
      prepare: (a) => {
        a.setSettingsPanelOpen(false)
        a.openDrawer('bases')
      },
      done: { kind: 'predicate', test: (s) => s.bases.length >= 2 },
      copy: {
        title: 'tutorials.fixedRoute.add-bases.title',
        body: 'tutorials.fixedRoute.add-bases.body',
      },
    },
    {
      id: 'arrange',
      route: 'workspace',
      anchor: 'arrange-route-btn',
      prepare: (a) => {
        a.setSettingsPanelOpen(false)
        a.openDrawer('bases')
      },
      // BasesTab keeps the editor in local state, so the DOM is the only observable.
      done: { kind: 'predicate', test: (s) => s.field('base-route-editor').present },
      copy: {
        title: 'tutorials.fixedRoute.arrange.title',
        body: 'tutorials.fixedRoute.arrange.body',
      },
    },
    {
      id: 'route',
      route: 'workspace',
      anchor: 'base-route-editor',
      prepare: (a) => {
        a.setSettingsPanelOpen(false)
        a.openDrawer('bases')
      },
      done: { kind: 'ack' },
      copy: {
        title: 'tutorials.fixedRoute.route.title',
        body: 'tutorials.fixedRoute.route.body',
      },
    },
    {
      id: 'readiness',
      route: 'workspace',
      anchor: 'readiness-indicator',
      prepare: (a) => {
        a.closeDrawer()
        a.setSettingsPanelOpen(false)
        a.setReadinessExpanded(true)
      },
      done: { kind: 'ack' },
      copy: {
        title: 'tutorials.fixedRoute.readiness.title',
        body: 'tutorials.fixedRoute.readiness.body',
      },
    },
    {
      // No anchor: the closing card is centred. On a practice game it also
      // offers Keep and Delete.
      id: 'finish',
      route: 'workspace',
      anchor: '',
      done: { kind: 'ack' },
      copy: {
        title: 'tutorials.fixedRoute.finish.title',
        body: 'tutorials.fixedRoute.finish.body',
      },
    },
  ],
}
