import { useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ArtworkProps = {
  src: string;
  /** Describes the picture; shown as text when the image cannot load. */
  alt: string;
  /** Short line shown above the alt text when the image fails, e.g. "Screenshot unavailable". */
  unavailableLabel?: string;
  className?: string;
  fallbackClassName?: string;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  fetchPriority?: "high" | "low" | "auto";
  width?: number;
  height?: number;
};

/**
 * A marketing image that stays readable when the file is missing or blocked:
 * the description takes the image's place instead of a broken icon.
 */
export function Artwork({
  src,
  alt,
  unavailableLabel,
  className,
  fallbackClassName,
  loading = "lazy",
  fetchPriority,
  width,
  height,
}: ArtworkProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        data-testid="landing-artwork-fallback"
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-border bg-muted p-4 text-center text-sm leading-6 text-muted-foreground",
          className,
          fallbackClassName,
        )}
      >
        <span>
          {unavailableLabel && <span className="block font-medium text-foreground">{unavailableLabel}</span>}
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      width={width}
      height={height}
      onError={() => setFailed(true)}
      className={cn("max-w-full", className)}
    />
  );
}
