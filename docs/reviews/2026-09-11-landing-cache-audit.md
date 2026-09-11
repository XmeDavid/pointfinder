# Landing artwork and cache audit — 2026-09-11

Public checks around 18:48–18:52 UTC:

- Both https://pointfinder.pt and https://pointfinder.ch serve the same HTML (SHA-256 prefix aa808f5ba313dd56), referencing index-B2on392U.js and index-NPUqS6gX.css. HTML Last-Modified: 2026-09-10 14:27:59 GMT. This is a file timestamp, not proof of a Git commit.
- All seven /landing/illustrated/*.webp files on .pt match the repository byte for byte.
- .pt /sw.js is a Cloudflare HIT with cache revision pointfinder-shell-9d9f9934a8800437, whose asset list does not match that HTML. A unique query URL returns revision pointfinder-shell-96866f0b1b0a1b6f, matching .ch and the HTML. This establishes an edge-cache mismatch independently of any phone cache.
- /sw.js carries public, max-age=31536000, immutable. It must not be cached this way.
- A nonexistent .webp returns HTTP 200, text/html and max-age=14400. The SPA fallback must not answer image requests.
- The screenshot matches the Artwork component's explicit image-error description panel. It does not establish what caused the original image failure.
- Dokploy API and direct SSH inspection timed out. The running container commit and intended release have not been verified. No production changes or cache purges were performed.

## Local changes

Artwork errors and empty sources omit the image, including its dimensions/margins, instead of displaying a description panel. Empty workspace screenshot chrome is hidden. Tests and component documentation follow the changed behavior.

Both production nginx configurations now give /sw.js no-store, index.html no-cache, hashed /assets/ long-lived caching, and stable public files no-cache. WebP/AVIF requests return 404 when missing instead of SPA HTML.

## Release and cache invalidation

1. Release the reviewed frontend fix and nginx configuration through the normal deployment path. Keep this scoped: the working tree contains substantial unrelated pending product work.
2. Purge the exact Cloudflare URLs https://pointfinder.pt/sw.js and https://pointfinder.ch/sw.js after the new headers are live. Purge affected image URLs as well if they have cached HTML or old content. Do not use a site-wide purge unnecessarily.
3. Verify ordinary (no query string) sw.js responses match the release's HTML asset references on both domains, and check headers and missing-image 404 behavior.
4. Existing service workers wait for controlled tabs to close before activating. After online update retrieval, close every PointFinder tab/installed PWA window and reopen. A plain reload may still use the old worker. Avoid clearing all site data: that can delete sign-in state and queued offline player actions.
5. For changed artwork already held in a browser HTTP cache, use a new filename/content-hashed URL; changing server headers or purging Cloudflare cannot retract an already-fresh browser response.

An exact deployment comparison requires the intended commit plus the running image/revision metadata. A successful deployment dashboard status alone is insufficient.
