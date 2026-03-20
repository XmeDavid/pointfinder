import { useState, useRef, useCallback, useEffect } from "react";

const MAX_BLOB_CACHE = 50;

/**
 * Caches blob URLs keyed by their API path so that thumbnails and
 * full-screen viewers can share already-fetched images.
 *
 * Uses LRU eviction when the cache exceeds MAX_BLOB_CACHE entries and
 * revokes every remaining blob URL on unmount.
 */
export function useBlobCache() {
  const cacheRef = useRef<Map<string, string>>(new Map());
  const [fullScreenImage, setFullScreenImage] = useState<{ apiUrl: string; blobUrl?: string } | null>(null);

  const cacheBlobUrl = useCallback((apiUrl: string, blobUrl: string) => {
    const cache = cacheRef.current;

    // If this key already exists, delete it so the re-insert moves it to the end (most-recent).
    if (cache.has(apiUrl)) {
      cache.delete(apiUrl);
    }

    cache.set(apiUrl, blobUrl);

    // LRU eviction: remove the oldest entry when we exceed the limit.
    if (cache.size > MAX_BLOB_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        const oldUrl = cache.get(oldest);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        cache.delete(oldest);
      }
    }
  }, []);

  const openFullScreen = useCallback((apiUrl: string) => {
    setFullScreenImage({ apiUrl, blobUrl: cacheRef.current.get(apiUrl) });
  }, []);

  const closeFullScreen = useCallback(() => {
    setFullScreenImage(null);
  }, []);

  // Revoke all cached blob URLs on unmount.
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      cache.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
      cache.clear();
    };
  }, []);

  return { fullScreenImage, cacheBlobUrl, openFullScreen, closeFullScreen };
}
