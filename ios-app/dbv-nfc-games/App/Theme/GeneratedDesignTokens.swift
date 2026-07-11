// Generated from design-system/tokens.json. Do not edit.
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

extension Color {
    fileprivate static func pfAdaptive(light: String, dark: String) -> Color {
#if canImport(UIKit)
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(pfHex: dark) : UIColor(pfHex: light) })
#else
        Color(light)
#endif
    }
}
#if canImport(UIKit)
private extension UIColor {
    convenience init(pfHex: String) {
        let value = UInt64(pfHex.dropFirst().prefix(6), radix: 16) ?? 0
        self.init(red: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: pfHex.count == 9 ? CGFloat(UInt64(pfHex.suffix(2), radix: 16) ?? 255) / 255 : 1)
    }
}
#endif

enum PFColorToken {
    static let surfaceCanvas = Color.pfAdaptive(light: "#f7f8f5", dark: "#0d120f")
    static let surfacePanel = Color.pfAdaptive(light: "#ffffff", dark: "#151c17")
    static let surfaceOverlay = Color.pfAdaptive(light: "#fffffff2", dark: "#151c17f2")
    static let surfaceSubtle = Color.pfAdaptive(light: "#eef1ec", dark: "#202923")
    static let surfaceInverse = Color.pfAdaptive(light: "#18201a", dark: "#edf3ed")
    static let surfaceMap = Color.pfAdaptive(light: "#dfe5da", dark: "#101a14")
    static let surfaceScrim = Color.pfAdaptive(light: "#10171299", dark: "#000000b3")
    static let contentPrimary = Color.pfAdaptive(light: "#172019", dark: "#eef4ef")
    static let contentSecondary = Color.pfAdaptive(light: "#4f5e53", dark: "#b6c2b8")
    static let contentMuted = Color.pfAdaptive(light: "#6d796f", dark: "#93a197")
    static let contentInverse = Color.pfAdaptive(light: "#f7faf7", dark: "#152019")
    static let contentDisabled = Color.pfAdaptive(light: "#929c94", dark: "#68756b")
    static let contentDanger = Color.pfAdaptive(light: "#b4232c", dark: "#ff9298")
    static let actionPrimary = Color.pfAdaptive(light: "#16733a", dark: "#45d475")
    static let actionPrimaryStrong = Color.pfAdaptive(light: "#105c2e", dark: "#2fba61")
    static let actionOnPrimary = Color.pfAdaptive(light: "#ffffff", dark: "#072311")
    static let actionSecondary = Color.pfAdaptive(light: "#e6ece6", dark: "#253129")
    static let actionOnSecondary = Color.pfAdaptive(light: "#213027", dark: "#edf4ee")
    static let borderDefault = Color.pfAdaptive(light: "#d4dbd4", dark: "#344039")
    static let borderSubtle = Color.pfAdaptive(light: "#e5e9e4", dark: "#28322c")
    static let borderStrong = Color.pfAdaptive(light: "#849188", dark: "#68786d")
    static let focusRing = Color.pfAdaptive(light: "#16733a", dark: "#63e58d")
    static let statusLive = Color.pfAdaptive(light: "#16733a", dark: "#45d475")
    static let statusCompleted = Color.pfAdaptive(light: "#16733a", dark: "#45d475")
    static let statusCheckedIn = Color.pfAdaptive(light: "#2563c5", dark: "#72a7ff")
    static let statusPending = Color.pfAdaptive(light: "#a75b06", dark: "#ffc05a")
    static let statusRejected = Color.pfAdaptive(light: "#c8323b", dark: "#ff7f87")
    static let statusUnknown = Color.pfAdaptive(light: "#6d796f", dark: "#93a197")
    static let statusOperatorOverride = Color.pfAdaptive(light: "#6d42b8", dark: "#b797ff")
    static let visualizationChart1 = Color.pfAdaptive(light: "#3b82f6", dark: "#60a5fa")
    static let visualizationChart2 = Color.pfAdaptive(light: "#f59e0b", dark: "#fbbf24")
    static let visualizationChart3 = Color.pfAdaptive(light: "#15803d", dark: "#22c55e")
    static let visualizationChart4 = Color.pfAdaptive(light: "#a855f7", dark: "#c084fc")
    static let visualizationMapRoute = Color.pfAdaptive(light: "#6b7280", dark: "#93a197")
    static let visualizationMapCurrentLocation = Color.pfAdaptive(light: "#149cff", dark: "#72a7ff")
    static let visualizationMapMarkerStroke = Color.pfAdaptive(light: "#ffffff", dark: "#eef4ef")
    static let editorText = Color.pfAdaptive(light: "#172019", dark: "#eef4ef")
    static let editorCanvas = Color.pfAdaptive(light: "#ffffff", dark: "#151c17")
    static let editorPlaceholder = Color.pfAdaptive(light: "#6d796f", dark: "#93a197")
    static let editorDivider = Color.pfAdaptive(light: "#d4dbd4", dark: "#68786d")
    static let editorBlock = Color.pfAdaptive(light: "#eef1ec", dark: "#202923")
    static let editorVariableBackground = Color.pfAdaptive(light: "#bee3f8", dark: "#2c5282")
    static let editorVariableContent = Color.pfAdaptive(light: "#2c5282", dark: "#bee3f8")
    static let editorInvalidBackground = Color.pfAdaptive(light: "#fed7d7", dark: "#742a2a")
    static let editorInvalidContent = Color.pfAdaptive(light: "#9b2c2c", dark: "#fed7d7")
    static let editorInvalidBorder = Color.pfAdaptive(light: "#c53030", dark: "#ff7f87")
}

enum PFSpaceToken {
    static let space1: CGFloat = 4
    static let space2: CGFloat = 8
    static let space3: CGFloat = 12
    static let space4: CGFloat = 16
    static let space5: CGFloat = 20
    static let space6: CGFloat = 24
    static let space8: CGFloat = 32
}

enum PFDimensionToken {
    static let touchTarget: CGFloat = 44
    static let operatorRail: CGFloat = 56
    static let inspector: CGFloat = 384
}

enum PFRadiusToken {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 6
    static let md: CGFloat = 8
    static let lg: CGFloat = 12
    static let xl: CGFloat = 16
    static let full: CGFloat = 999
}

enum PFTypographyToken {
    static let meta = Font.caption
    static let label = Font.subheadline.weight(.medium)
    static let body = Font.body
    static let section = Font.headline
    static let title = Font.title2.weight(.semibold)
}

enum PFMotionToken {
    static let fast = 0.12
    static let standard = 0.20
    static let deliberate = 0.32
    static let standardAnimation = Animation.timingCurve(0.2, 0, 0, 1, duration: standard)
}

enum PFBreakpointToken {
    static let tablet: CGFloat = 768
    static let desktop: CGFloat = 1024
    static let wide: CGFloat = 1440
}

enum PFMapToken {
    static let baseMarker: CGFloat = 32
    static let selectedBaseMarker: CGFloat = 40
    static let teamMarker: CGFloat = 28
    static let staleAfter: TimeInterval = 120
}

struct PFShadowToken {
    let color: Color
    let radius: CGFloat
    let x: CGFloat
    let y: CGFloat
    static let panel = PFShadowToken(color: .black.opacity(0.06), radius: 2, x: 0, y: 1)
    static let overlay = PFShadowToken(color: .black.opacity(0.24), radius: 32, x: 0, y: 12)
}

struct PFComponentStyle {
    static let minimumTouchTarget = PFDimensionToken.touchTarget
    static let panelRadius = PFRadiusToken.md
    static let sheetRadius = PFRadiusToken.lg
}
