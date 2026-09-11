import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

const subscribe = (notify: () => void) => onlineManager.subscribe(notify);
const snapshot = () => onlineManager.isOnline();
/** Match query/mutation connectivity, including their reconnect handling. */
export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
