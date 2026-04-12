import SwiftUI

/// Animated NFC scan illustration with breathing rings, radar sweep,
/// floating particles, and a pulsing center icon. Responds to scan state.
struct AnimatedScanView: View {
    let isScanning: Bool

    // MARK: - Animation State

    @State private var breathePhase: CGFloat = 0
    @State private var sweepAngle: Double = 0
    @State private var particlePhase: CGFloat = 0
    @State private var iconScale: CGFloat = 1.0
    @State private var glowOpacity: CGFloat = 0.0

    // Particle positions (generated once)
    @State private var particles: [Particle] = []

    private struct Particle: Identifiable {
        let id = UUID()
        let angle: Double      // radians
        let distance: CGFloat  // from center
        let size: CGFloat
        let speed: CGFloat     // drift speed multiplier
        let phaseOffset: CGFloat
    }

    var body: some View {
        ZStack {
            // MARK: — Breathing rings (3 layers, staggered phase)
            ForEach(0..<3, id: \.self) { i in
                let baseSize: CGFloat = [240, 190, 145][i]
                let baseOpacity: Double = [0.04, 0.07, 0.12][i]
                let offset = CGFloat(i) * 0.33

                Circle()
                    .stroke(
                        Color.pfPrimary.opacity(baseOpacity + breatheOffset(offset) * 0.06),
                        lineWidth: isScanning ? 2 : 1
                    )
                    .frame(
                        width: baseSize + breatheOffset(offset) * 12,
                        height: baseSize + breatheOffset(offset) * 12
                    )
                    .opacity(0.6 + breatheOffset(offset) * 0.4)
            }

            // MARK: — Inner filled circle (soft glow base)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.pfPrimary.opacity(0.15),
                            Color.pfPrimary.opacity(0.03),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 10,
                        endRadius: 100
                    )
                )
                .frame(width: 200, height: 200)
                .scaleEffect(1.0 + breatheOffset(0) * 0.05)

            // MARK: — Radar sweep (rotating arc)
            Circle()
                .trim(from: 0, to: 0.25)
                .stroke(
                    AngularGradient(
                        colors: [
                            Color.pfPrimary.opacity(isScanning ? 0.4 : 0.15),
                            Color.clear
                        ],
                        center: .center
                    ),
                    lineWidth: isScanning ? 3 : 2
                )
                .frame(width: 210, height: 210)
                .rotationEffect(.degrees(sweepAngle))

            // MARK: — Floating particles
            ForEach(particles) { particle in
                let drift = particleDrift(particle)
                Circle()
                    .fill(Color.pfPrimary.opacity(drift.opacity))
                    .frame(width: particle.size, height: particle.size)
                    .offset(x: drift.x, y: drift.y)
                    .blur(radius: particle.size > 4 ? 1 : 0)
            }

            // MARK: — Tick marks (compass-inspired, subtle)
            ForEach(0..<12, id: \.self) { i in
                let angle = Double(i) * 30.0
                let isMajor = i % 3 == 0
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color.pfPrimary.opacity(isMajor ? 0.25 : 0.1))
                    .frame(width: isMajor ? 2 : 1, height: isMajor ? 10 : 6)
                    .offset(y: -108)
                    .rotationEffect(.degrees(angle + sweepAngle * 0.1))
            }

            // MARK: — Center glow
            Circle()
                .fill(Color.pfPrimary.opacity(glowOpacity))
                .frame(width: 80, height: 80)
                .blur(radius: 20)

            // MARK: — Center icon
            ZStack {
                Circle()
                    .fill(Color.pfPrimary.opacity(0.12))
                    .frame(width: 72, height: 72)

                Image(systemName: isScanning ? "wave.3.right" : "mappin.and.ellipse")
                    .font(.system(size: 32, weight: .medium))
                    .foregroundStyle(Color.pfPrimary)
                    .contentTransition(.symbolEffect(.replace))
            }
            .scaleEffect(iconScale)
        }
        .onAppear {
            generateParticles()
            startAnimations()
        }
        .onChange(of: isScanning) {
            withAnimation(.easeInOut(duration: 0.4)) {
                iconScale = isScanning ? 1.1 : 1.0
            }
        }
    }

    // MARK: - Animation Helpers

    private func breatheOffset(_ phaseOffset: CGFloat) -> CGFloat {
        sin((breathePhase + phaseOffset) * .pi * 2)
    }

    private struct ParticleDrift {
        let x: CGFloat
        let y: CGFloat
        let opacity: Double
    }

    private func particleDrift(_ p: Particle) -> ParticleDrift {
        let phase = (particlePhase * p.speed + p.phaseOffset).truncatingRemainder(dividingBy: 1.0)
        let currentAngle = p.angle + Double(phase) * .pi * 0.5
        let drift = p.distance + phase * 30
        let x = cos(currentAngle) * drift
        let y = sin(currentAngle) * drift
        // Fade in from center, fade out at edges
        let normalizedDist = drift / 130
        let opacity = min(1, normalizedDist * 2) * max(0, 1 - normalizedDist)
        return ParticleDrift(x: x, y: y, opacity: opacity * (isScanning ? 0.6 : 0.35))
    }

    private func generateParticles() {
        particles = (0..<18).map { _ in
            Particle(
                angle: Double.random(in: 0...(2 * .pi)),
                distance: CGFloat.random(in: 40...90),
                size: CGFloat.random(in: 2.5...5.5),
                speed: CGFloat.random(in: 0.3...1.0),
                phaseOffset: CGFloat.random(in: 0...1)
            )
        }
    }

    private func startAnimations() {
        // Breathing — slow, organic cycle
        withAnimation(.easeInOut(duration: 3.5).repeatForever(autoreverses: true)) {
            breathePhase = 1.0
        }

        // Radar sweep — continuous rotation
        withAnimation(.linear(duration: isScanning ? 2.5 : 8).repeatForever(autoreverses: false)) {
            sweepAngle = 360
        }

        // Particle drift — continuous
        withAnimation(.linear(duration: 12).repeatForever(autoreverses: false)) {
            particlePhase = 1.0
        }

        // Icon glow pulse
        withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) {
            glowOpacity = 0.2
        }
    }
}

#Preview {
    VStack(spacing: 40) {
        AnimatedScanView(isScanning: false)
            .frame(width: 260, height: 260)

        AnimatedScanView(isScanning: true)
            .frame(width: 260, height: 260)
    }
}
