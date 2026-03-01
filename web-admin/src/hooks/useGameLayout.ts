import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LayoutMode = "classic" | "setup" | "monitor" | "review";

interface GameLayoutState {
  layouts: Record<string, LayoutMode>;
  setLayout: (gameId: string, mode: LayoutMode) => void;
  getLayout: (gameId: string) => LayoutMode;
}

export const useGameLayoutStore = create<GameLayoutState>()(
  persist(
    (set, get) => ({
      layouts: {},
      setLayout: (gameId, mode) =>
        set((state) => ({ layouts: { ...state.layouts, [gameId]: mode } })),
      getLayout: (gameId) => get().layouts[gameId] ?? "classic",
    }),
    {
      name: "pointfinder-game-layouts",
    }
  )
);
