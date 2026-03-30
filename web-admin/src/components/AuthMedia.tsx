import { useState, useEffect } from "react";
import apiClient from "@/lib/api/client";

const isVideo = (url: string) => /\.(mp4|mov)$/i.test(url);

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function toThumbnailPath(path: string): string {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1) return path;
  return path.substring(0, lastDot) + "_thumb.jpg";
}

function normalizeApiMediaPath(rawSrc: string): string {
  const src = rawSrc.trim();

  if (isAbsoluteHttpUrl(src)) {
    return src;
  }

  const legacyUploadMatch = src.match(/^\/uploads\/([^/]+)\/([^/]+)$/i);
  if (legacyUploadMatch) {
    const [, gameId, filename] = legacyUploadMatch;
    return `/games/${gameId}/files/${filename}`;
  }

  const playerFileMatch = src.match(/^\/api\/player\/files\/([^/]+)\/([^/]+)$/i);
  if (playerFileMatch) {
    const [, gameId, filename] = playerFileMatch;
    return `/games/${gameId}/files/${filename}`;
  }

  if (src.startsWith("/api/")) {
    return src.slice(4);
  }

  return src;
}

interface AuthMediaProps {
  src: string | undefined | null;
  alt?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  onBlobReady?: (blobUrl: string) => void;
  initialBlobUrl?: string | null;
  thumbnail?: boolean;
}

/**
 * A media component that fetches images and videos through the authenticated API client,
 * then displays them as blob URLs. Detects video files by extension (.mp4, .mov) and
 * renders a <video> element with controls; otherwise renders an <img>.
 */
export function AuthMedia({ src, alt, className, onClick, onBlobReady, initialBlobUrl, thumbnail }: AuthMediaProps) {
  const [fetchedMedia, setFetchedMedia] = useState<{ source: string; url: string } | null>(null);
  const [videoError, setVideoError] = useState(false);
  const normalizedSrc = src ? normalizeApiMediaPath(src) : null;

  useEffect(() => {
    if (initialBlobUrl || !normalizedSrc) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const srcIsVideoFile = src ? isVideo(src) : false;
    const fetchUrl = thumbnail && !srcIsVideoFile ? toThumbnailPath(normalizedSrc) : normalizedSrc;

    const doFetch = (url: string, fallbackUrl?: string) => {
      apiClient
        .get(url, { responseType: "blob" })
        .then((response) => {
          if (cancelled) {
            // Component unmounted while fetch was in-flight; do not create a blob URL
            return;
          }
          objectUrl = URL.createObjectURL(
            isVideo(normalizedSrc)
              ? new Blob([response.data], { type: "video/mp4" })
              : response.data
          );
          setFetchedMedia({ source: normalizedSrc, url: objectUrl });
          onBlobReady?.(objectUrl);
        })
        .catch(() => {
          if (cancelled) return;
          if (fallbackUrl) {
            doFetch(fallbackUrl);
            return;
          }
          if (isAbsoluteHttpUrl(normalizedSrc) && !normalizedSrc.includes("/api/")) {
            setFetchedMedia({ source: normalizedSrc, url: normalizedSrc });
          }
        });
    };

    doFetch(fetchUrl, fetchUrl !== normalizedSrc ? normalizedSrc : undefined);

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [normalizedSrc, initialBlobUrl, onBlobReady, thumbnail, src]);

  const blobUrl = initialBlobUrl ?? (normalizedSrc && fetchedMedia?.source === normalizedSrc ? fetchedMedia.url : null);

  if (!blobUrl) {
    return (
      <div
        className={className}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "hsl(var(--muted))" }}
      >
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  const srcIsVideo = src ? isVideo(src) : false;

  if (srcIsVideo) {
    if (thumbnail) {
      // For thumbnails, show the video element without controls, muted, showing the first frame
      return (
        <video
          src={blobUrl}
          className={className}
          onClick={onClick}
          muted
          preload="metadata"
          // Adding #t=0.1 to src to ensure first frame is shown as poster
          style={{ objectFit: "cover" }}
        />
      );
    }

    if (videoError) {
      return (
        <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", padding: "16px", background: "hsl(var(--muted))", borderRadius: "8px" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><polygon points="23 7 16 12 23 17 23 7" /><rect width="15" height="14" x="1" y="5" rx="2" ry="2" /></svg>
          <span style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>Video format not supported by browser</span>
          <a href={blobUrl} download style={{ fontSize: "12px", color: "hsl(var(--primary))", textDecoration: "underline" }}>Download video</a>
        </div>
      );
    }

    return (
      <video
        src={blobUrl}
        className={className}
        onClick={onClick}
        controls
        preload="metadata"
        onError={() => setVideoError(true)}
      />
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      onClick={onClick}
    />
  );
}
