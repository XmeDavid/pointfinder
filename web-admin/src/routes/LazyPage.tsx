import React, { Suspense } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

const LoadingFallback = () => <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;

export const LazyPage = ({ component: Component }: { component: React.ComponentType }) => (
  <Suspense fallback={<LoadingFallback />}>
    <ErrorBoundary>
      <Component />
    </ErrorBoundary>
  </Suspense>
);
