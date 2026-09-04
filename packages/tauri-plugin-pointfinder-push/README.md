# tauri-plugin-pointfinder-push

Push notifications for the PointFinder mobile app. APNs on iOS, FCM on Android.
Local plugin, not published.

`register()` returns `{ token, platform }`, which is what the backend's
`/api/player/push-token` and `/api/users/me/push-token` endpoints expect.

## iOS

Tauri owns the app delegate, so the plugin attaches the two APNs registration
callbacks to the delegate's class at runtime. They are added only when the
delegate does not implement them, which holds for Tauri's delegate. The
notification centre delegate is owned by the plugin, which handles foreground
banners and taps.

App requirements: the Push Notifications capability (`aps-environment` in the
entitlements) and the `remote-notification` background mode if silent pushes are
ever needed.

Known gap: a tap that cold-starts the app is delivered only if the notification
centre delegate is installed before the system calls it. The plugin installs it
during `load`, which is early but not guaranteed. Verify on device during the spike.

## Android

The plugin declares its own `FirebaseMessagingService` in its manifest, which
merges into the app. The app must apply the Google Services Gradle plugin and
ship `google-services.json` under `src-tauri/gen/android/app/`. Without it,
`register()` rejects with `unavailable` and everything else keeps working.

Background messages of the "notification" kind are shown by the system and their
tap reaches `consumeLaunchTap()` or the `notificationTap` event. Foreground
messages arrive through the `notification` event only, so the app decides how to
show them.

`requestPermission()` covers `POST_NOTIFICATIONS` on Android 13 and later.
