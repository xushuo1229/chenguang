import { authHandlers } from './auth'
import { syncHandlers } from './sync'
import { agentHomeHandlers } from './agentHome'
import { personalAgentHandlers } from './personalAgent'
import { knowledgeHandlers } from './knowledge'

export const handlers = [
  ...authHandlers,
  ...syncHandlers,
  ...agentHomeHandlers,
  ...personalAgentHandlers,
  ...knowledgeHandlers,
]
