import { create } from 'zustand'

/**
 * An app-wide "you arrived" message. The detector fires while any screen is open,
 * so the notice has to live outside the base screen. `hidden` distinguishes a base
 * the team already knew about from one they just discovered.
 */
export interface ArrivalNotice {
  id: string
  baseId: string
  /** Null while the name is unknown, which is the offline case for a hidden base. */
  title: string | null
  state: 'synced' | 'queued'
  hidden: boolean
}

interface NoticeState {
  notices: ArrivalNotice[]
}

const useNoticeStore = create<NoticeState>(() => ({ notices: [] }))

/** Add one notice. Repeats for the same base replace the earlier one so the list stays short. */
export function pushArrivalNotice(notice: Omit<ArrivalNotice, 'id'>): string {
  const id = crypto.randomUUID()
  useNoticeStore.setState((s) => ({ notices: [...s.notices.filter((n) => n.baseId !== notice.baseId), { ...notice, id }] }))
  return id
}

export function dismissArrivalNotice(id: string): void {
  useNoticeStore.setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
}

export function clearArrivalNotices(): void {
  useNoticeStore.setState({ notices: [] })
}

/** Non-hook read for the runtime detector and its tests. */
export function getArrivalNotices(): ArrivalNotice[] {
  return useNoticeStore.getState().notices
}

export function useArrivalNotices(): { notices: ArrivalNotice[]; dismiss: (id: string) => void } {
  const notices = useNoticeStore((s) => s.notices)
  return { notices, dismiss: dismissArrivalNotice }
}
