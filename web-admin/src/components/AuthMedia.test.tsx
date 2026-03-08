import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { AuthMedia } from "./AuthMedia";

vi.mock("@/lib/api/client", () => ({
  default: {
    get: vi.fn(),
  },
}));

import apiClient from "@/lib/api/client";

describe("AuthMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => "blob:test-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("requests _thumb variant when thumbnail prop is true", async () => {
    const mockGet = vi.mocked(apiClient.get);
    mockGet.mockResolvedValueOnce({ data: new Blob(["img"]) });

    render(<AuthMedia src="/api/games/123/files/abc.jpg" thumbnail />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        "/games/123/files/abc_thumb.jpg",
        expect.objectContaining({ responseType: "blob" })
      );
    });
  });

  it("requests original URL when thumbnail prop is false", async () => {
    const mockGet = vi.mocked(apiClient.get);
    mockGet.mockResolvedValueOnce({ data: new Blob(["img"]) });

    render(<AuthMedia src="/api/games/123/files/abc.jpg" />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        "/games/123/files/abc.jpg",
        expect.objectContaining({ responseType: "blob" })
      );
    });
  });

  it("falls back to original on thumbnail 404", async () => {
    const mockGet = vi.mocked(apiClient.get);
    mockGet.mockRejectedValueOnce({ response: { status: 404 } });
    mockGet.mockResolvedValueOnce({ data: new Blob(["img"]) });

    render(<AuthMedia src="/api/games/123/files/abc.jpg" thumbnail />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(mockGet).toHaveBeenNthCalledWith(1, "/games/123/files/abc_thumb.jpg", expect.any(Object));
      expect(mockGet).toHaveBeenNthCalledWith(2, "/games/123/files/abc.jpg", expect.any(Object));
    });
  });
});
