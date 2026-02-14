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

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeApiImagePath(rawSrc: string): string {
  const src = rawSrc.trim();

  // Keep absolute URLs untouched (axios will bypass baseURL for these).
  if (isAbsoluteHttpUrl(src)) {
    return src;
  }

  // Legacy format: /uploads/{gameId}/{filename} -> /games/{gameId}/files/{filename}
  const legacyUploadMatch = src.match(/^\/uploads\/([^/]+)\/([^/]+)$/i);
  if (legacyUploadMatch) {
    const [, gameId, filename] = legacyUploadMatch;
    return `/games/${gameId}/files/${filename}`;
  }

  // Normalize player file URL into operator endpoint for admin/operator sessions.
  const playerFileMatch = src.match(/^\/api\/player\/files\/([^/]+)\/([^/]+)$/i);
  if (playerFileMatch) {
    const [, gameId, filename] = playerFileMatch;
    return `/games/${gameId}/files/${filename}`;
  }

  // apiClient baseURL already includes /api, so drop the duplicate prefix.
  if (src.startsWith("/api/")) {
    return src.slice(4);
  }

  return src;
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

    if (!src) {
      setBlobUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    const normalizedSrc = normalizeApiImagePath(src);

    apiClient
      .get(normalizedSrc, { responseType: "blob" })
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data);
        setBlobUrl(objectUrl);
        onBlobReady?.(objectUrl);
      })
      .catch(() => {
        // Avoid unauthenticated fallback for protected API routes.
        // Keep direct fallback only for absolute URLs that may be public assets.
        if (isAbsoluteHttpUrl(normalizedSrc) && !normalizedSrc.includes("/api/")) {
          setBlobUrl(normalizedSrc);
          return;
        }
        setBlobUrl(null);
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
