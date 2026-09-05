import { useState, useEffect } from 'react'
import { formatElapsed } from '@/lib/utils/dates'

export function useElapsedTimer(startIso: string | null): string {
  const [elapsed, setElapsed] = useState(() =>
    startIso ? formatElapsed(startIso) : '00:00:00'
  )
  useEffect(() => {
    if (!startIso) return
    const tick = () => setElapsed(formatElapsed(startIso))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [startIso])
  return elapsed
}
