import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthState } from '@pointfinder/api'
import { createServices, type AppServices } from './client'

const ServicesContext = createContext<AppServices | null>(null)
const AuthContext = createContext<AuthState | null>(null)

export function ServicesProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const services = useMemo(() => createServices(), [])
  const [auth, setAuth] = useState<AuthState | null>(null)

  useEffect(() => {
    const unsubscribe = services.client.session.subscribe(setAuth)
    services.client.session.restore().then(setAuth)
    return unsubscribe
  }, [services])

  if (!auth) return <>{fallback}</>
  return (
    <ServicesContext.Provider value={services}>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </ServicesContext.Provider>
  )
}

export function useServices(): AppServices {
  const s = useContext(ServicesContext)
  if (!s) throw new Error('useServices outside ServicesProvider')
  return s
}

export function useAuth(): AuthState {
  const a = useContext(AuthContext)
  if (!a) throw new Error('useAuth outside ServicesProvider')
  return a
}
