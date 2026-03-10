import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "@/routes";
import { useAuthStore } from "@/hooks/useAuth";
import { ErrorBoundary, AppErrorFallback } from "@/components/common/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: false,
    },
  },
});

// Clear all cached query data when the user logs out, so the next
// login never shows stale data from a different account.
useAuthStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    queryClient.clear();
  }
});

function App() {
  return (
    <ErrorBoundary fallback={<AppErrorFallback />}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
