import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AuthImage } from "@/components/AuthImage";

interface FullScreenMediaViewerProps {
  /** The image to display, or null when closed. */
  image: { apiUrl: string; blobUrl?: string } | null;
  /** Called when the viewer should close. */
  onClose: () => void;
}

/**
 * A full-screen dialog for viewing submission images.
 * Reuses an already-fetched blob URL when available to avoid a redundant download.
 */
export function FullScreenMediaViewer({ image, onClose }: FullScreenMediaViewerProps) {
  return (
    <Dialog open={!!image} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl p-2" onClose={onClose}>
        {image && (
          <AuthImage
            src={image.apiUrl}
            initialBlobUrl={image.blobUrl}
            alt="Submission photo"
            className="w-full h-auto max-h-[85vh] object-contain rounded"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
