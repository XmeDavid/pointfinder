import { create } from "zustand";

export interface OperatorPresence {
  id: string;
  name: string;
  initials: string;
}

interface OperatorPresenceState {
  operators: OperatorPresence[];
  setOperators: (operators: OperatorPresence[]) => void;
  clear: () => void;
}

export const useOperatorPresenceStore = create<OperatorPresenceState>((set) => ({
  operators: [],
  setOperators: (operators) => set({ operators }),
  clear: () => set({ operators: [] }),
}));
