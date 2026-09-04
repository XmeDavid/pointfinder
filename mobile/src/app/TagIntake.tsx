import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from './services'
import { listenForTags } from '../native/nfc'
import { listenForLinks } from '../native/deepLinks'

/**
 * The tag is the front door: a tap from the lock screen, the home screen, or inside the
 * app all land on the same base screen. Without a player session the tap leads to Join.
 */
export function TagIntake() {
  const auth = useAuth()
  const navigate = useNavigate()
  const isPlayer = auth.kind === 'player'

  useEffect(() => {
    let disposed = false
    const unsubs: Array<() => void> = []
    const open = (baseId: string, token: string | null | undefined) => {
      if (isPlayer) navigate(`/base/${encodeURIComponent(baseId)}?token=${encodeURIComponent(token ?? '')}`)
      else if (auth.kind === 'none') navigate('/join')
    }
    void listenForTags((tag) => open(tag.baseId, tag.token)).then((off) => (disposed ? off() : unsubs.push(off)))
    void listenForLinks((link) => { if (link.kind === 'tag') open(link.tag.baseId, link.tag.token) }).then((off) => (disposed ? off() : unsubs.push(off)))
    return () => { disposed = true; unsubs.forEach((f) => f()) }
  }, [isPlayer, auth.kind, navigate])

  return null
}
