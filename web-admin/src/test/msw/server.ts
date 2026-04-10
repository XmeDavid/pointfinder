import { setupServer } from 'msw/node'
import { authHandlers } from './handlers/auth'
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

export const server = setupServer(
  ...authHandlers,
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
)
