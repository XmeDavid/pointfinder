import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AuthState } from '@pointfinder/api'
import type { AppServices } from './client'
import { startPlayerRuntime } from './runtime'

const ServicesContext = createContext<AppServices | null>(null)
const AuthContext = createContext<AuthState | null>(null)
const AccountContext = createContext<AuthState | null>(null)
export function ServicesProvider({ children, services }: { children: ReactNode; services: AppServices }) {
  const [auth, setAuth] = useState<AuthState>(() => services.client.session.current)
  const queries = useQueryClient()
  useEffect(() => startPlayerRuntime(services, queries), [services, queries])
  useEffect(() => services.client.session.subscribe((state) => {
    // Snapshot/query caches must never survive switching players or roles.
    queries.clear()
    services.client.realtime.disconnect()
    setAuth(state)
  }), [services, queries])
  const [account, setAccount] = useState<AuthState>(() => services.account.session.current)
  useEffect(() => services.account.session.subscribe((state) => {
    // The account is a layer over the player session: only account-derived queries change.
    void queries.invalidateQueries({ queryKey: ['account'] })
    setAccount(state)
  }), [services, queries])
  return (
    <ServicesContext.Provider value={services}>
      <AuthContext.Provider value={auth}>
        <AccountContext.Provider value={account}>{children}</AccountContext.Provider>
      </AuthContext.Provider>
    </ServicesContext.Provider>
  )
}
// Providers and hooks share their contexts by design.
// eslint-disable-next-line react-refresh/only-export-components
export function useServices(): AppServices {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('useServices outside ServicesProvider')
  return services
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth outside ServicesProvider')
  return auth
}

/** The phone's signed-in account, if any. Independent of which game is open. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAccountSession(): AuthState {
  const account = useContext(AccountContext)
  if (!account) throw new Error('useAccountSession outside ServicesProvider')
  return account
}
