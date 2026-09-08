# PointFinder device bridge

Small Tauri mobile plugin for the native share sheet, safe areas, and application lifecycle.
The shared frontend uses `web/src/platform/share.ts`, `safeArea.ts`, and `lifecycle.ts`; feature
modules should not invoke the plugin directly.

The welcome compass uses `web/src/platform/orientation.ts` to share one scoped
`start_orientation()` / `stop_orientation()` subscription to `orientation`
events: `{ heading: number | null, pitch: number, roll: number }`, in degrees.
Heading is clockwise from magnetic north. iOS uses heading-only Core Location
(no location authorization or position updates) plus Core Motion at 30 Hz;
Android uses the rotation vector at approximately 30 Hz, remapped to the screen.
Both stop sensors while backgrounded and on explicit stop. No sensor data is
stored or sent over the network. The frontend stops the subscription on reduced
motion and unmount, unwraps heading across north, and falls back to a slow idle
turn when heading is unavailable. Browser and desktop need no sensor permission.
Validate physical heading, tilt direction and background/resume on real phones;
browser E2E checks cannot verify the sensor hardware.

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
