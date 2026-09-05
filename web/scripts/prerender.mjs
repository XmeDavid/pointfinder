import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

async function prerender() {
  const { render, routes } = await import(
    path.resolve(distDir, "server", "entry-server.js")
  );

  const template = fs.readFileSync(
    path.resolve(distDir, "index.html"),
    "utf-8",
  );

  // Save original SPA shell as fallback for non-pre-rendered routes
  fs.copyFileSync(
    path.resolve(distDir, "index.html"),
    path.resolve(distDir, "__spa.html"),
  );

  for (const route of routes) {
    const { html, head } = await render(route);

    let page = template;

    // Inject rendered HTML into root div
    page = page.replace(
      '<div id="root"></div>',
      `<div id="root">${html}</div>`,
    );

    // Replace meta tags with pre-rendered ones
    page = page.replace("<title>PointFinder</title>", "");
    page = page.replace(
      '<meta name="description" content="PointFinder - Manage your PointFinder games, teams, and events from the admin dashboard." />',
      head,
    );

    // Determine output path
    const outputPath =
      route === "/"
        ? path.resolve(distDir, "index.html")
        : path.resolve(distDir, route.slice(1), "index.html");

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, page);

    console.log(`  Pre-rendered: ${route}`);
  }

  // Clean up SSR bundle (not needed at runtime)
  fs.rmSync(path.resolve(distDir, "server"), { recursive: true, force: true });

  console.log(`  SPA fallback: __spa.html`);
}

prerender().catch((err) => {
  console.error("Pre-render failed:", err);
  process.exit(1);
});
