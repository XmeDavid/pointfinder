import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { brandMark } from "@/generated/brandMark";
import { BrandLockup, BrandMark, BrandTile } from "./BrandMark";

describe("BrandMark", () => {
  it("draws the generated master path and names itself PointFinder", () => {
    render(<BrandMark size={32} />);
    const mark = screen.getByRole("img", { name: "PointFinder" });
    expect(mark).toHaveAttribute("viewBox", "0 0 512 512");
    expect(mark).toHaveAttribute("width", "32");
    expect(mark.querySelector("path")).toHaveAttribute("d", brandMark.path);
    expect(brandMark.path.startsWith("M 256 66")).toBe(true);
  });

  it("uses the semantic brand color by default and inherits currentColor when asked", () => {
    const { container } = render(
      <>
        <BrandMark />
        <BrandMark tone="current" />
      </>,
    );
    const [brand, current] = Array.from(container.querySelectorAll("svg"));
    expect(brand.className.baseVal).toContain("text-brand");
    expect(current.className.baseVal).not.toContain("text-brand");
    expect(current).toHaveAttribute("fill", "currentColor");
  });

  it("is hidden from assistive technology when decorative", () => {
    const { container } = render(<BrandMark decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("never emits ids, so repeated inline use cannot duplicate title or description ids", () => {
    const { container } = render(
      <>
        <BrandMark />
        <BrandMark />
        <BrandLockup />
        <BrandTile />
      </>,
    );
    expect(container.querySelectorAll("[id]")).toHaveLength(0);
    expect(container.querySelectorAll("title, desc")).toHaveLength(0);
  });
});

describe("BrandLockup and BrandTile", () => {
  it("announces the brand once through the wordmark", () => {
    render(<BrandLockup />);
    expect(screen.getByText("PointFinder")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps the reversed mark on the brand tile at the launcher placement", () => {
    const { container } = render(<BrandTile size={50} />);
    const tile = container.querySelector('[data-brand="tile"]') as HTMLElement;
    expect(tile.className).toContain("bg-brand-tile");
    expect(tile.querySelector("svg")).toHaveAttribute("width", "40");
    expect(screen.getByRole("img", { name: "PointFinder" })).toBeInTheDocument();
  });
});
