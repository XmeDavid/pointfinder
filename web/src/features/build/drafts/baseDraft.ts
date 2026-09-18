import type { Base } from '@/types'
import { parseCheckInRadiusInput, type CheckInMethod } from '@/types/checkIn'

/** The editable part of a base, as the operator types it. */
export interface BaseDraftFields {
  name: string
  description: string
  lat: string
  lng: string
  hidden: boolean
  method: CheckInMethod
  radius: string
}

export function baseDraftFields(base: Base): BaseDraftFields {
  return {
    name: base.name ?? '',
    description: base.description ?? '',
    lat: base.lat?.toString() ?? '',
    lng: base.lng?.toString() ?? '',
    hidden: base.hidden ?? false,
    method: base.checkInMethod ?? 'NFC',
    radius: base.checkInRadiusM != null ? String(base.checkInRadiusM) : '',
  }
}

export function coordinatesAreValid(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

export function baseDraftIsValid(fields: BaseDraftFields): boolean {
  const radius = parseCheckInRadiusInput(fields.radius)
  return fields.name.trim().length > 0 && fields.lat.trim().length > 0 && fields.lng.trim().length > 0 && coordinatesAreValid(Number(fields.lat), Number(fields.lng)) && radius.ok
}
