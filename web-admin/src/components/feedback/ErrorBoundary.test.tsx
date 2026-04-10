import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary, AppErrorFallback } from "./ErrorBoundary";

// Suppress React error boundary console.error noise in tests
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function ThrowingChild({ message }: { message: string }) {
  throw new Error(message);
}

function GoodChild() {
  return <div>All good</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeDefined();
  });

  it("renders default fallback when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild message="test error" />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong. Please refresh the page.")).toBeDefined();
  });

  it("renders custom fallback when provided and child throws", () => {
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <ThrowingChild message="test error" />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Custom error UI")).toBeDefined();
  });

  it("logs the caught error to console.error", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild message="logged error" />
      </ErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalled();
  });
});

describe("AppErrorFallback", () => {
  it("renders heading and reload button", () => {
    render(<AppErrorFallback />);
    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(screen.getByText("An unexpected error occurred. Please reload the page.")).toBeDefined();
    expect(screen.getByRole("button", { name: /reload/i })).toBeDefined();
  });
});
