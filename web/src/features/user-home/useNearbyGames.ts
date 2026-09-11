import { useEffect, useRef, useState } from "react";
import { watchLocation } from "@/platform/geolocation";

/** A single opt-in location fix, used by the nearby discovery query. */
export function useNearbyGames() {
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState<
    "idle" | "requesting" | "ready" | "denied" | "unavailable"
  >("idle");
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      cleanup.current?.();
    },
    [],
  );
  async function locate() {
    cleanup.current?.();
    const current = ++generation.current;
    setStatus("requesting");
    let finished = false;
    const stop = await watchLocation(
      (position) => {
        if (current !== generation.current || finished) return;
        finished = true;
        setOrigin([position.coords.longitude, position.coords.latitude]);
        setStatus("ready");
        cleanup.current?.();
      },
      (state) => {
        if (current !== generation.current || finished) return;
        if (state === "denied" || state === "unavailable") {
          finished = true;
          setStatus(state);
          cleanup.current?.();
        }
      },
    );
    if (finished || current !== generation.current) stop();
    else cleanup.current = stop;
  }
  return { status, origin, locate };
}
