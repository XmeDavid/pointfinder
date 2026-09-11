import { useEffect, useState } from "react";
import { create } from "zustand";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CoachBubble } from "@/components/tour/CoachBubble";
import { Spotlight } from "@/components/tour/Spotlight";
const steps = [
  {
    key: "map",
    target: '[data-tour="player-header"]',
    pose: "step-explore-mascot-v2.webp",
  },
  {
    key: "base",
    target: '[data-tour="player-base"]',
    pose: "step-checkin-mascot-v2.webp",
  },
  {
    key: "logbook",
    target: '[data-testid="player-logbook-btn"]',
    pose: "step-plan-mascot-v2.webp",
  },
  {
    key: "documents",
    target: '[data-testid="player-documents-btn"]',
    pose: "step-plan-mascot-v2.webp",
  },
  {
    key: "messages",
    target: '[data-testid="player-inbox-btn"]',
    pose: "guide-pointing-mascot-v2.webp",
  },
  {
    key: "settings",
    target: '[data-testid="player-settings-btn"]',
    pose: "step-checkin-mascot-v2.webp",
  },
  {
    key: "location",
    target: '[data-tour="player-locate"]',
    pose: "step-explore-mascot-v2.webp",
  },
  {
    key: "legend",
    target: '[data-tour="player-legend"]',
    pose: "guide-pointing-mascot-v2.webp",
  },
  {
    key: "sync",
    target: '[data-tour="player-sync"]',
    pose: "step-checkin-mascot-v2.webp",
  },
  {
    key: "back",
    target: '[data-testid="player-back-btn"]',
    pose: "guide-pointing-mascot-v2.webp",
  },
] as const;
// Local guidance state only: no game mutation and no blocking of play.
// eslint-disable-next-line react-refresh/only-export-components
export const usePlayerTour = create<{
  index: number | null;
  start: () => void;
  close: () => void;
  next: () => void;
}>((set) => ({
  index: null,
  start: () => set({ index: 0 }),
  close: () => set({ index: null }),
  next: () =>
    set((s) => ({
      index:
        s.index !== null && s.index < steps.length - 1 ? s.index + 1 : null,
    })),
}));
export function PlayerTour() {
  const { t } = useTranslation(undefined, { keyPrefix: "playerApp.tour" });
  const location = useLocation();
  const { index, close, next } = usePlayerTour();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = index === null ? null : steps[index];
  useEffect(() => {
    if (!step) return;
    function measure() {
      const el = document.querySelector(step!.target);
      const box = el?.getBoundingClientRect();
      setRect(box && box.width && box.height ? box : null);
    }
    measure();
    const timer = window.setInterval(measure, 500);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [step, location.pathname]);
  useEffect(() => {
    if (location.pathname !== "/" && location.pathname !== "/play/session")
      close();
  }, [location.pathname, close]);
  useEffect(() => {
    if (index === null) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [index, close]);
  if (!step || index === null) return null;
  return (
    <>
      <Spotlight rect={rect} />
      <CoachBubble
        title={t(`${step.key}.title`)}
        body={t(`${step.key}.body`)}
        artwork={`/landing/illustrated/${step.pose}`}
        step={index + 1}
        total={steps.length}
        anchorRect={rect}
        onAck={next}
        onClose={close}
        isLast={index === steps.length - 1}
      />
    </>
  );
}
