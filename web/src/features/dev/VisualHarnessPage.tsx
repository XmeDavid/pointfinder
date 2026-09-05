import {
  AlertTriangle,
  ClipboardList,
  Clock,
  Layers,
  MapPinned,
  Radio,
} from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import {
  ActivityEventBadge,
  BaseProgressBadge,
  GameStatusBadge,
  LocationSignalBadge,
  NfcStatusBadge,
  OverrideBadge,
  StatusBadge,
  SubmissionStatusBadge,
  SyncStatusBadge,
  type BaseProgressStatus,
  type ActivityEventStatus,
  type LocationSignalStatus,
  type NfcStatus,
  type SyncStatus,
} from '@/components/status'
import {
  baseStatusMarkerTone,
  markerToneClass,
} from '@/components/map/markerStyles'
import {
  InspectorPanel,
  OverlayPanel,
  SurfacePanel,
} from '@/components/layout'
import type { GameStatus, SubmissionStatus } from '@/types'
import { designSystemVersion } from '@/generated/designTokens'
import { previewScenarios } from '@/generated/previewScenarios'
import { ResultsStat, ResultsSummary } from '@/components/results/ResultsSummary'
import { BroadcastPanel } from '@/components/broadcast/BroadcastPanel'
import { ListDetailLayout } from '@/components/layout/ListDetailLayout'
import { NfcLinkControl } from '@/components/nfc/NfcLinkControl'
import { BaseSequenceBadge } from '@/components/status/BaseSequenceBadge'
import { BaseRouteNotice } from '@/features/player/components/BaseRouteNotice'
import { buildLogbook } from '@/features/player/logbook'

const gameStatuses: GameStatus[] = ['setup', 'live', 'ended']
const submissionStatuses: SubmissionStatus[] = [
  'pending',
  'approved',
  'correct',
  'rejected',
]
const baseProgressStatuses: BaseProgressStatus[] = [
  'not_visited',
  'checked_in',
  'submitted',
  'completed',
  'rejected',
]
const syncStatuses: SyncStatus[] = [
  'online',
  'offline',
  'sync_pending',
  'sync_failed',
]
const nfcStatuses: NfcStatus[] = ['linked', 'missing']
const activityEventStatuses: ActivityEventStatus[] = [
  'check_in',
  'submission',
  'approval',
  'rejection',
]
const locationSignalStatuses: LocationSignalStatus[] = [
  'active',
  'stale',
  'unknown',
]

function SafeAreaPreview() {
  const [landscape, setLandscape] = useState(false)
  const insets = {
    '--safe-top': landscape ? '0px' : '59px',
    '--safe-bottom': landscape ? '21px' : '34px',
    '--safe-left': landscape ? '44px' : '0px',
    '--safe-right': landscape ? '44px' : '0px',
  } as CSSProperties
  return (
    <div className="space-y-3">
      <Button variant="outline" onClick={() => setLandscape(!landscape)}>{landscape ? 'Portrait' : 'Landscape'}</Button>
      <div className="relative h-80 overflow-hidden rounded-lg border border-border bg-muted" style={insets}>
        <div className="absolute inset-0 grid place-items-center text-muted-foreground">Edge-to-edge map surface</div>
        <div className="workspace-controls">
          <OverlayPanel className="absolute inset-x-2 top-2" padding="sm">Game controls inside the safe area</OverlayPanel>
          <Button className="absolute bottom-3 left-1/2 -translate-x-1/2">Scan a tag</Button>
        </div>
      </div>
    </div>
  )
}

function ListDetailPreview() {
  const [selected, setSelected] = useState(false)
  return (
    <div className="flex h-80 overflow-hidden rounded-lg border border-border">
      <ListDetailLayout selected={selected} onBack={() => setSelected(false)} list={
        <Button variant="ghost" className="m-2" onClick={() => setSelected(true)}>Forest checkpoint</Button>
      }>
        <div className="p-4 text-sm">{selected ? 'Selected checkpoint details use the full phone width. Back returns to the list.' : 'Select a checkpoint to view details.'}</div>
      </ListDetailLayout>
    </div>
  )
}

function HarnessSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <SurfacePanel className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </SurfacePanel>
  )
}

