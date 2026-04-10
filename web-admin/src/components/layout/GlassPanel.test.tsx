import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GlassPanel } from "./GlassPanel";

describe("GlassPanel", () => {
  it("renders children", () => {
    render(<GlassPanel>Hello world</GlassPanel>);
    expect(screen.getByText("Hello world")).toBeDefined();
  });

  it("applies custom className alongside defaults", () => {
    const { container } = render(
      <GlassPanel className="p-4">Content</GlassPanel>,
    );
    const el = container.firstElementChild!;
    expect(el.className).toContain("backdrop-blur-xl");
    expect(el.className).toContain("p-4");
  });

  it("has backdrop-blur and border styling", () => {
    const { container } = render(<GlassPanel>Styled</GlassPanel>);
    const el = container.firstElementChild!;
    expect(el.className).toContain("backdrop-blur-xl");
    expect(el.className).toContain("border");
    expect(el.className).toContain("rounded-xl");
  });

  it("forwards ref to the root div", () => {
    let refNode: HTMLDivElement | null = null;
    render(
      <GlassPanel ref={(node) => { refNode = node; }}>Ref test</GlassPanel>,
    );
    expect(refNode).toBeInstanceOf(HTMLDivElement);
  });

  it("spreads additional HTML attributes", () => {
    render(<GlassPanel data-testid="glass">Attr test</GlassPanel>);
    expect(screen.getByTestId("glass")).toBeDefined();
  });
});
