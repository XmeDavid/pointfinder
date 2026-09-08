import { useEffect, useRef } from 'react'
import { isForeground, onAppVisibility } from '@/platform/lifecycle'
import { watchDeviceOrientation } from '@/platform/orientation'
import { clampTilt, nearestAngle } from './pose'
import './compass.css'

/** Legacy welcome artwork: decorative only, never a navigation instrument. */
export function WelcomeCompass({ animated = true }: { animated?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const rose = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = root.current!
    const disc = rose.current!
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let stopSensors: (() => void) | undefined
    let frame = 0
    let running = false
    let rotation = 0
    let targetRotation = 0
    let pitch = 0
    let roll = 0
    let targetPitch = 0
    let targetRoll = 0
    let lastHeadingAt = -Infinity
    let previous = 0
    let dragId: number | undefined
    let lastX = 0
    let lastY = 0
    const drag = { rotation: 0, pitch: 0, roll: 0 }
    const offset = { rotation: 0, pitch: 0, roll: 0 }
    const velocity = { rotation: 0, pitch: 0, roll: 0 }

    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.032)
      previous = now
      // A missing/stale magnetometer still gets the familiar two-minute idle turn.
      if (now - lastHeadingAt > 2000) targetRotation += dt * 3
      const ease = 1 - Math.exp(-10 * dt)
      rotation += (targetRotation - rotation) * ease
      pitch += (targetPitch - pitch) * ease
      roll += (targetRoll - roll) * ease
      for (const axis of ['rotation', 'pitch', 'roll'] as const) {
        velocity[axis] += ((drag[axis] - offset[axis]) * 100 - velocity[axis] * 15) * dt
        offset[axis] += velocity[axis] * dt
      }
      disc.style.transform = `rotateX(${clampTilt(pitch + offset.pitch)}deg) rotateY(${clampTilt(roll + offset.roll)}deg) rotateZ(${rotation + offset.rotation}deg)`
      frame = requestAnimationFrame(tick)
    }
    const release = () => {
      if (dragId !== undefined && host.hasPointerCapture(dragId)) host.releasePointerCapture(dragId)
      dragId = undefined
      drag.rotation = drag.pitch = drag.roll = 0
    }
    const update = () => {
      const next = animated && !reduced.matches && isForeground()
      host.dataset.motion = next ? 'active' : 'paused'
      if (next === running) return
      running = next
      if (next) {
        previous = performance.now()
        lastHeadingAt = -Infinity
        stopSensors = watchDeviceOrientation((pose) => {
          if (pose.heading !== null) {
            targetRotation = nearestAngle(targetRotation, -pose.heading)
            lastHeadingAt = performance.now()
          }
          targetPitch = clampTilt(pose.pitch)
          targetRoll = clampTilt(-pose.roll)
        })
        frame = requestAnimationFrame(tick)
      } else {
        stopSensors?.()
        stopSensors = undefined
        cancelAnimationFrame(frame)
        release()
        // Reduced motion means no sensor, idle, pulse, or spring movement.
        if (reduced.matches) disc.style.transform = 'none'
      }
    }
    const down = (event: PointerEvent) => {
      if (!running || !event.isPrimary || event.button !== 0) return
      dragId = event.pointerId
      lastX = event.clientX
      lastY = event.clientY
      host.setPointerCapture(event.pointerId)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== dragId) return
      const rect = host.getBoundingClientRect()
      const x = event.clientX - rect.left - rect.width / 2
      const y = event.clientY - rect.top - rect.height / 2
      const distance = Math.hypot(x, y)
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY
      if (distance < 1) return
      drag.rotation += (x * dy - y * dx) / distance * 0.4
      const radial = (x * dx + y * dy) / distance
      drag.pitch = clampTilt(drag.pitch + radial * y / distance * 0.3)
      drag.roll = clampTilt(drag.roll - radial * x / distance * 0.3)
    }
    reduced.addEventListener('change', update)
    const stopVisibility = onAppVisibility(update)
    host.addEventListener('pointerdown', down)
    host.addEventListener('pointermove', move)
    host.addEventListener('pointerup', release)
    host.addEventListener('pointercancel', release)
    host.addEventListener('lostpointercapture', release)
    update()
    return () => {
      cancelAnimationFrame(frame)
      stopSensors?.()
      stopVisibility()
      reduced.removeEventListener('change', update)
      host.removeEventListener('pointerdown', down)
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerup', release)
      host.removeEventListener('pointercancel', release)
      host.removeEventListener('lostpointercapture', release)
      release()
    }
  }, [animated])

  return (
    <div ref={root} className="welcome-compass relative shrink-0 select-none text-primary" data-testid="welcome-compass" aria-hidden="true">
      {[0, 1.5, 3].map((delay) => (
        <div key={delay} className="welcome-compass-pulse pointer-events-none absolute inset-0 rounded-full border border-primary/20" style={{ animationDelay: `${delay}s` }} />
      ))}
      <div ref={rose} className="relative h-full w-full" data-testid="welcome-compass-rose">
        <svg viewBox="0 0 200 200" className="h-full w-full" fill="none">
          <circle cx="100" cy="100" r="96" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
          <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="0.4" opacity="0.15" />
          {Array.from({ length: 36 }, (_, i) => {
            const angle = i * Math.PI / 18
            const major = i % 9 === 0
            const minor = i % 3 === 0
            const inner = major ? 78 : minor ? 83 : 86
            return <line key={i} x1={100 + 90 * Math.sin(angle)} y1={100 - 90 * Math.cos(angle)} x2={100 + inner * Math.sin(angle)} y2={100 - inner * Math.cos(angle)} stroke="currentColor" strokeWidth={major ? 1.6 : minor ? 0.8 : 0.4} opacity={major ? 0.6 : minor ? 0.3 : 0.15} />
          })}
          <polygon points="100,58 76,100 100,142 124,100" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />
          {[0, 90, 180, 270].map((angle) => (
            <g key={angle} transform={`rotate(${angle} 100 100)`}>
              <path d="M100 48 93 100 107 100Z" fill="var(--pf-color-action-primaryStrong)" opacity={angle === 0 ? 0.85 : 0.3} />
              <path d="M100 48 100 100 93 100Z" fill="currentColor" opacity={angle === 0 ? 0.6 : 0.2} />
            </g>
          ))}
          <g fill="currentColor" fontSize="10" fontWeight="700" textAnchor="middle" dominantBaseline="central">
            <text x="100" y="36" opacity="0.7">N</text>
            <text x="100" y="168" opacity="0.45">S</text>
            <text x="33" y="100" opacity="0.45">W</text>
            <text x="167" y="100" opacity="0.45">E</text>
          </g>
          <circle cx="100" cy="100" r="5" fill="currentColor" opacity="0.8" />
          <circle cx="100" cy="100" r="2.5" fill="var(--color-background)" />
        </svg>
      </div>
    </div>
  )
}
