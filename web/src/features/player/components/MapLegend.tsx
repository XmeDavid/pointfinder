import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Info, X } from "lucide-react";
import { Button, StatusMarker, baseStatusMarkerTone } from "@/components";
const statuses = [
  "not_visited",
  "checked_in",
  "submitted",
  "completed",
] as const;
/** Initially explains the markers, then yields the map back to the player. */
export function MapLegend() {
  const { t } = useTranslation(undefined, { keyPrefix: "playerApp" });
  const [open, setOpen] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!open || pinned || hovered || focused) return;
    const timer = window.setTimeout(() => setOpen(false), 6500);
    return () => clearTimeout(timer);
  }, [open, pinned, hovered, focused]);
  return (
    <div
      data-tour="player-legend"
      className="min-w-0"
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key="legend"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.3 }}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-overlay"
          >
            <ul
              className="flex flex-wrap gap-x-3 gap-y-1 text-xs"
              aria-label={t("map.legend")}
            >
              {statuses.map((s) => (
                <li key={s} className="flex items-center gap-1">
                  <StatusMarker tone={baseStatusMarkerTone[s]} size={8} />
                  <span>{t(`status.${s}`)}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={t("map.hideLegend")}
              onClick={() => { setOpen(false); setPinned(false); }}
            >
              <X size={16} />
            </Button>
          </motion.div>
        ) : (
          <Button
            key="toggle"
            variant="outline"
            size="sm"
            className="min-h-11 gap-2"
            aria-expanded={false}
            onClick={() => {
              setPinned(true);
              setOpen(true);
            }}
          >
            <Info size={16} />
            {t("map.legend")}
          </Button>
        )}
      </AnimatePresence>
    </div>
  );
}
