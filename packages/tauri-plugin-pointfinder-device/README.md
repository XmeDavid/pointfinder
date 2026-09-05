# PointFinder device bridge

Small Tauri mobile plugin for the native share sheet, safe areas, and application lifecycle.
The shared frontend uses `web/src/platform/share.ts`, `safeArea.ts`, and `lifecycle.ts`; feature
modules should not invoke the plugin directly.

`share_file(id, name, content_type)` accepts a committed PointFinder media ID,
copies that file into the app's export cache, and invokes Android ACTION_SEND
with a FileProvider URI or iOS UIActivityViewController. It does not accept an
arbitrary source path. Receivers may read after the chooser closes, so exported
copies are retained and cleaned after 24 hours on a later share.

Android resolves `shared` when its chooser launches. iOS resolves `shared` or
`cancelled` from the activity completion callback. Neither result guarantees
delivery by a third-party service. Desktop calls return `unavailable`.

The `foreground` event carries `{ active: boolean }`. The frontend combines it
with document visibility and page lifecycle events; it does not enable background
execution or background location tracking.

`safe_area_insets()` and the `safeAreaChanged` event return
`{ top, right, bottom, left }` in CSS pixels. UIKit supplies the WebView's actual
safe area and disables automatic scroll-content insetting, leaving the map
edge to edge. Android measures system-bar and cutout overlap with the WebView,
including three-button navigation on older WebViews that return zero CSS `env()`
insets. Existing Android inset dispatch and keyboard handling remain intact.
The frontend registers for changes before its initial read, and also refreshes
on resize/foreground. Do not add these values to CSS `env()`; they replace it.

Build registration and generated permissions follow the other PointFinder native
plugins. See [validation and device checks](../../docs/native-platform-validation.md).
