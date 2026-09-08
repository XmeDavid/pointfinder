// Format/size conversion only. Art is generated separately, never composited here.
import sharp from '/Users/xmedavid/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.cjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
for (const name of ['hero', 'forest-footer', 'guide-pointing', 'step-plan', 'step-explore', 'step-checkin', 'workspace-preview']) {
  const path = `${root}source/${name}.png`;
  if (!existsSync(path)) continue;
  const width = name === 'hero' || name === 'forest-footer' || name === 'workspace-preview' ? 1536 : 800;
  const info = await sharp(path).resize({ width, withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 100 }).toFile(`${root}../../web/public/landing/illustrated/${name}.webp`);
  console.log(name, info.width, info.height, Math.round(info.size / 1024) + 'KB');
}
