import SwiftUI

// MARK: - Scan State

enum ScanAnimationState: Equatable {
    case idle
    case scanning
    case success
}

// MARK: - Animated Scan View

/// Animated NFC scan illustration driven by continuous time (no resets).
/// Three states: idle (gentle breathing), scanning (intensified), success (burst outward).
struct AnimatedScanView: View {
    let state: ScanAnimationState

    // Success burst animation
    @State private var burstScale: CGFloat = 1.0
    @State private var burstOpacity: CGFloat = 1.0
    @State private var flashOpacity: CGFloat = 0.0

    // Particles (generated once)
    @State private var particles: [ScanParticle] = []

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                let center = CGPoint(x: size.width / 2, y: size.height / 2)
                drawScene(context: context, center: center, size: size, time: t)
            }
        }
        .overlay {
            // Center icon (not drawn in Canvas — uses SF Symbols)
            centerIcon
        }
        .clipped(antialiased: false)
        .onAppear {
            generateParticles()
        }
        .onChange(of: state) { _, newState in
            if newState == .success {
                triggerSuccessBurst()
            } else if newState == .idle {
                // Reset burst state so animations are visible again
                burstScale = 1.0
                burstOpacity = 1.0
                flashOpacity = 0.0
            }
        }
    }

    // MARK: - Canvas Drawing

    private func drawScene(context: GraphicsContext, center: CGPoint, size: CGSize, time: Double) {
        let speedMultiplier: Double = state == .scanning ? 2.5 : 1.0
        let intensityMultiplier: Double = state == .scanning ? 1.5 : 1.0
        let burstFactor = state == .success ? burstScale : 1.0

        // -- Breathing rings --
        for i in 0..<3 {
            let baseRadius: CGFloat = [120, 95, 72][i]
            let baseOpacity: Float = Float([0.06, 0.10, 0.15][i])
            let phaseOffset = Double(i) * 0.33

            // Smooth sine wave — never resets
            let breathe = CGFloat(sin((time * 0.3 * speedMultiplier + phaseOffset) * .pi * 2))
            let radius = (baseRadius + breathe * 6 * intensityMultiplier) * burstFactor
            let opacity = (baseOpacity + Float(breathe) * 0.04 * Float(intensityMultiplier)) * Float(burstOpacity)

            let lineWidth: CGFloat = state == .scanning ? 2.0 : 1.0
            let rect = CGRect(
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            )
            var path = Circle().path(in: rect)
            context.stroke(
                path,
                with: .color(Color.pfPrimary.opacity(Double(opacity))),
                lineWidth: lineWidth
            )
        }

        // -- Inner radial glow --
        let glowPulse = CGFloat(0.5 + 0.5 * sin(time * 0.5 * speedMultiplier * .pi * 2))
        let glowRadius: CGFloat = (90 + glowPulse * 10) * burstFactor
        let glowRect = CGRect(
            x: center.x - glowRadius,
            y: center.y - glowRadius,
            width: glowRadius * 2,
            height: glowRadius * 2
        )
        context.fill(
            Circle().path(in: glowRect),
            with: .color(Color.pfPrimary.opacity(0.04 + glowPulse * 0.06 * intensityMultiplier))
        )

        // -- Radar sweep arc --
        let sweepSpeed = state == .scanning ? 1.2 : 0.4
        let sweepAngle = Angle.degrees(time * 360 * sweepSpeed)
        // Draw as a thin wedge
        for step in 0..<20 {
            let frac = Double(step) / 20.0
            let angle = sweepAngle - .degrees(frac * 90) // 90-degree trail
            let dist: CGFloat = 105 * burstFactor
            let x = center.x + cos(angle.radians) * dist
            let y = center.y + sin(angle.radians) * dist
            let dotSize: CGFloat = state == .scanning ? 3.0 : 2.0
            let opacity = (1.0 - frac) * (state == .scanning ? 0.35 : 0.12)
            let dotRect = CGRect(x: x - dotSize/2, y: y - dotSize/2, width: dotSize, height: dotSize)
            context.fill(
                Circle().path(in: dotRect),
                with: .color(Color.pfPrimary.opacity(opacity * Double(burstOpacity)))
            )
        }

        // -- Floating particles --
        for particle in particles {
            let drift = particlePosition(particle, time: time, speedMultiplier: speedMultiplier, burstFactor: burstFactor)
            let x = center.x + drift.x
            let y = center.y + drift.y
            let pRect = CGRect(
                x: x - particle.size/2,
                y: y - particle.size/2,
                width: particle.size,
                height: particle.size
            )
            context.fill(
                Circle().path(in: pRect),
                with: .color(Color.pfPrimary.opacity(drift.opacity * Double(burstOpacity)))
            )
        }

        // -- Compass tick marks --
        let tickRotation = time * 4 * (state == .scanning ? 3 : 1) // slow rotation in degrees
        for i in 0..<12 {
            let angle = Angle.degrees(Double(i) * 30 + tickRotation)
            let isMajor = i % 3 == 0
            let dist: CGFloat = 108 * burstFactor
            let length: CGFloat = isMajor ? 8 : 5
            let width: CGFloat = isMajor ? 1.5 : 0.8
            let opacity = (isMajor ? 0.25 : 0.1) * Double(burstOpacity)

            let outerX = center.x + cos(angle.radians) * dist
            let outerY = center.y + sin(angle.radians) * dist
            let innerX = center.x + cos(angle.radians) * (dist - length)
            let innerY = center.y + sin(angle.radians) * (dist - length)

            var tickPath = Path()
            tickPath.move(to: CGPoint(x: innerX, y: innerY))
            tickPath.addLine(to: CGPoint(x: outerX, y: outerY))
            context.stroke(
                tickPath,
                with: .color(Color.pfPrimary.opacity(opacity)),
                lineWidth: width
            )
        }
    }

    // MARK: - Center Icon

    private var centerIcon: some View {
        let scale: CGFloat = state == .scanning ? 1.15 : (state == .success ? 1.3 : 1.0)
        return ZStack {
            Circle()
                .fill(Color.pfPrimary.opacity(state == .success ? 0.25 : 0.1))
                .frame(width: 72, height: 72)

            Image(systemName: state == .success ? "checkmark" : (state == .scanning ? "wave.3.right" : "mappin.and.ellipse"))
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(state == .success ? .white : Color.pfPrimary)
                .contentTransition(.symbolEffect(.replace))
        }
        .frame(width: 72, height: 72)
        .background(
            Circle()
                .fill(state == .success ? Color.pfPrimary : Color.clear)
        )
        .clipShape(Circle())
        .scaleEffect(scale * (state == .success ? burstScale * 0.5 + 0.5 : 1.0))
        .animation(.spring(response: 0.4, dampingFraction: 0.6), value: state)
    }

    // MARK: - Particle Helpers

    private func particlePosition(_ p: ScanParticle, time: Double, speedMultiplier: Double, burstFactor: CGFloat) -> (x: CGFloat, y: CGFloat, opacity: Double) {
        // Continuous looping — uses modular arithmetic, no resets
        let phase = (time * 0.08 * speedMultiplier * Double(p.speed) + Double(p.phaseOffset))
            .truncatingRemainder(dividingBy: 1.0)
        let currentAngle = p.angle + phase * .pi * 0.6
        let dist = (p.distance + CGFloat(phase) * 35) * burstFactor

        let x = cos(currentAngle) * dist
        let y = sin(currentAngle) * dist

        // Fade curve: fade in from center, fade out at edges
        let normalized = dist / (130 * burstFactor)
        let opacity = min(1, normalized * 2.5) * max(0, 1 - normalized)
        let stateOpacity = state == .scanning ? 0.55 : 0.3
        return (x, y, opacity * stateOpacity)
    }

    private func generateParticles() {
        guard particles.isEmpty else { return }
        particles = (0..<20).map { _ in
            ScanParticle(
                angle: Double.random(in: 0...(2 * .pi)),
                distance: CGFloat.random(in: 35...85),
                size: CGFloat.random(in: 2...5),
                speed: CGFloat.random(in: 0.4...1.2),
                phaseOffset: CGFloat.random(in: 0...1)
            )
        }
    }

    // MARK: - Success Burst

    private func triggerSuccessBurst() {
        // Flash
        withAnimation(.easeOut(duration: 0.2)) {
            flashOpacity = 0.5
        }
        // Burst outward
        withAnimation(.easeOut(duration: 0.7)) {
            burstScale = 2.2
            burstOpacity = 0.0
        }
        // Flash fade
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            withAnimation(.easeOut(duration: 0.5)) {
                flashOpacity = 0.0
            }
        }
    }
}

// MARK: - Particle Model

private struct ScanParticle: Identifiable {
    let id = UUID()
    let angle: Double
    let distance: CGFloat
    let size: CGFloat
    let speed: CGFloat
    let phaseOffset: CGFloat
}

// MARK: - Preview

#Preview("Idle") {
    AnimatedScanView(state: .idle)
        .frame(width: 280, height: 280)
        .padding()
}

#Preview("Scanning") {
    AnimatedScanView(state: .scanning)
        .frame(width: 280, height: 280)
        .padding()
}
