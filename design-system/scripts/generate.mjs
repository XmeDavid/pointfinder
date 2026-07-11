import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ds = resolve(root, 'design-system')
const tokens = JSON.parse(await readFile(resolve(ds, 'tokens.json'), 'utf8'))
const iconCatalog = JSON.parse(await readFile(resolve(ds, 'icons.json'), 'utf8'))
const scenarios = JSON.parse(await readFile(resolve(ds, 'scenarios.json'), 'utf8'))
const check = process.argv.includes('--check')

const outputs = new Map()
const header = (source) => `// Generated from design-system/${source}. Do not edit.\n`
const cssName = (path) => `--pf-${path.replaceAll('.', '-')}`
const safePart = (part) => /^\d/.test(part) ? `space${part}` : part
const swiftName = (path) => path.split('.').map((raw, index) => { const part = safePart(raw); return index ? part[0].toUpperCase() + part.slice(1) : part }).join('')
const swiftIdentifier = (value) => new Set(['default', 'operator', 'repeat', 'switch', 'case']).has(value) ? `\`${value}\`` : value
const kotlinName = (path) => path.split('.').map((raw) => { const part = safePart(raw); return part[0].toUpperCase() + part.slice(1) }).join('')

function leaves(node, prefix = '') {
  const result = []
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && '$value' in value) result.push([path, value.$value, value.$type ?? node.$type])
    else if (value && typeof value === 'object') result.push(...leaves(value, path))
  }
  return result
}

const themeLeaves = (theme) => leaves(tokens.color[theme]).map(([path, value]) => [`color.${path}`, value])
const sharedLeaves = leaves(tokens).filter(([path]) => !path.startsWith('color.light.') && !path.startsWith('color.dark.'))
const cssValue = (value) => typeof value === 'object' && 'value' in value ? `${value.value}${value.unit}` : String(value)

const lightCss = themeLeaves('light').map(([path, value]) => `  ${cssName(path)}: ${value};`).join('\n')
const darkCss = themeLeaves('dark').map(([path, value]) => `  ${cssName(path)}: ${value};`).join('\n')
const sharedCss = sharedLeaves.filter(([, value]) => typeof value !== 'object' || 'value' in value).map(([path, value]) => `  ${cssName(path)}: ${cssValue(value)};`).join('\n')
const shadowCss = Object.entries(tokens.elevation).filter(([key]) => !key.startsWith('$')).map(([key, token]) => { const value = token.$value; return `  --pf-elevation-${key}: ${value.offsetX} ${value.offsetY} ${value.blur} ${value.spread} ${value.color};` }).join('\n')
const foundationCss = `  --pf-font-family-ui: ${tokens.font.family.ui.$value.map((v) => JSON.stringify(v)).join(', ')};\n  --pf-font-family-mono: ${tokens.font.family.mono.$value.map((v) => JSON.stringify(v)).join(', ')};\n  --pf-motion-easing-standard: cubic-bezier(${tokens.motion.easing.standard.$value.join(', ')});\n  --pf-motion-easing-exit: cubic-bezier(${tokens.motion.easing.exit.$value.join(', ')});`
outputs.set('web-admin/src/generated/design-tokens.css', `/* Generated from design-system/tokens.json. Do not edit. */\n:root {\n${lightCss}\n${sharedCss}\n${shadowCss}\n${foundationCss}\n}\n.dark {\n${darkCss}\n}\n`)

