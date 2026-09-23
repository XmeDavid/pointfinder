import { useState } from 'react'
import type { ExploreGameResponse } from '@pointfinder/api'
import { ChoiceOptionsEditor } from '@/components/inputs/ChoiceOptionsEditor'
import { AnswerTypeBadge } from '@/components/status'
import { ContentLanguageTag } from '@/components/data/ContentLanguageTag'
import { ChoiceAnswer } from '@/features/player/components/ChoiceAnswer'
import { SubmissionResult } from '@/features/player/components/SubmissionResult'
import { ChoiceReview } from '@/features/review/ChoiceReview'
import { DiscoveryCard } from '@/features/user-home/DiscoveryCard'
import { BuildShortcuts } from '@/features/build/BuildShortcuts'
import { SectionChooser } from '@/features/build/SectionChooser'
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
