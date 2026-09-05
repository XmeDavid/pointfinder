import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { parseTagUrl, type TagPayload } from '@pointfinder/game-core'
import { useAuth } from './services'
import { useAuthStore } from '@/lib/auth/store'
import { listenForTags } from '@/platform/nfc'
import { listenForLinks } from '@/platform/deepLinks'
import { kv } from '@/platform'

const PENDING_TAG = 'pending-tag'
export function TagIntake() {
  const auth = useAuth()
  const operator = useAuthStore((s) => s.isAuthenticated)
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    let disposed = false
    const controller = new AbortController()
    const unsubs: Array<() => void> = []
    const open = async (tag: TagPayload) => {
      if (disposed || operator) return
      if (auth.kind === 'player') {
        await kv.remove(PENDING_TAG)
        if (!disposed) navigate(`/base/${encodeURIComponent(tag.baseId)}?token=${encodeURIComponent(tag.token ?? '')}`, { replace: true })
      } else {
        await kv.set(PENDING_TAG, JSON.stringify(tag))
        if (!disposed) navigate('/join', { replace: true })
      }
    }
    const register = (off: () => void) => disposed ? off() : unsubs.push(off)
    void listenForTags((tag) => { void open(tag).catch(console.error) }, { signal: controller.signal }).then(register).catch(console.error)
    void listenForLinks((link) => {
      if (link.kind === 'tag') void open(link.tag).catch(console.error)
      if (link.kind === 'dashboard' && !disposed) navigate('/dashboard')
    }, { signal: controller.signal }).then(register).catch(console.error)
    if (location.pathname.startsWith('/tag/')) {
      const tag = parseTagUrl(`https://pointfinder.pt${location.pathname}${location.search}`)
      if (tag) void open(tag).catch(console.error)
      else navigate('/join', { replace: true })
    } else if (auth.kind === 'player') {
      void kv.get(PENDING_TAG).then((pending) => { if (pending && !disposed) return open(JSON.parse(pending) as TagPayload) }).catch(console.error)
    }
    return () => { disposed = true; controller.abort(); unsubs.forEach((off) => off()) }
  }, [auth.kind, operator, navigate, location.pathname, location.search])
  return <Outlet />
}