const tokenPaths = [...themeLeaves('light').map(([path]) => path), ...sharedLeaves.map(([path]) => path)]
outputs.set('web-admin/src/generated/designTokens.ts', `${header('tokens.json')}export const designTokens = ${JSON.stringify(tokens, null, 2)} as const\nexport const tokenPaths = ${JSON.stringify(tokenPaths, null, 2)} as const\nexport type DesignTokenPath = (typeof tokenPaths)[number]\nexport const designSystemVersion = ${JSON.stringify(tokens.$extensions.pointfinder.version)} as const\n`)
outputs.set('web-admin/src/generated/colorValues.ts', `${header('tokens.json')}export const dataColors = ${JSON.stringify(Object.fromEntries(leaves(tokens.dataColor).map(([path, value]) => [path, value])), null, 2)} as const\nexport const lightColorValues = ${JSON.stringify(Object.fromEntries(themeLeaves('light').map(([path, value]) => [path.replace('color.', ''), value])), null, 2)} as const\nexport const darkColorValues = ${JSON.stringify(Object.fromEntries(themeLeaves('dark').map(([path, value]) => [path.replace('color.', ''), value])), null, 2)} as const\n`)
const concepts = Object.keys(iconCatalog.icons)
outputs.set('web-admin/src/generated/iconCatalog.ts', `${header('icons.json')}export const semanticIconCatalog = ${JSON.stringify(iconCatalog.icons, null, 2)} as const\nexport type SemanticIcon = ${concepts.map((v) => JSON.stringify(v)).join(' | ')}\n`)
outputs.set('web-admin/src/generated/previewScenarios.ts', `${header('scenarios.json')}export const previewScenarios = ${JSON.stringify(scenarios.scenarios, null, 2)} as const\nexport type PreviewScenarioId = (typeof previewScenarios)[number]['id']\n`)

const swiftColors = themeLeaves('light').map(([path]) => {
  const light = themeLeaves('light').find(([p]) => p === path)[1]
  const dark = themeLeaves('dark').find(([p]) => p === path)[1]
  return `    static let ${swiftName(path.replace('color.', ''))} = Color.pfAdaptive(light: "${light}", dark: "${dark}")`
}).join('\n')
const dimGroups = ['space', 'dimension', 'radius']
const swiftDims = dimGroups.map((group) => {
  const members = leaves(tokens[group]).map(([path, value]) => `    static let ${swiftName(path)}: CGFloat = ${value.value}`).join('\n')
  return `enum PF${group[0].toUpperCase() + group.slice(1)}Token {\n${members}\n}`
}).join('\n\n')
outputs.set('ios-app/dbv-nfc-games/App/Theme/GeneratedDesignTokens.swift', `${header('tokens.json')}import SwiftUI\n#if canImport(UIKit)\nimport UIKit\n#endif\n\nextension Color {\n    fileprivate static func pfAdaptive(light: String, dark: String) -> Color {\n#if canImport(UIKit)\n        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(pfHex: dark) : UIColor(pfHex: light) })\n#else\n        Color(light)\n#endif\n    }\n}\n#if canImport(UIKit)\nprivate extension UIColor {\n    convenience init(pfHex: String) {\n        let value = UInt64(pfHex.dropFirst().prefix(6), radix: 16) ?? 0\n        self.init(red: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: pfHex.count == 9 ? CGFloat(UInt64(pfHex.suffix(2), radix: 16) ?? 255) / 255 : 1)\n    }\n}\n#endif\n\nenum PFColorToken {\n${swiftColors}\n}\n\n${swiftDims}\n\nenum PFTypographyToken {\n    static let meta = Font.caption\n    static let label = Font.subheadline.weight(.medium)\n    static let body = Font.body\n    static let section = Font.headline\n    static let title = Font.title2.weight(.semibold)\n}\n\nenum PFMotionToken {\n    static let fast = 0.12\n    static let standard = 0.20\n    static let deliberate = 0.32\n    static let standardAnimation = Animation.timingCurve(0.2, 0, 0, 1, duration: standard)\n}\n\nenum PFBreakpointToken {\n    static let tablet: CGFloat = 768\n    static let desktop: CGFloat = 1024\n    static let wide: CGFloat = 1440\n}\n\nenum PFMapToken {\n    static let baseMarker: CGFloat = 32\n    static let selectedBaseMarker: CGFloat = 40\n    static let teamMarker: CGFloat = 28\n    static let staleAfter: TimeInterval = 120\n}\n\nstruct PFShadowToken {\n    let color: Color\n    let radius: CGFloat\n    let x: CGFloat\n    let y: CGFloat\n    static let panel = PFShadowToken(color: .black.opacity(0.06), radius: 2, x: 0, y: 1)\n    static let overlay = PFShadowToken(color: .black.opacity(0.24), radius: 32, x: 0, y: 12)\n}\n\nstruct PFComponentStyle {\n    static let minimumTouchTarget = PFDimensionToken.touchTarget\n    static let panelRadius = PFRadiusToken.md\n    static let sheetRadius = PFRadiusToken.lg\n}\n`)
const swiftColorValueMembers = (entries, indent = '    ') => entries.map(([path, value]) => `${indent}static let ${swiftName(path.replace('color.', ''))} = "${value}"`).join('\n')
outputs.set('ios-app/dbv-nfc-games/App/Theme/GeneratedColorValues.swift', `${header('tokens.json')}enum PFDataColorToken {\n${swiftColorValueMembers(leaves(tokens.dataColor))}\n}\n\nenum PFColorHexToken {\n    enum Light {\n${swiftColorValueMembers(themeLeaves('light'), '        ')}\n    }\n    enum Dark {\n${swiftColorValueMembers(themeLeaves('dark'), '        ')}\n    }\n}\n`)
outputs.set('ios-app/dbv-nfc-games/App/Theme/GeneratedIconCatalog.swift', `${header('icons.json')}enum PFSemanticIcon: String, CaseIterable {\n${concepts.map((v) => `    case ${swiftName(v)}`).join('\n')}\n\n    var systemName: String {\n        switch self {\n${concepts.map((v) => `        case .${swiftName(v)}: "${iconCatalog.icons[v].sfSymbol}"`).join('\n')}\n        }\n    }\n}\n`)
outputs.set('ios-app/dbv-nfc-games/App/Theme/GeneratedPreviewScenarios.swift', `${header('scenarios.json')}enum PFPreviewScenario: String, CaseIterable, Identifiable {\n${scenarios.scenarios.map((v) => `    case ${swiftIdentifier(swiftName(v.id))}`).join('\n')}\n\n    var id: String { rawValue }\n}\n`)

