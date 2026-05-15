import {
  AlertTriangle,
  ClipboardList,
  Clock,
  Layers,
  MapPinned,
  Radio,
} from 'lucide-react'
import type { ReactNode } from 'react'
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
  return (
    <main className="min-h-screen overflow-auto bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Development only
          </p>
          <h1 className="text-xl font-semibold text-foreground">
            PointFinder Visual System Harness
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Static fixtures for canonical web components. This route does not
            fetch backend data.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <HarnessSection title="Buttons">
            <div className="flex flex-wrap items-center gap-2">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button loading>Loading</Button>
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
        </div>
      </div>
    </main>
  )
}
