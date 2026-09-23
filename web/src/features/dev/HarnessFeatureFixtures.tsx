import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ExploreGameResponse, PublicationReportResponse } from '@pointfinder/api'
import { ChoiceOptionsEditor } from '@/components/inputs/ChoiceOptionsEditor'
import { AnswerTypeBadge } from '@/components/status'
import { ContentLanguageTag } from '@/components/data/ContentLanguageTag'
import { ChoiceAnswer } from '@/features/player/components/ChoiceAnswer'
import { SubmissionResult } from '@/features/player/components/SubmissionResult'
import { ChoiceReview } from '@/features/review/ChoiceReview'
import { DiscoveryCard } from '@/features/user-home/DiscoveryCard'
import { BuildShortcuts } from '@/features/build/BuildShortcuts'
import { SectionChooser } from '@/features/build/SectionChooser'
import { ReportListingForm } from '@/features/user-home/ReportListingForm'
import { AdminReports } from '@/features/admin/AdminReports'
import { ADMIN_REPORTS_QUERY_KEY } from '@/lib/api/admin'
import type { ChoiceOption } from '@/types'
import type { DrawerTab } from '@/stores/workspace'

const answerTypes = ['text', 'file', 'none', 'single_choice', 'multiple_choice'] as const

function Label({ children }: { children: string }) {
  return <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">{children}</p>
}

/** OW-34 fixtures: organizer options (valid, refused), player picker, closed result and review. */
export function ChoiceFixtures() {
  const [single, setSingle] = useState<ChoiceOption[]>([
    { id: 'a', text: 'Oak', correct: true },
    { id: 'b', text: 'Pine', correct: false },
    { id: 'c', text: 'A very long option that wraps across two lines on a phone in German or Portuguese', correct: false },
  ])
  const [multiple, setMultiple] = useState<ChoiceOption[]>([
    { id: 'a', text: 'Oak', correct: true },
    { id: 'b', text: 'oak', correct: true },
  ])
  const playerOptions = single.filter((o) => o.id).map((o) => ({ id: o.id!, text: o.text }))
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="harness-choice">
      <div className="rounded-md border border-border bg-card p-3">
        <Label>Organizer: single choice</Label>
        <ChoiceOptionsEditor answerType="single_choice" options={single} onChange={setSingle} />
      </div>
      <div className="rounded-md border border-border bg-card p-3">
        <Label>Organizer: refused (duplicate text)</Label>
        <ChoiceOptionsEditor answerType="multiple_choice" options={multiple} onChange={setMultiple} />
      </div>
      <div className="rounded-md border border-border bg-card p-3">
        <Label>Player: single choice</Label>
        <ChoiceAnswer options={playerOptions} multiple={false} busy={false} onSubmit={() => {}} />
      </div>
      <div className="rounded-md border border-border bg-card p-3">
        <Label>Player: multiple choice, sending</Label>
        <ChoiceAnswer options={playerOptions} multiple busy onSubmit={() => {}} />
      </div>
      <div className="rounded-md border border-border bg-card p-3">
        <Label>Player: wrong answer closes the question</Label>
        <SubmissionResult outcome="rejected" finalAttempt />
      </div>
      <div className="space-y-3 rounded-md border border-border bg-card p-3">
        <Label>Operator review and answer types</Label>
        <ChoiceReview options={single} selectedOptionIds={['b']} answer="Pine" />
        <div className="flex flex-wrap gap-2">
          {answerTypes.map((type) => <AnswerTypeBadge key={type} answerType={type} />)}
        </div>
      </div>
    </div>
  )
}

const listing: ExploreGameResponse = {
  gameId: 'harness', title: 'Trilho da costa', summary: 'Follow the cliffs from the harbour to the lighthouse.', place: 'Nazaré',
  lat: null, lng: null, category: 'coast', organizer: 'Escuteiros de Nazaré', contentLanguage: 'pt', gameStatus: 'live',
  admission: 'open', joinable: true, featured: false, startDate: null, endDate: null, publishedAt: '2026-09-01T10:00:00Z',
  distanceKm: 2.4, joined: false, playerId: null,
}

/** OW-33 fixtures: named, unknown and uncommon content languages, and a discovery card. */
export function ContentLanguageFixtures() {
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="harness-content-language">
      <div className="space-y-2 rounded-md border border-border bg-card p-3 text-sm">
        <ContentLanguageTag code="pt" />
        <ContentLanguageTag code="rm" />
        <ContentLanguageTag code={null} showUnknown />
      </div>
      <div className="max-w-sm">
        <DiscoveryCard game={listing} onSelect={() => {}} />
      </div>
    </div>
  )
}

/** OW-36 fixtures: Build shortcuts and the phone section chooser. */
export function ContentSectionFixtures() {
  const [section, setSection] = useState<DrawerTab>('challenges')
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="harness-content-sections">
      <div className="rounded-md border border-border bg-card p-3">
        <Label>Build shortcuts</Label>
        <BuildShortcuts />
      </div>
      <div className="max-w-xs rounded-md border border-border bg-card p-3">
        <Label>Phone section chooser</Label>
        <SectionChooser active={section} onSelect={setSection} />
      </div>
    </div>
  )
}

const reports: PublicationReportResponse[] = [
  { id: 'r1', gameId: 'g1', gameName: 'Trilho da costa', listed: true, reason: 'unsafe', details: 'The route crosses the national road without a crossing.', reporterName: 'Ana', createdAt: '2026-09-20T10:00:00Z' },
  { id: 'r2', gameId: 'g1', gameName: 'Trilho da costa', listed: true, reason: 'misleading', details: null, reporterName: 'Rui', createdAt: '2026-09-21T08:30:00Z' },
  { id: 'r3', gameId: 'g2', gameName: 'A very long listing title that wraps across two lines in the admin list', listed: false, reason: 'spam', details: null, reporterName: 'Mia', createdAt: '2026-09-22T18:10:00Z' },
]

/** Seeded, never-refetching client so the admin review renders without a backend. */
function seededClient() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(ADMIN_REPORTS_QUERY_KEY, reports)
  return client
}

/** OW-06 fixtures: reporting a listing (online, offline) and the admin review of open reports. */
export function ModerationFixtures() {
  const [client] = useState(seededClient)
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="harness-moderation">
      <div className="rounded-md border border-border bg-card p-3">
        <Label>Report a listing</Label>
        <ReportListingForm title="Trilho da costa" online onSubmit={async () => {}} onBack={() => {}} />
      </div>
      <div className="rounded-md border border-border bg-card p-3">
        <Label>Report a listing, offline</Label>
        <ReportListingForm title="Trilho da costa" online={false} onSubmit={async () => {}} onBack={() => {}} />
      </div>
      <div className="rounded-md border border-border bg-card p-3 lg:col-span-2">
        <Label>Admin: open reports</Label>
        <QueryClientProvider client={client}>
          <AdminReports />
        </QueryClientProvider>
      </div>
    </div>
  )
}
