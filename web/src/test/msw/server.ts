import { setupServer } from 'msw/node'
import { authHandlers } from './handlers/auth'
import { playerHandlers } from './handlers/player'
import { gamesHandlers } from './handlers/games'
import { basesHandlers } from './handlers/bases'
import { stagesHandlers } from './handlers/stages'
import { tagsHandlers } from './handlers/tags'
import { variablesHandlers } from './handlers/variables'
import { monitoringHandlers } from './handlers/monitoring'
import { challengesHandlers } from './handlers/challenges'
import { teamsHandlers } from './handlers/teams'
import { assignmentsHandlers } from './handlers/assignments'
import { submissionsHandlers } from './handlers/submissions'
import { rescueHandlers } from './handlers/rescue'
import { notificationsHandlers } from './handlers/notifications'
import { tutorialsHandlers } from './handlers/tutorials'
import { billingHandlers } from './handlers/billing'
import { workspacesHandlers } from './handlers/workspaces'
import { orgsHandlers } from './handlers/orgs'
import { adminHandlers } from './handlers/admin'

export const server = setupServer(
  ...authHandlers,
  ...playerHandlers,
  ...gamesHandlers,
  ...basesHandlers,
  ...stagesHandlers,
  ...tagsHandlers,
  ...variablesHandlers,
  ...monitoringHandlers,
  ...challengesHandlers,
  ...teamsHandlers,
  ...assignmentsHandlers,
  ...submissionsHandlers,
  ...rescueHandlers,
  ...notificationsHandlers,
  ...tutorialsHandlers,
  ...billingHandlers,
  ...workspacesHandlers,
  ...orgsHandlers,
  ...adminHandlers,
)
