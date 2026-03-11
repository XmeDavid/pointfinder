import CoreLocation
import SwiftUI

// MARK: - Heading provider

/// Reads the device magnetometer heading via CLLocationManager.
/// Falls back to a slow auto-rotation when heading is unavailable (e.g. Simulator).
private class HeadingProvider: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var heading: Double? = nil
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        if CLLocationManager.headingAvailable() {
            manager.startUpdatingHeading()
        }
    }

    deinit {
        manager.stopUpdatingHeading()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard newHeading.headingAccuracy >= 0 else { return }
        // Negate so compass north points upward when facing north
        heading = -newHeading.magneticHeading
    }
}

// MARK: - Compass rose view

/// Animated compass rose matching the web landing page.
/// Uses the device magnetometer when available, otherwise auto-rotates.
struct CompassRoseView: View {
    @StateObject private var headingProvider = HeadingProvider()
    @State private var fallbackRotation: Double = 0
    @State private var pulse0: CGFloat = 0
    @State private var pulse1: CGFloat = 0
    @State private var pulse2: CGFloat = 0

    private var rotation: Double {
        headingProvider.heading ?? fallbackRotation
    }

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)

            ZStack {
                // Sonar pulse rings
                PulseRing(progress: pulse0, size: size)
                PulseRing(progress: pulse1, size: size)
                PulseRing(progress: pulse2, size: size)

                // Glow
                Circle()
                    .fill(Color.compassGreen.opacity(0.04))
                    .frame(width: size * 1.5, height: size * 1.5)
                    .blur(radius: 40)

                // Compass SVG content
                Canvas { ctx, canvasSize in
                    let cx = canvasSize.width / 2
                    let cy = canvasSize.height / 2
                    let u = canvasSize.width / 200 // unit scale

                    // Outer rings
                    ctx.stroke(
                        Circle().path(in: CGRect(x: cx - 96 * u, y: cy - 96 * u, width: 192 * u, height: 192 * u)),
                        with: .color(Color.compassGreen.opacity(0.15)),
                        lineWidth: 0.5 * u
                    )
                    ctx.stroke(
                        Circle().path(in: CGRect(x: cx - 90 * u, y: cy - 90 * u, width: 180 * u, height: 180 * u)),
                        with: .color(Color.compassGreen.opacity(0.1)),
                        lineWidth: 0.4 * u
                    )

                    // Tick marks
                    for i in 0..<36 {
                        let angle = Double(i * 10) * .pi / 180
                        let isMajor = i % 9 == 0
                        let isMinor = i % 3 == 0 && !isMajor
                        let r1 = 90.0 * u
                        let r2 = (isMajor ? 78.0 : isMinor ? 83.0 : 86.0) * u
                        let sw = (isMajor ? 1.6 : isMinor ? 0.8 : 0.4) * u
                        let alpha = isMajor ? 0.6 : isMinor ? 0.3 : 0.15

                        var tick = Path()
                        tick.move(to: CGPoint(x: cx + r1 * sin(angle), y: cy - r1 * cos(angle)))
                        tick.addLine(to: CGPoint(x: cx + r2 * sin(angle), y: cy - r2 * cos(angle)))
                        ctx.stroke(tick, with: .color(Color.compassGreen.opacity(alpha)), lineWidth: sw)
                    }

                    // Intercardinal diamond
                    var diamond = Path()
                    diamond.move(to: CGPoint(x: cx, y: cy - 42 * u))
                    diamond.addLine(to: CGPoint(x: cx - 24 * u, y: cy))
                    diamond.addLine(to: CGPoint(x: cx, y: cy + 42 * u))
                    diamond.addLine(to: CGPoint(x: cx + 24 * u, y: cy))
                    diamond.closeSubpath()
                    ctx.stroke(diamond, with: .color(Color.compassGreen.opacity(0.1)), lineWidth: 0.5 * u)

                    // Rose petals — North (bright)
                    ctx.fill(trianglePath(cx: cx, cy: cy, u: u, tip: CGPoint(x: 0, y: -52), left: CGPoint(x: -7, y: 0), right: CGPoint(x: 7, y: 0)), with: .color(Color.compassGreenDark.opacity(0.85)))
                    ctx.fill(trianglePath(cx: cx, cy: cy, u: u, tip: CGPoint(x: 0, y: -52), left: CGPoint(x: 0, y: 0), right: CGPoint(x: -7, y: 0)), with: .color(Color.compassGreen.opacity(0.6)))

                    // South (dim)
                    ctx.fill(trianglePath(cx: cx, cy: cy, u: u, tip: CGPoint(x: 0, y: 52), left: CGPoint(x: -7, y: 0), right: CGPoint(x: 7, y: 0)), with: .color(Color.compassGreenDark.opacity(0.3)))
                    ctx.fill(trianglePath(cx: cx, cy: cy, u: u, tip: CGPoint(x: 0, y: 52), left: CGPoint(x: 0, y: 0), right: CGPoint(x: 7, y: 0)), with: .color(Color.compassGreenDeep.opacity(0.2)))

                    // East
                    ctx.fill(trianglePath(cx: cx, cy: cy, u: u, tip: CGPoint(x: 52, y: 0), left: CGPoint(x: 0, y: -7), right: CGPoint(x: 0, y: 7)), with: .color(Color.compassGreenDark.opacity(0.3)))
                    ctx.fill(trianglePath(cx: cx, cy: cy, u: u, tip: CGPoint(x: 52, y: 0), left: CGPoint(x: 0, y: 0), right: CGPoint(x: 0, y: -7)), with: .color(Color.compassGreen.opacity(0.2)))

                    // West
                    ctx.fill(trianglePath(cx: cx, cy: cy, u: u, tip: CGPoint(x: -52, y: 0), left: CGPoint(x: 0, y: -7), right: CGPoint(x: 0, y: 7)), with: .color(Color.compassGreenDark.opacity(0.3)))
                    ctx.fill(trianglePath(cx: cx, cy: cy, u: u, tip: CGPoint(x: -52, y: 0), left: CGPoint(x: 0, y: 0), right: CGPoint(x: 0, y: 7)), with: .color(Color.compassGreen.opacity(0.2)))

                    // Cardinal labels
                    let fontSize = 10.0 * u
                    drawCardinal(ctx: ctx, text: "N", x: cx, y: cy - 60 * u, fontSize: fontSize, alpha: 0.7)
                    drawCardinal(ctx: ctx, text: "S", x: cx, y: cy + 70 * u, fontSize: fontSize, alpha: 0.45)
                    drawCardinal(ctx: ctx, text: "W", x: cx - 67 * u, y: cy, fontSize: fontSize, alpha: 0.45)
                    drawCardinal(ctx: ctx, text: "E", x: cx + 67 * u, y: cy, fontSize: fontSize, alpha: 0.45)

                    // Centre dot
                    let outerDot = Circle().path(in: CGRect(x: cx - 5 * u, y: cy - 5 * u, width: 10 * u, height: 10 * u))
                    ctx.fill(outerDot, with: .color(Color.compassGreen.opacity(0.8)))
                    let innerDot = Circle().path(in: CGRect(x: cx - 2.5 * u, y: cy - 2.5 * u, width: 5 * u, height: 5 * u))
                    ctx.fill(innerDot, with: .color(Color.compassCenter))
                }
                .frame(width: size, height: size)
                .rotationEffect(.degrees(rotation))
                .animation(.spring(response: 0.4, dampingFraction: 0.6), value: rotation)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .aspectRatio(1, contentMode: .fit)
        .onAppear {
            // Only start fallback rotation if no heading sensor
            if !CLLocationManager.headingAvailable() {
                withAnimation(.linear(duration: 120).repeatForever(autoreverses: false)) {
                    fallbackRotation = 360
                }
            }
            withAnimation(.easeOut(duration: 4).repeatForever(autoreverses: false)) {
                pulse0 = 1
            }
            withAnimation(.easeOut(duration: 4).repeatForever(autoreverses: false).delay(1.5)) {
                pulse1 = 1
            }
            withAnimation(.easeOut(duration: 4).repeatForever(autoreverses: false).delay(3.0)) {
                pulse2 = 1
            }
        }
    }

    private func trianglePath(cx: CGFloat, cy: CGFloat, u: CGFloat, tip: CGPoint, left: CGPoint, right: CGPoint) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: cx + tip.x * u, y: cy + tip.y * u))
        p.addLine(to: CGPoint(x: cx + left.x * u, y: cy + left.y * u))
        p.addLine(to: CGPoint(x: cx + right.x * u, y: cy + right.y * u))
        p.closeSubpath()
        return p
    }

    private func drawCardinal(ctx: GraphicsContext, text: String, x: CGFloat, y: CGFloat, fontSize: CGFloat, alpha: Double) {
        let resolved = ctx.resolve(Text(text)
            .font(.system(size: fontSize, weight: .bold))
            .foregroundColor(Color.compassGreen.opacity(alpha)))
        ctx.draw(resolved, at: CGPoint(x: x, y: y), anchor: .center)
    }
}

private struct PulseRing: View {
    let progress: CGFloat
    let size: CGFloat

    var body: some View {
        Circle()
            .stroke(Color.compassGreen.opacity(0.2), lineWidth: 1)
            .frame(width: size, height: size)
            .scaleEffect(1 + progress * 1.2)
            .opacity(Double(0.25 * (1 - progress)))
    }
}

// MARK: - Compass colours

extension Color {
    static let compassGreen = Color(red: 0x22 / 255.0, green: 0xC5 / 255.0, blue: 0x5E / 255.0)
    static let compassGreenDark = Color(red: 0x16 / 255.0, green: 0xA3 / 255.0, blue: 0x4A / 255.0)
    static let compassGreenDeep = Color(red: 0x0D / 255.0, green: 0x5F / 255.0, blue: 0x2D / 255.0)
    static let compassCenter = Color(red: 0x06 / 255.0, green: 0x0B / 255.0, blue: 0x06 / 255.0)
}

#Preview {
    CompassRoseView()
        .padding(40)
        .background(.black)
}
