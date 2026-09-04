# tauri-plugin-pointfinder-secure-store

Encrypted key-value store for the few secrets the PointFinder app keeps on the phone
(auth tokens, refresh token, device id).

| Platform | Backing store |
| --- | --- |
| iOS | Keychain generic-password items, `AfterFirstUnlockThisDeviceOnly` (not restored to other devices) |
| Android | AES-256-GCM with a non-exportable Android Keystore key; ciphertext in a private `SharedPreferences` file |
| Desktop (`tauri dev` only) | plain JSON file in the app data dir, **not** encrypted |

JS API (`tauri-plugin-pointfinder-secure-store-api`): `get(key)`, `set(key, value)`, `remove(key)`, `clear()`, `keys()`.
A value that can no longer be decrypted (lost Keystore key) reads as `null` and is dropped.