const kotlinColors = themeLeaves('light').map(([path]) => {
  const toComposeHex = (hex) => { const raw = hex.slice(1); return raw.length === 8 ? `${raw.slice(6)}${raw.slice(0, 6)}` : `FF${raw}` }
  const light = toComposeHex(themeLeaves('light').find(([p]) => p === path)[1])
  const dark = toComposeHex(themeLeaves('dark').find(([p]) => p === path)[1])
  const name = kotlinName(path.replace('color.', ''))
  return `    val ${name}Light = Color(0x${light})\n    val ${name}Dark = Color(0x${dark})`
}).join('\n')
const ktDims = (group) => leaves(tokens[group]).map(([path, value]) => `    val ${kotlinName(path)} = ${value.value}.dp`).join('\n')
outputs.set('android-app/app/src/main/res/values/generated_design_colors.xml', `<!-- Generated from design-system/tokens.json. Do not edit. -->\n<resources>\n    <color name="pf_seed">${tokens.color.light.action.primary.$value}</color>\n</resources>\n`)
outputs.set('android-app/app/src/main/java/com/prayer/pointfinder/ui/theme/GeneratedDesignTokens.kt', `${header('tokens.json')}package com.prayer.pointfinder.ui.theme\n\nimport androidx.compose.animation.core.CubicBezierEasing\nimport androidx.compose.ui.graphics.Color\nimport androidx.compose.ui.unit.dp\nimport androidx.compose.ui.unit.sp\n\nobject PFColors {\n${kotlinColors}\n}\n\nobject PFSpacingToken {\n${ktDims('space')}\n}\n\nobject PFDimensionToken {\n${ktDims('dimension')}\n}\n\nobject PFRadiusToken {\n${ktDims('radius')}\n}\n\nobject PFTypographyToken {\n    val Meta = 12.sp\n    val Label = 14.sp\n    val Body = 16.sp\n    val Section = 18.sp\n    val Title = 24.sp\n}\n\nobject PFMotionToken {\n    const val FastMillis = 120\n    const val StandardMillis = 200\n    const val DeliberateMillis = 320\n    val StandardEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)\n}\n\nobject PFBreakpointToken {\n    val Tablet = 768.dp\n    val Desktop = 1024.dp\n    val Wide = 1440.dp\n}\n\nobject PFMapToken {\n    val BaseMarker = 32.dp\n    val SelectedBaseMarker = 40.dp\n    val TeamMarker = 28.dp\n    const val StaleAfterSeconds = 120\n}\n\ndata class PFShadowToken(val color: Color, val blurDp: Float, val xDp: Float, val yDp: Float) {\n    companion object {\n        val Panel = PFShadowToken(Color.Black.copy(alpha = 0.06f), 2f, 0f, 1f)\n        val Overlay = PFShadowToken(Color.Black.copy(alpha = 0.24f), 32f, 0f, 12f)\n    }\n}\n\nobject PFComponentStyle {\n    val MinimumTouchTarget = PFDimensionToken.TouchTarget\n    val PanelRadius = PFRadiusToken.Md\n    val SheetRadius = PFRadiusToken.Lg\n}\n`)
const kotlinColorValueMembers = (entries, indent = '    ') => entries.map(([path, value]) => `${indent}const val ${kotlinName(path.replace('color.', ''))} = "${value}"`).join('\n')
outputs.set('android-app/app/src/main/java/com/prayer/pointfinder/ui/theme/GeneratedColorValues.kt', `${header('tokens.json')}package com.prayer.pointfinder.ui.theme\n\nobject PFDataColorToken {\n${kotlinColorValueMembers(leaves(tokens.dataColor))}\n}\n\nobject PFColorHexToken {\n    object Light {\n${kotlinColorValueMembers(themeLeaves('light'), '        ')}\n    }\n    object Dark {\n${kotlinColorValueMembers(themeLeaves('dark'), '        ')}\n    }\n}\n`)
outputs.set('android-app/app/src/main/java/com/prayer/pointfinder/ui/theme/GeneratedIconCatalog.kt', `${header('icons.json')}package com.prayer.pointfinder.ui.theme\n\nenum class PFSemanticIcon(val materialName: String) {\n${concepts.map((v) => `    ${v.replace(/([A-Z])/g, '_$1').toUpperCase()}("${iconCatalog.icons[v].material}")`).join(',\n')}\n}\n`)
outputs.set('android-app/app/src/main/java/com/prayer/pointfinder/ui/theme/GeneratedPreviewScenarios.kt', `${header('scenarios.json')}package com.prayer.pointfinder.ui.theme\n\nenum class PFPreviewScenario {\n${scenarios.scenarios.map((v) => `    ${v.id.replace(/([A-Z])/g, '_$1').toUpperCase()}`).join(',\n')}\n}\n`)

let stale = false
for (const [declaredRelative, declaredContent] of outputs) {
  const relative = declaredRelative
    .replace('android-app/app/src/main/java/com/prayer/pointfinder/ui/theme/', 'android-app/core/designsystem/src/main/kotlin/com/prayer/pointfinder/core/designsystem/')
  const content = declaredRelative.startsWith('android-app/app/')
    ? declaredContent.replace('package com.prayer.pointfinder.ui.theme', 'package com.prayer.pointfinder.core.designsystem')
    : declaredContent
  const target = resolve(root, relative)
  if (check) {
    const current = await readFile(target, 'utf8').catch(() => '')
    if (current !== content) { console.error(`stale: ${relative}`); stale = true }
  } else {
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
    console.log(`generated ${relative}`)
  }
}
if (stale) process.exitCode = 1