export function VisualHarnessPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  return (
    <main className={`${theme === 'dark' ? 'dark' : ''} min-h-screen overflow-auto bg-background p-4 text-foreground md:p-6`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Development only · system {designSystemVersion}
            </p>
            <h1 className="text-xl font-semibold text-foreground">
              PointFinder Visual System Harness
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Canonical, backend-free fixtures shared with native preview
              scenarios.
            </p>
          </div>
          <div className="flex gap-2" aria-label="Preview theme">
            <Button variant={theme === 'light' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('light')}>Light</Button>
            <Button variant={theme === 'dark' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('dark')}>Dark</Button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <HarnessSection title="Base route numbers preserve progress meaning">
            <div className="space-y-3">
              {baseProgressStatuses.map((status, index) => (
                <div key={status} className="flex flex-wrap items-center gap-2">
                  <BaseSequenceBadge sequenceNumber={index + 1} />
                  <span className="min-w-0 flex-1 text-sm break-words">{index === 2 ? 'The checkpoint beside the old wooden bridge at the forest entrance' : `Checkpoint ${index + 1}`}</span>
                  <BaseProgressBadge status={status} />
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <BaseSequenceBadge sequenceNumber={99} />
                <SyncStatusBadge status="sync_pending" />
                <Button variant="outline" disabled>Arrange route · setup only</Button>
              </div>
            </div>
          </HarnessSection>
          <HarnessSection title="Player route guidance and hidden destination">
            <BaseRouteNotice route={{ enabled: true, nextRequiredBaseNumber: 2, provisionalCheckInIds: [] }}
              logbook={buildLogbook([{ baseId: 'preview-base', sequenceNumber: 2, challengeTitle: 'Find the inscription beside the old forest bridge', lat: 0, lng: 0, nfcLinked: true, status: 'not_visited' }], [], [])} />
            <BaseRouteNotice route={{ enabled: true, nextRequiredBaseNumber: 2, provisionalCheckInIds: [] }}
              logbook={null} missingNumber={2} />
            <BaseRouteNotice route={{ enabled: true, nextRequiredBaseNumber: null, provisionalCheckInIds: [] }}
              logbook={null} />
          </HarnessSection>
          <HarnessSection title="Native safe areas">
            <SafeAreaPreview />
          </HarnessSection>
          <HarnessSection title="Phone list and detail navigation">
            <ListDetailPreview />
          </HarnessSection>
          <HarnessSection title="Buttons">
            <div className="flex flex-wrap items-center gap-2">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
            </div>
          </HarnessSection>

          <HarnessSection title="Canonical Preview Scenarios">
            <div className="grid gap-2 sm:grid-cols-2">
              {previewScenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className={`rounded-lg border p-3 ${scenario.id === 'selected' ? 'border-primary bg-primary/10' : scenario.id === 'destructive' || scenario.id === 'error' ? 'border-destructive/30 bg-destructive/10' : 'border-border bg-muted'}`}
                >
                  <p className="text-sm font-medium text-foreground">{scenario.label}</p>
                  <p className="text-xs text-muted-foreground">{scenario.description}</p>
                </div>
              ))}
            </div>
          </HarnessSection>

          <HarnessSection title="Game Status Badges">
            <div className="flex flex-wrap gap-2">
              {gameStatuses.map((status) => (
                <GameStatusBadge
                  key={status}
                  status={status}
                  elapsed={status === 'live' ? '00:42:13' : null}
                />
              ))}
            </div>
          </HarnessSection>

          <HarnessSection title="Submission Status Badges">
            <div className="flex flex-wrap gap-2">
              {submissionStatuses.map((status) => (
                <SubmissionStatusBadge key={status} status={status} />
              ))}
            </div>
          </HarnessSection>

          <HarnessSection title="Base Progress Badges">
            <div className="flex flex-wrap gap-2">
              {baseProgressStatuses.map((status) => (
                <BaseProgressBadge key={status} status={status} />
              ))}
            </div>
          </HarnessSection>

          <HarnessSection title="Sync And Offline Badges">
            <div className="flex flex-wrap gap-2">
              {syncStatuses.map((status) => (
                <SyncStatusBadge key={status} status={status} />
              ))}
            </div>
          </HarnessSection>

          <HarnessSection title="NFC And Override Badges">
            <div className="flex flex-wrap gap-2">
              {nfcStatuses.map((status) => (
                <NfcStatusBadge key={status} status={status} />
              ))}
              <OverrideBadge />
              <OverrideBadge label="Unlock override" />
            </div>
          </HarnessSection>

          <HarnessSection title="Operator NFC Link Controls">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <NfcStatusBadge status="missing" />
                <NfcLinkControl
                  gameId="preview-game"
                  base={{ id: 'preview-unlinked', gameId: 'preview-game', name: 'Forest gate', description: '', lat: 0, lng: 0, nfcLinked: false, nfcToken: 'preview-token', hidden: false }}
                />
              </div>
              <div className="space-y-2">
                <NfcStatusBadge status="linked" />
                <NfcLinkControl
                  gameId="preview-game"
                  base={{ id: 'preview-linked', gameId: 'preview-game', name: 'Old mill', description: '', lat: 0, lng: 0, nfcLinked: true, nfcToken: 'preview-token', hidden: false }}
                />
              </div>
            </div>
          </HarnessSection>

          <HarnessSection title="Command Status Badges">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {activityEventStatuses.map((status) => (
                  <ActivityEventBadge key={status} status={status} />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {locationSignalStatuses.map((status) => (
                  <LocationSignalBadge key={status} status={status} />
                ))}
              </div>
            </div>
          </HarnessSection>

          <HarnessSection title="Command Marker Tokens">
            <div className="flex flex-wrap items-center gap-5">
              {baseProgressStatuses.map((status) => {
                const tone = baseStatusMarkerTone[status]
                const markerClass = markerToneClass[tone]

                return (
                  <div key={status} className="flex items-center gap-2">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="7"
                        className={`${markerClass.fill} ${markerClass.stroke}`}
                        strokeWidth="2"
                      />
                    </svg>
                    <BaseProgressBadge status={status} />
                  </div>
                )
              })}
              <div className="flex items-center gap-2">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <polygon
                    points="10,2 18,18 2,18"
                    className="fill-info stroke-info"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                <LocationSignalBadge status="active" />
              </div>
            </div>
          </HarnessSection>

          <HarnessSection title="Feedback States">
            <div className="grid gap-3 md:grid-cols-3">
              <SurfacePanel padding="none" className="min-h-48">
                <EmptyState
                  icon={<ClipboardList className="h-5 w-5" aria-hidden="true" />}
                  title="No submissions"
                  description="Reviewed and pending submissions will appear here."
                  density="compact"
                />
              </SurfacePanel>
              <SurfacePanel padding="none" className="min-h-48">
                <ErrorState
                  title="Could not load submissions"
                  description="Check the connection and try again."
                  onRetry={() => undefined}
                />
              </SurfacePanel>
              <SurfacePanel padding="none" className="min-h-48">
                <LoadingState label="Loading command state" />
              </SurfacePanel>
            </div>
          </HarnessSection>

          <HarnessSection title="SurfacePanel Variants">
            <div className="grid gap-3 md:grid-cols-2">
              <SurfacePanel className="space-y-2">
                <StatusBadge tone="info" label="Default surface" />
                <p className="text-sm text-muted-foreground">
                  Standard operational panel with restrained radius.
                </p>
              </SurfacePanel>
              <SurfacePanel elevation="panel" className="space-y-2">
                <StatusBadge tone="success" label="Panel elevation" />
                <p className="text-sm text-muted-foreground">
                  Tokenized panel shadow for subtle separation.
                </p>
              </SurfacePanel>
            </div>
          </HarnessSection>

          <HarnessSection title="OverlayPanel">
            <div className="relative min-h-48 overflow-hidden rounded-lg border border-border bg-muted p-4">
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                Map/content backdrop fixture
              </div>
              <OverlayPanel className="relative max-w-sm space-y-3">
                <div className="flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-info" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Base Bravo
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <BaseProgressBadge status="checked_in" />
                  <NfcStatusBadge status="linked" />
                </div>
              </OverlayPanel>
            </div>
          </HarnessSection>

          <HarnessSection title="InspectorPanel Shell">
            <InspectorPanel
              title="Team Pine"
              subtitle="Last seen near Base Bravo"
              actions={<SyncStatusBadge status="online" />}
              footer={
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm">
                    Message
                  </Button>
                  <Button size="sm">Open team</Button>
                </div>
              }
              className="min-h-80"
              onClose={() => undefined}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <BaseProgressBadge status="submitted" />
                  <OverrideBadge label="Manual check-in" />
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    Pending review for 4 minutes
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Radio className="h-4 w-4" aria-hidden="true" />
                    Realtime connection healthy
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Layers className="h-4 w-4" aria-hidden="true" />
                    Stage 2 active
                  </div>
                </div>
              </div>
            </InspectorPanel>
          </HarnessSection>

          <HarnessSection title="Alert Tone">
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="text-sm">
                Destructive tone fixture for failed or blocked operational
                states.
              </p>
            </div>
          </HarnessSection>

          <HarnessSection title="Results And Administration Summaries">
            <ResultsSummary>
              <ResultsStat label="Teams" value="12" />
              <ResultsStat label="Completion" value="84%" tone="success" />
              <ResultsStat label="Pending" value="3" tone="pending" />
              <ResultsStat label="Storage" value="2.4 GB" />
            </ResultsSummary>
          </HarnessSection>

          <HarnessSection title="Broadcast Panels">
            <div className="dark grid min-h-56 gap-3 bg-background p-3 text-foreground sm:grid-cols-2">
              <BroadcastPanel title="Leaderboard" leading={<Radio className="h-4 w-4 text-success" />}>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>North Ridge</span><strong>120</strong></div>
                  <div className="flex justify-between"><span>River Team</span><strong>95</strong></div>
                </div>
              </BroadcastPanel>
              <BroadcastPanel title="Bases">
                <EmptyState density="compact" title="No base activity yet" />
              </BroadcastPanel>
            </div>
          </HarnessSection>
        </div>
      </div>
    </main>
  )
}
