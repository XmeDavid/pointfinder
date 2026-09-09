import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceContext } from './workspaceContext'
import type { Workspace } from '../types/organization'
import { createOrgWorkspace } from '../test/msw/handlers/workspaces'

function workspaces(orgIds: string[], name = 'Scout Group 42'): Workspace {
  return {
    personal: { tier: 'free', status: 'active', activeGames: 0 },
    organizations: orgIds.map((id) => createOrgWorkspace({ id, name })),
  }
}

beforeEach(() => {
  useWorkspaceContext.setState({ active: { type: 'personal' } })
})

describe('workspace context reconciliation', () => {
  it('falls back to personal when the persisted org is gone', () => {
    useWorkspaceContext.setState({
      active: { type: 'org', orgId: 'org-gone', orgName: 'Old Club' },
    })

    useWorkspaceContext.getState().reconcile(workspaces(['org-1']))

    expect(useWorkspaceContext.getState().active).toEqual({ type: 'personal' })
  })

  it('keeps an org the account still belongs to', () => {
    const active = { type: 'org', orgId: 'org-1', orgName: 'Scout Group 42' } as const
    useWorkspaceContext.setState({ active })

    useWorkspaceContext.getState().reconcile(workspaces(['org-1']))

    expect(useWorkspaceContext.getState().active).toEqual(active)
  })

  it('picks up a rename that happened elsewhere', () => {
    useWorkspaceContext.setState({
      active: { type: 'org', orgId: 'org-1', orgName: 'Old name' },
    })

    useWorkspaceContext.getState().reconcile(workspaces(['org-1'], 'New name'))

    expect(useWorkspaceContext.getState().active).toEqual({
      type: 'org',
      orgId: 'org-1',
      orgName: 'New name',
    })
  })

  it('leaves a personal workspace alone even when the account has orgs', () => {
    useWorkspaceContext.getState().reconcile(workspaces(['org-1']))
    expect(useWorkspaceContext.getState().active).toEqual({ type: 'personal' })
  })

  it('falls back to personal when the account belongs to no org at all', () => {
    useWorkspaceContext.setState({
      active: { type: 'org', orgId: 'org-1', orgName: 'Scout Group 42' },
    })

    useWorkspaceContext.getState().reconcile(workspaces([]))

    expect(useWorkspaceContext.getState().active).toEqual({ type: 'personal' })
  })
})
