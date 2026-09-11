import { useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ArtworkProps = {
  src: string;
  /** Accessible description while the picture is available. */
  alt: string;
  className?: string;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  fetchPriority?: "high" | "low" | "auto";
  width?: number;
  height?: number;
};

/** Optional marketing artwork disappears when unavailable; section copy remains. */
export function Artwork({
  src,
  alt,
  className,
  loading = "lazy",
  fetchPriority,
  width,
  height,
}: ArtworkProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return null;

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      width={width}
      height={height}
      onError={() => setFailedSrc(src)}
      className={cn("max-w-full", className)}
    />
  );
}
