import type { ComponentType, SVGProps } from 'react'
import { MapPin, Nfc, QrCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CheckInMethod, CheckInVerification } from '@/types/checkIn'
import { StatusBadge, type StatusBadgeTone } from './StatusBadge'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

/**
 * Method icons stay local to the web canonical badge. They are deliberately
 * not added to `design-system/icons.json`, whose generators also feed the
 * legacy Swift and Compose apps that cannot play QR or location bases.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const checkInMethodIcons: Record<CheckInMethod, IconComponent> = {
  NFC: Nfc,
  QR: QrCode,
  LOCATION: MapPin,
}

/** Blue = tag/base signal, indigo = secondary category, green = presence proven. */
// eslint-disable-next-line react-refresh/only-export-components
export const checkInMethodTone: Record<CheckInMethod, StatusBadgeTone> = {
  NFC: 'info',
  QR: 'override',
  LOCATION: 'success',
}

const methodLabelKey: Record<CheckInMethod, string> = {
  NFC: 'checkIn.methodNfc',
  QR: 'checkIn.methodQr',
  LOCATION: 'checkIn.methodLocation',
}

const verificationTone: Record<CheckInVerification, StatusBadgeTone> = {
  VERIFIED: 'success',
  CLAIMED: 'warning',
  OPERATOR: 'override',
}

const verificationLabelKey: Record<CheckInVerification, string> = {
  VERIFIED: 'checkIn.verificationVerified',
  CLAIMED: 'checkIn.verificationClaimed',
  OPERATOR: 'checkIn.verificationOperator',
}

/** Localized method name, for callers that need the raw string. */
// eslint-disable-next-line react-refresh/only-export-components
export function useCheckInMethodLabel(): (method: CheckInMethod) => string {
  const { t } = useTranslation()
  return (method) => t(methodLabelKey[method])
}

export interface CheckInMethodIconProps {
  method: CheckInMethod
  className?: string
  'data-testid'?: string
}

/** Icon-only method marker with an accessible label, for dense rows. */
export function CheckInMethodIcon({ method, className, ...props }: CheckInMethodIconProps) {
  const { t } = useTranslation()
  const Icon = checkInMethodIcons[method]
  return (
    <Icon
      className={className ?? 'h-3.5 w-3.5 shrink-0'}
      role="img"
      aria-label={t(methodLabelKey[method])}
      data-testid={props['data-testid']}
    />
  )
}

export interface CheckInMethodBadgeProps {
  method: CheckInMethod
  size?: 'sm' | 'md'
  className?: string
  'data-testid'?: string
}

export function CheckInMethodBadge({ method, size, className, ...props }: CheckInMethodBadgeProps) {
  const { t } = useTranslation()
  const Icon = checkInMethodIcons[method]
  return (
    <StatusBadge
      tone={checkInMethodTone[method]}
      size={size}
      className={className}
      data-testid={props['data-testid']}
      label={
        <span className="inline-flex items-center gap-1">
          <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          {t(methodLabelKey[method])}
        </span>
      }
    />
  )
}

export interface CheckInVerificationBadgeProps {
  verification: CheckInVerification
  size?: 'sm' | 'md'
  className?: string
  'data-testid'?: string
}

/**
 * Only the exceptional verifications are shown. A VERIFIED row is the norm and
 * would add noise to every feed line.
 */
export function CheckInVerificationBadge({
  verification,
  size,
  className,
  ...props
}: CheckInVerificationBadgeProps) {
  const { t } = useTranslation()
  if (verification === 'VERIFIED') return null
  return (
    <StatusBadge
      tone={verificationTone[verification]}
      size={size}
      className={className}
      data-testid={props['data-testid']}
      label={t(verificationLabelKey[verification])}
    />
  )
}
