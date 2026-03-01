import { useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useGameLayoutStore } from "@/hooks/useGameLayout";
import { SetupLayout } from "./layouts/SetupLayout";
import { MonitorLayout } from "./layouts/MonitorLayout";
import { ReviewLayout } from "./layouts/ReviewLayout";
import { BroadcastLayout } from "./layouts/BroadcastLayout";
import type { GameStatus } from "@/types";

export function AppShell({ gameStatus }: { gameStatus?: GameStatus }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { gameId } = useParams<{ gameId: string }>();
  const { getLayout } = useGameLayoutStore();
  const layout = gameId ? getLayout(gameId) : "classic";

  if (layout === "setup" && gameId) {
    return <SetupLayout gameId={gameId} gameStatus={gameStatus} />;
  }
  if (layout === "monitor" && gameId) {
    return <MonitorLayout gameId={gameId} gameStatus={gameStatus} />;
  }
  if (layout === "review" && gameId) {
    return <ReviewLayout gameId={gameId} gameStatus={gameStatus} />;
  }
  if (layout === "broadcast" && gameId) {
    return <BroadcastLayout gameId={gameId} gameStatus={gameStatus} />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        gameStatus={gameStatus}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header
          onMenuToggle={() => setSidebarOpen((o) => !o)}
          gameId={gameId}
          gameStatus={gameStatus}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
