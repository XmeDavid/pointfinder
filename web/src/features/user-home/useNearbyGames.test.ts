import { act, renderHook, waitFor } from "@testing-library/react";
import { vi, it, expect, beforeEach } from "vitest";
import {
  watchLocation,
  type LocationPosition,
  type LocationState,
} from "@/platform/geolocation";
import { useNearbyGames } from "./useNearbyGames";
vi.mock("@/platform/geolocation", () => ({ watchLocation: vi.fn() }));
let fix: (position: LocationPosition) => void;
let state: (state: LocationState) => void;
const stop = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(watchLocation).mockImplementation(async (position, status) => {
    fix = position;
    state = status;
    return stop;
  });
});
it("requests location only on demand and stops after the first fix", async () => {
  const { result } = renderHook(() => useNearbyGames());
  expect(watchLocation).not.toHaveBeenCalled();
  await act(() => result.current.locate());
  act(() =>
    fix({
      coords: {
        longitude: -8.8708,
        latitude: 40.0797,
        accuracy: 10,
        heading: null,
      },
      timestamp: 0,
    }),
  );
  expect(result.current.status).toBe("ready");
  expect(result.current.origin).toEqual([-8.8708, 40.0797]);
  expect(stop).toHaveBeenCalledTimes(1);
  act(() =>
    fix({
      coords: { longitude: 0, latitude: 0, accuracy: 10, heading: null },
      timestamp: 1,
    }),
  );
  expect(result.current.origin).toEqual([-8.8708, 40.0797]);
});
it("keeps discovery usable when permission is denied", async () => {
  const { result } = renderHook(() => useNearbyGames());
  await act(() => result.current.locate());
  act(() => state("denied"));
  expect(result.current.status).toBe("denied");
  expect(result.current.origin).toBeNull();
  expect(stop).toHaveBeenCalled();
});
it("releases a watcher that resolves after unmount", async () => {
  let resolve!: (cleanup: () => void) => void;
  vi.mocked(watchLocation).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { result, unmount } = renderHook(() => useNearbyGames());
  act(() => {
    void result.current.locate();
  });
  unmount();
  resolve(stop);
  await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
});
