import { useState, useEffect } from "react";
import apiClient from "@/lib/api/client";

interface AuthImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** The API file URL path (e.g. /api/games/{gameId}/files/{filename}) */
  src: string | undefined | null;
  /** If provided, skip the fetch and use this blob URL directly. */
  initialBlobUrl?: string | null;
  /** Called when the blob URL is created, so the parent can cache it. */
  onBlobReady?: (blobUrl: string) => void;
}

/**
 * An <img> component that fetches images through the authenticated API client,
 * then displays them as blob URLs. This is necessary because the file serving
 * endpoints require JWT authentication, which plain <img src=...> tags can't provide.
 *
 * Use `initialBlobUrl` to skip re-fetching when the blob was already loaded
 * elsewhere (e.g. thumbnail -> fullscreen).
 */
export function AuthImage({ src, alt, initialBlobUrl, onBlobReady, ...props }: AuthImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(initialBlobUrl ?? null);

  useEffect(() => {
    // If an initial blob URL was provided, use it directly — no fetch needed.
    if (initialBlobUrl) {
      setBlobUrl(initialBlobUrl);
      return;
    }

    if (!src) return;

    let objectUrl: string | null = null;

    apiClient
      .get(src, { responseType: "blob" })
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data);
        setBlobUrl(objectUrl);
        onBlobReady?.(objectUrl);
      })
      .catch(() => {
        // If fetch fails, fall back to direct URL (may work for legacy /uploads/ paths)
        setBlobUrl(src);
      });

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
    // onBlobReady intentionally omitted from deps — the callback identity
    // shouldn't trigger a re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, initialBlobUrl]);

  if (!blobUrl) return null;

  return <img src={blobUrl} alt={alt} {...props} />;
}
